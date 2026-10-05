import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import OpenAI from "openai";
import { z } from "zod";
import { transaction } from "../data/db.js";
import { ApiError } from "../errors.js";
import { contextBundle, sourceIds } from "../context.js";
import {
  strategySchema,
  replay,
  evaluate,
  strategyBranches,
  signalSide,
} from "../domain/engine.js";
import { extendedIndicators } from "../../dist/indicator-catalog.js";
import { strategySeries, instruments } from "../markets.js";
import { pricing, boundCost, outputLimit } from "./budget.js";
import { diffSetup } from "../../dist/setup-changes.js";
import { MAX_SETUP_CONDITIONS } from "../../dist/setup-limits.js";
import { availableTimeframes } from "../../dist/timeframes.js";
import { editorContextSchema, validEditorContext, inspectSetupBar } from "../domain/studio.js";
import {
  claimsDraftChange,
  requestsDraftChange,
  toolSpec,
  instrumentSearch,
} from "./completion.js";
const specialistSkills = {
  "indicator-guide": "indicator-guide.md",
  "trade-journal": "trade-journal.md",
  "risk-review": "risk-review.md",
  "research-validation": "research-validation.md",
} as const;
const selection = z
  .object({
    ruleIds: z.array(z.string().uuid()).max(12).optional(),
    importIds: z.array(z.string().uuid()).max(5).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .strict();
export function registerHarness(app: FastifyInstance, db: pg.Pool) {
  app.post("/api/v1/context", async (req) =>
    contextBundle(
      db,
      req.userId,
      selection.parse(req.body ?? {}),
      req.workspaceId,
    ),
  );
  app.post("/api/v1/conversations/:id/turns", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = z
      .object({
        text: z.string().trim().min(1).max(4000),
        mode: z.enum(["standard", "deep"]),
        draft: strategySchema.optional(),
        editorContext: editorContextSchema.optional(),
        selection: selection.optional(),
        imageIds: z.array(z.string().uuid()).max(5, "แนบได้สูงสุด 5 ภาพต่อข้อความ").default([]),
        useMyData: z.boolean().default(false),
        crop: z
          .object({
            left: z.number().int().nonnegative(),
            top: z.number().int().nonnegative(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .optional(),
      })
      .strict()
      .parse(req.body);
    if (input.editorContext && !validEditorContext(input.draft, input.editorContext))
      throw new ApiError(400, "EDITOR_CONTEXT", "บริบทกราฟไม่ตรงกับร่างปัจจุบัน กรุณาเลือกเงื่อนไขอีกครั้ง");
    // Keep the deep implementation available for later development, but block entry now.
    if (["deep"].includes(input.mode))
      throw new ApiError(
        503,
        "AI_DEEP_UNAVAILABLE",
        "โหมดวิเคราะห์ละเอียด · Pro อยู่ระหว่างพัฒนา กรุณาใช้โหมดปกติ",
      );
    if (
      !(
        await db.query(
          "SELECT 1 FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3)",
          [id, req.userId, req.workspaceId ?? null],
        )
      ).rowCount
    )
      throw new ApiError(404, "NOT_FOUND", "ไม่พบบทสนทนา");
    if (input.useMyData) {
      const library = (
        await db.query(
          "SELECT id,name FROM assets WHERE owner_id=$1 AND purpose='library' AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=assets.id AND s.owner_id=$1 AND s.kind='image' AND s.workspace_ids IS NOT NULL AND NOT ($2=ANY(s.workspace_ids)))) ORDER BY created_at ASC LIMIT 5",
          [req.userId, req.workspaceId ?? null],
        )
      ).rows;
      const names = [...input.text.matchAll(/@"([^"\n]+)"|@([^\s@]+)/g)].map(
        (match) => match[1] ?? match[2],
      );
      if (
        names.some(
          (name) =>
            !library.some(
              (image) =>
                image.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
            ),
        )
      )
        throw new ApiError(
          400,
          "IMAGE_MENTION_NOT_FOUND",
          "ไม่พบชื่อภาพที่ @ กรุณาเลือกจากข้อมูลของฉัน",
        );
      input.imageIds = [
        ...new Set([...input.imageIds, ...library.map((image) => image.id)]),
      ];
      if (input.imageIds.length > 5)
        throw new ApiError(400, "IMAGE_LIMIT", "ใช้ภาพรวมได้สูงสุด 5 ภาพต่อข้อความ รวมภาพจากข้อมูลของฉัน กรุณาลดภาพหรือปิดใช้ข้อมูลของฉัน");
      input.selection = { ruleIds: input.selection?.ruleIds };
    } else {
      // Turning personal data off is authoritative, even for callers omitting
      // selection or supplying stale import IDs. Explicit setup selections and
      // images attached to this conversation remain usable.
      input.selection = {
        ...input.selection,
        ruleIds: input.selection?.ruleIds ?? [],
        importIds: [],
      };
    }
    for (const imageId of input.imageIds)
      if (
        !(
          await db.query(
            "SELECT 1 FROM assets WHERE id=$1 AND owner_id=$2 AND ((purpose='library' AND $5::boolean) OR (purpose='chat' AND conversation_id=$4)) AND ($3::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=assets.id AND s.owner_id=$2 AND s.kind='image' AND s.workspace_ids IS NOT NULL AND NOT ($3=ANY(s.workspace_ids))))",
            [imageId, req.userId, req.workspaceId ?? null, id, input.useMyData],
          )
        ).rowCount
      )
        throw new ApiError(404, "IMAGE_NOT_FOUND", "ไม่พบภาพ");
    if (input.crop) {
      if (input.imageIds.length !== 1)
        throw new ApiError(
          400,
          "IMAGE_CROP_COUNT",
          "เลือกกรอบภาพได้เมื่อแนบภาพเดียว",
        );
      const asset = (
        await db.query(
          "SELECT metadata FROM assets WHERE id=$1 AND owner_id=$2",
          [input.imageIds[0], req.userId],
        )
      ).rows[0];
      const { left, top, width, height } = input.crop;
      if (
        !asset?.metadata?.width ||
        !asset?.metadata?.height ||
        left + width > asset.metadata.width ||
        top + height > asset.metadata.height
      )
        throw new ApiError(
          400,
          "IMAGE_CROP_BOUNDS",
          "กรอบที่เลือกอยู่นอกภาพ กรุณาเลือกบริเวณใหม่",
        );
    }
    if (!process.env.AI_API_KEY)
      throw new ApiError(
        503,
        "AI_NOT_CONFIGURED",
        "ยังไม่ได้เชื่อม AI ใช้ editor ออกแบบกฎได้",
      );
    let rate: ReturnType<typeof pricing>;
    try {
      rate = pricing(input.mode);
    } catch {
      throw new ApiError(
        503,
        "AI_COST_NOT_CONFIGURED",
        "ยังไม่ได้ตั้งค่าเพดานต้นทุน AI",
      );
    }
    const runId = randomUUID();
    const userMessageId = randomUUID();
    await transaction(db, async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      if (
        (
          await c.query(
            "SELECT 1 FROM agent_runs WHERE owner_id=$1 AND status='RUNNING' AND created_at>now()-interval '5 minutes'",
            [req.userId],
          )
        ).rowCount
      )
        throw new ApiError(429, "AGENT_BUSY", "กำลังวิเคราะห์คำขอก่อนหน้า");
      const pro = !!(
        await c.query(
          "SELECT 1 FROM entitlements WHERE owner_id=$1 AND pro_until>now()",
          [req.userId],
        )
      ).rowCount;
      const limit = input.mode === "deep" ? (pro ? 10 : 0) : pro ? 100 : 20;
      const used = Number(
        (
          await c.query(
            "SELECT count(*) AS n FROM usage_ledger WHERE owner_id=$1 AND mode=$2 AND status IN ('RESERVED','COMPLETED') AND NOT quota_waived AND created_at>=date_trunc('month',now())",
            [req.userId, input.mode],
          )
        ).rows[0].n,
      );
      if (used >= limit)
        throw new ApiError(
          429,
          "QUOTA_EXCEEDED",
          input.mode === "deep" && !pro
            ? "โหมดละเอียดสำหรับ Pro"
            : "โควตารอบนี้หมดแล้ว",
        );
      await c.query(
        "INSERT INTO usage_ledger(id,owner_id,mode,status) VALUES($1,$2,$3,'RESERVED')",
        [runId, req.userId, input.mode],
      );
      await c.query(
        "INSERT INTO agent_runs(id,owner_id,conversation_id,status) VALUES($1,$2,$3,'RUNNING')",
        [runId, req.userId, id],
      );
      await c.query(
        "INSERT INTO messages(id,conversation_id,role,content,sources) VALUES($1,$2,'user',$3,$4)",
        [
          userMessageId,
          id,
          input.text,
          JSON.stringify(input.imageIds.map((id) => ({ id, type: "image" }))),
        ],
      );
    });
    const trace: unknown[] = [];
    const deadline = AbortSignal.timeout(90000);
    try {
      const context = await contextBundle(
        db,
        req.userId,
        input.selection,
        req.workspaceId,
      );
      const skillFiles = [
        "conversation-charter.md",
        "setup-design.md",
        "clarify-v1.md",
        "logic-v1.md",
        "evidence-v1.md",
        "replay-v1.md",
        ...(input.imageIds.length ? ["image-v1.md"] : []),
      ];
      const policy = (
        await Promise.all(
          skillFiles.map((file) =>
            readFile(new URL("./skills/" + file, import.meta.url), "utf8"),
          ),
        )
      ).join("\n\n");
      trace.push({ skills: skillFiles });
      const validSources = await sourceIds(db, req.userId, req.workspaceId);
      const excludedPersonalSources = input.useMyData
        ? new Set<string>()
        : new Set(
            (
              await db.query(
                "SELECT id FROM imports WHERE owner_id=$1 UNION ALL SELECT id FROM assets WHERE owner_id=$1 AND purpose='library'",
                [req.userId],
              )
            ).rows.map((row) => row.id as string),
          );
      const history = (
        await db.query(
          "SELECT role,content,sources FROM messages WHERE conversation_id=$1 AND id<>$2 ORDER BY created_at DESC,id DESC LIMIT 10",
          [id, userMessageId],
        )
      ).rows
        .reverse()
        .filter((m) =>
          m.sources.every(
            (s: any) =>
              validSources.has(s.id) && !excludedPersonalSources.has(s.id),
          ),
        );
      const imageNames = (
        await db.query(
          "SELECT id,name FROM assets WHERE owner_id=$1 AND id=ANY($2::uuid[])",
          [req.userId, input.imageIds],
        )
      ).rows;
      const content: any[] = [
        {
          type: "input_text",
          text:
            input.text +
            "\nAttached images in order: " +
            input.imageIds
              .map(
                (imageId) =>
                  imageNames.find((r) => r.id === imageId)?.name ?? "image",
              )
              .join(", "),
        },
      ];
      for (const imageId of input.imageIds) {
        const asset = (
          await db.query("SELECT * FROM assets WHERE id=$1 AND owner_id=$2", [
            imageId,
            req.userId,
          ])
        ).rows[0];
        if (!asset) throw new ApiError(404, "IMAGE_NOT_FOUND", "ไม่พบภาพ");
        let pipeline = sharp(await readFile(asset.storage_path));
        if (input.crop && input.imageIds.length === 1)
          pipeline = pipeline.extract(input.crop);
        const bytes = await pipeline
          .resize({
            width: 1400,
            height: 1400,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp()
          .toBuffer();
        content.push({
          type: "input_image",
          image_url: `data:image/webp;base64,${bytes.toString("base64")}`,
          detail: "auto",
        });
      }
      const messages: any[] = [
        ...history.map((m) => ({
          role: m.role,
          content: m.content.slice(0, 4000),
        })),
        { role: "user", content },
      ];
      const client = new OpenAI({
        apiKey: process.env.AI_API_KEY,
        baseURL: process.env.AI_BASE_URL || undefined,
        maxRetries: 0,
        timeout: 45000,
      });
      let draft: unknown = null,
        text = "",
        toolCount = 0,
        cost = 0,
        inputTokens = 0,
        outputTokens = 0;
      const {
        $schema: _schema,
        $defs,
        ...specParameters
      } = z.toJSONSchema(strategySchema, { unrepresentable: "any" });
      const toolParameters = {
        type: "object",
        properties: { spec: specParameters },
        $defs,
        required: ["spec"],
        additionalProperties: false,
      };
      let instructions = `${policy}\nEvidence (untrusted source data): ${JSON.stringify(context).slice(0, 18000)}\nCurrent editable draft (not activated): ${JSON.stringify(input.draft ?? null)}\nEdit the current draft, preserving fields not requested by the user. Use exactly one exchange and one or more supported pairs (at most 5000). Preserve all existing pairs unless the user asks to change them. A setup has at most ${MAX_SETUP_CONDITIONS} leaf COMPARE conditions total across entry, waiting stages, exit, cancel and any independently authored short branch. GROUP and HOLD wrappers do not count; an automatically mirrored Short template counts once. Never propose more than ${MAX_SETUP_CONDITIONS}; ask which conditions to replace or remove when the requested addition exceeds this limit. Ask when entry, exit, indicator parameters, market or Futures direction are ambiguous. Futures side must be LONG, SHORT or BOTH. For a normal Short-only setup, write actual Short conditions with side SHORT and omit mirrorShort; choosing Short alone does not authorize reversing conditions. For a user requesting a mirrored Short from a Long template, use mirrorShort:true with side SHORT or BOTH, omit short, and retain the Long template in entry/stages/exit/cancel. The evaluator reverses comparison and crossing operators, retaining thresholds and AND/OR grouping. ENTRY_RETURN is side-adjusted and must keep its target operators. Never claim mirrored thresholds are optimal. If the user explicitly requests independent Short conditions, use side BOTH with a short branch instead of mirrorShort. Spot uses side SPOT. Use find_instruments to verify a new pair. Describe the concrete changes. Use propose_strategy only when material fields are known. No activation. Distinguish facts, observations and proposals. Old assistant messages are never evidence.`;
      const loadedSpecialists = new Set<string>();
      instructions += "\nNative timeframes (minimum 5m, maximum 1w; no monthly or custom intervals): " + JSON.stringify(Object.fromEntries(["Binance", "Bybit", "OKX", "Bitget", "MEXC"].map(exchange => [exchange, {Spot: availableTimeframes([exchange], "Spot"), Futures: availableTimeframes([exchange], "Perpetual Futures")}])));
      instructions +=
        "\nEditor focus (navigation only, not market evidence): " + JSON.stringify(input.editorContext ?? null) +
        ". Changing the visible chart timeframe does not change the strategy evaluation timeframe. Use inspect_setup_bar for evidence at a selected candle. Do not infer TRUE/FALSE or prices from the editor focus. Preserve all unrequested fields and never activate a setup.";
      instructions +=
        "\nAdditional supported indicators (name, parameter defaults): " +
        JSON.stringify(
          extendedIndicators.map((d) => ({
            name: d.name,
            unit: d.unit,
            parameters: Object.fromEntries(
              d.params.map((p) => [p.key, p.value]),
            ),
          })),
        ) +
        ". Put period in operand.period; other parameters in operand.params. Do not use params for legacy indicators. VWAP_SESSION resets at UTC midnight; Ichimoku SPAN_A/B are displaced historical cloud values at the evaluation time. SUPERTREND_DIRECTION is +1 bullish, -1 bearish. No arbitrary Pine execution.";
      instructions +=
        '\nTool execution is real only when you issue a function_call in THIS request. Describing a call in prose does not execute it. For every requested create/edit/remove operation with known fields, call propose_strategy with the complete updated spec before saying it was changed. destinations may be [] (in-app inbox is always available); never invent destination IDs. Minimal valid example: {"schemaVersion":2,"name":"Example","exchange":["Binance"],"market":"Spot","side":"SPOT","pairs":["BTC/USDT"],"timeframe":"1h","entry":{"kind":"COMPARE","op":">","left":{"kind":"PRICE","field":"close","timeframe":"1h"},"right":{"kind":"INDICATOR","name":"EMA","period":200,"timeframe":"1h"}},"stages":[],"cooldownBars":0,"destinations":[]}. GROUP nodes have kind GROUP, op AND/OR, children. Constants have only kind CONSTANT and value. Omit optional exit/cancel keys to remove them.';
      const maxOutputTokens = outputLimit(input.mode);
      let completed = false;
      let requireProposal = false;
      for (let round = 0; round < 7; round++) {
        if (deadline.aborted) throw new Error("REQUEST_DEADLINE");
        const inputBound = boundCost(
          instructions + JSON.stringify(toolParameters).repeat(2),
          messages,
          rate,
          0,
        );
        const roundOutputLimit = Math.min(
          maxOutputTokens,
          Math.floor(((rate.cap - cost - inputBound) * 1e6) / rate.output),
        );
        if (roundOutputLimit < 2000)
          throw new ApiError(
            422,
            "COST_BOUND",
            "ข้อมูลเกินขอบเขตงานนี้ กรุณาเลือกบริบทหรือภาพให้น้อยลง คืนโควตาแล้ว",
          );
        const response = await client.responses.create(
          {
            model:
              input.mode === "deep"
                ? (process.env.AI_DEEP_MODEL ?? "gpt-5.4")
                : (process.env.AI_STANDARD_MODEL ?? "gpt-5-mini"),
            store: false,
            max_output_tokens: roundOutputLimit,
            reasoning: { effort: input.mode === "standard" ? "low" : "medium" },
            instructions,
            input: messages,
            ...(requireProposal
              ? {
                  tool_choice: {
                    type: "function" as const,
                    name: "propose_strategy",
                  },
                }
              : round === 0 && input.draft && requestsDraftChange(input.text)
                ? { tool_choice: "required" as const }
                : {}),
            tools: [
              {
                type: "function",
                name: "read_skill",
                description:
                  "Load trusted local Snaap guidance before a specialist task. indicator-guide: indicator comparisons and setup ideas; trade-journal: selected fill history; risk-review: sizing, leverage and loss limits; research-validation: performance claims and parameter tuning. At most two distinct specialist skills per request. This provides instructions, not data or calculations.",
                parameters: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      enum: Object.keys(specialistSkills),
                    },
                  },
                  required: ["name"],
                  additionalProperties: false,
                },
                strict: true,
              },
              {
                type: "function",
                name: "find_instruments",
                description:
                  "Find real supported exchange instruments before choosing a pair. Never invent symbols.",
                parameters: {
                  type: "object",
                  properties: {
                    exchange: {
                      type: "string",
                      enum: ["Binance", "Bybit", "OKX", "Bitget", "MEXC"],
                    },
                    market: {
                      type: "string",
                      enum: ["Spot", "Perpetual Futures"],
                    },
                    query: { type: "string" },
                  },
                  required: ["exchange", "market", "query"],
                  additionalProperties: false,
                },
                strict: true,
              },
              {
                type: "function",
                name: "propose_strategy",
                description:
                  "Validate a proposed draft. This never activates a rule.",
                parameters: toolParameters,
                strict: false,
              },
              {
                type: "function",
                name: "replay_strategy",
                description:
                  "Calculate indicators and replay the draft on public closed candles of its first selected exchange and pair. No orders or profit inference.",
                parameters: toolParameters,
                strict: false,
              },
              {
                type: "function",
                name: "inspect_setup_bar",
                description: "Inspect lifecycle-aware evidence at the latest closed evaluation candle not after selectedBarTime, for the current draft and a selected pair. Uses public candles; no orders, profit or monitoring claims.",
                parameters: { type: "object", properties: { pair: { type: "string" }, selectedBarTime: { type: "integer", minimum: 0 } }, required: ["pair", "selectedBarTime"], additionalProperties: false },
                strict: true,
              },
            ],
          },
          { signal: deadline },
        );
        inputTokens += response.usage?.input_tokens ?? 0;
        outputTokens += response.usage?.output_tokens ?? 0;
        cost = (inputTokens * rate.input + outputTokens * rate.output) / 1e6;
        trace.push({
          round,
          model: response.model,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          status: response.status,
          incomplete: response.incomplete_details,
        });
        if (response.status !== "completed")
          throw new ApiError(
            502,
            "AI_INCOMPLETE",
            "AI ตอบไม่ครบ กรุณาลองใหม่ คืนโควตาแล้ว",
          );
        messages.push(...response.output);
        text = response.output_text ?? "";
        const calls = response.output.filter((x) => x.type === "function_call");
        if (!calls.length) {
          if (
            !draft &&
            requestsDraftChange(input.text) &&
            claimsDraftChange(text)
          ) {
            if (requireProposal)
              throw new ApiError(
                502,
                "AI_ACTION_MISSING",
                "AI ยังไม่ได้แก้ร่างจริง กรุณาลองใหม่ คืนโควตาแล้ว",
              );
            requireProposal = true;
            instructions +=
              "\nYour last answer claimed a completed draft change but no successful propose_strategy call happened in this request. Execute propose_strategy now using the current draft and requested edits. Do not repeat a prose success claim.";
            continue;
          }
          completed = true;
          break;
        }
        requireProposal = false;
        for (const call of calls) {
          if (++toolCount > 6) throw new Error("TOOL_BUDGET");
          let result: unknown = { error: "Unknown tool" };
          if (call.name === "read_skill") {
            let skillArguments: unknown;
            try {
              skillArguments = JSON.parse(call.arguments);
            } catch {
              skillArguments = null;
            }
            const selected = z
              .object({
                name: z.enum([
                  "indicator-guide",
                  "trade-journal",
                  "risk-review",
                  "research-validation",
                ]),
              })
              .strict()
              .safeParse(skillArguments);
            if (!selected.success) {
              result = { error: "Unknown Snaap skill" };
            } else if (loadedSpecialists.has(selected.data.name)) {
              result = { loaded: true, name: selected.data.name };
            } else if (loadedSpecialists.size >= 2) {
              result = {
                error: "Specialist skill budget reached; narrow the task",
              };
            } else {
              const file = specialistSkills[selected.data.name];
              const guidance = await readFile(
                new URL("./skills/" + file, import.meta.url),
                "utf8",
              );
              instructions +=
                "\n\nTrusted Snaap specialist guidance:\n" + guidance;
              loadedSpecialists.add(selected.data.name);
              trace.push({ skill: file });
              result = { loaded: true, name: selected.data.name };
            }
          }
          if (call.name === "find_instruments") {
            try {
              const q = z
                .object({
                  exchange: z.enum([
                    "Binance",
                    "Bybit",
                    "OKX",
                    "Bitget",
                    "MEXC",
                  ]),
                  market: z.enum(["Spot", "Perpetual Futures"]),
                  query: z.string().max(60),
                })
                .parse(JSON.parse(call.arguments));
              const catalog = await instruments(q.exchange, q.market);
              result = {
                exchange: q.exchange,
                market: q.market,
                asOf: new Date(catalog.at).toISOString(),
                items: catalog.items
                  .filter(
                    (m) =>
                      m.supported &&
                      instrumentSearch(m.symbol).includes(
                        instrumentSearch(q.query),
                      ),
                  )
                  .slice(0, 30),
              };
            } catch {
              result = {
                error:
                  "Instrument lookup unavailable. Do not guess; ask user or retry later.",
              };
            }
          }
          if (call.name === "propose_strategy") {
            draft = null;
            try {
              const candidate = toolSpec(call.arguments),
                checked = strategySchema.safeParse(candidate);
              if (checked.success) {
                draft = null;
                const ownedDestinations = new Set(
                  (
                    await db.query(
                      "SELECT id FROM destinations WHERE owner_id=$1 AND id=ANY($2::uuid[])",
                      [req.userId, checked.data.destinations],
                    )
                  ).rows.map((r) => r.id),
                );
                if (
                  checked.data.destinations.some(
                    (destination) => !ownedDestinations.has(destination),
                  )
                ) {
                  result = {
                    valid: false,
                    error:
                      "Unknown destination ID. Use destinations:[] for in-app inbox, or preserve only actual owned destination IDs.",
                  };
                  messages.push({
                    type: "function_call_output",
                    call_id: call.call_id,
                    output: JSON.stringify(result),
                  });
                  trace.push({ tool: call.name, result });
                  continue;
                }
                if (checked.data.market !== "Spot" && !checked.data.side)
                  throw new Error("Ask for Futures direction first");
                if (checked.data.exchange.length !== 1)
                  throw new Error(
                    "Select one exchange and supported pairs for this setup",
                  );
                const catalog = await instruments(
                  checked.data.exchange[0],
                  checked.data.market,
                );
                if (
                  checked.data.pairs.some(
                    (pair) =>
                      !catalog.items.some(
                        (m) => m.symbol === pair && m.supported,
                      ),
                  )
                )
                  throw new Error(
                    "Instrument unavailable. Ask user to choose a supported instrument.",
                  );
                draft = checked.data;
                result = { valid: true, activation: false };
              } else result = { valid: false, errors: checked.error.issues };
            } catch {
              result = {
                valid: false,
                error:
                  "Cannot validate draft or instrument. Select exactly one exchange and supported pairs; ask for missing details, never invent instruments.",
              };
            }
          }
          if (call.name === "inspect_setup_bar") {
            try {
              const args = z.object({ pair: z.string(), selectedBarTime: z.number().int().nonnegative() }).strict().parse(JSON.parse(call.arguments));
              const spec = strategySchema.parse(draft ?? input.draft);
              if (spec.exchange.length !== 1 || !spec.pairs.includes(args.pair)) throw new Error("Invalid target");
              const series = await strategySeries(spec, spec.exchange[0], args.pair);
              result = { source: { exchange: spec.exchange[0], market: spec.market, pair: args.pair, asOf: new Date().toISOString() }, ...inspectSetupBar(spec, series, args.selectedBarTime) };
            } catch {
              result = { error: "Cannot inspect selected bar; current draft, supported pair and closed market history are required. Do not invent evidence." };
            }
          }
          if (call.name === "replay_strategy") {
            try {
              const spec = strategySchema.parse(
                draft ?? input.draft ?? toolSpec(call.arguments),
              );
              const series = await strategySeries(
                spec,
                spec.exchange[0],
                spec.pairs[0],
              );
              const last = series[spec.timeframe]?.at(-1);
              const first = series[spec.timeframe]?.[0];
              const events = replay(spec, series);
              result = {
                source: {
                  exchange: spec.exchange[0],
                  pair: spec.pairs[0],
                  market: spec.market,
                  side:
                    spec.side ?? (spec.market === "Spot" ? "SPOT" : "UNKNOWN"),
                  timeframe: spec.timeframe,
                  asOf: new Date().toISOString(),
                },
                spec,
                coverage: {
                  bars: series[spec.timeframe]?.length ?? 0,
                  firstClosedAt: first
                    ? new Date(first.time).toISOString()
                    : null,
                  lastClosedAt: last ? new Date(last.time).toISOString() : null,
                  totalEvents: events.length,
                  returnedEvents: Math.min(20, events.length),
                  truncated: events.length > 20,
                },
                events: events.slice(-20),
                current: strategyBranches(spec).map((branch) => ({
                  side: signalSide(branch),
                  evidence: last
                    ? evaluate(
                        branch.entry,
                        series,
                        last.time,
                        spec.timeframe,
                        undefined,
                        signalSide(branch),
                      )
                    : { result: "UNKNOWN" },
                })),
                limitation: "Signal replay only; not returns or real positions",
              };
            } catch {
              result = {
                error:
                  "Cannot replay; unsupported instrument, unavailable market or invalid rule. Ask or show uncertainty.",
              };
            }
          }
          messages.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(result),
          });
          trace.push({ tool: call.name, result });
        }
      }
      if (!completed)
        throw new ApiError(
          502,
          "AI_TOOL_LIMIT",
          "AI ยังวิเคราะห์ไม่จบในขอบเขตงาน กรุณาลดขอบเขตคำขอ คืนโควตาแล้ว",
        );
      if (!text.trim())
        throw new ApiError(502, "AI_EMPTY", "AI ยังตอบไม่สำเร็จ คืนโควตาแล้ว");
      const current = await contextBundle(
        db,
        req.userId,
        input.selection,
        req.workspaceId,
      );
      const currentIds = new Map(
        current.sources.map((s) => [s.id, JSON.stringify(s)]),
      );
      const liveSources = await sourceIds(db, req.userId, req.workspaceId);
      const visibleImages = new Set(
        (
          await db.query(
            "SELECT id FROM assets WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND ($3::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=assets.id AND s.owner_id=$1 AND s.kind='image' AND s.workspace_ids IS NOT NULL AND NOT ($3=ANY(s.workspace_ids))))",
            [req.userId, input.imageIds, req.workspaceId ?? null],
          )
        ).rows.map((r) => r.id),
      );
      if (
        context.sources.some(
          (s) => currentIds.get(s.id) !== JSON.stringify(s),
        ) ||
        input.imageIds.some(
          (id) => !liveSources.has(id) || !visibleImages.has(id),
        )
      )
        throw new ApiError(
          409,
          "CONTEXT_CHANGED",
          "ข้อมูลประกอบเปลี่ยนระหว่างวิเคราะห์ กรุณาลองใหม่ คืนโควตาแล้ว",
        );
      const references = [
        ...context.sources.map((s) => ({
          id: s.id,
          type: s.type,
          asOf: s.asOf,
        })),
        ...input.imageIds.map((id) => ({
          id,
          type: "image",
          asOf: new Date().toISOString(),
        })),
      ];
      await transaction(db, async (c) => {
        await c.query(
          "INSERT INTO messages(id,conversation_id,role,content,sources,setup_changes) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            id,
            "assistant",
            text,
            JSON.stringify(references),
            JSON.stringify(draft ? diffSetup(input.draft, draft) : []),
          ],
        );
        await c.query(
          "UPDATE usage_ledger SET status='COMPLETED',input_tokens=$2,output_tokens=$3,estimated_usd=$4 WHERE id=$1",
          [runId, inputTokens, outputTokens, cost],
        );
        await c.query(
          "UPDATE agent_runs SET status='COMPLETED',trace=$2 WHERE id=$1",
          [runId, JSON.stringify(trace)],
        );
      });
      return {
        text,
        draft,
        changes: draft ? diffSetup(input.draft, draft) : [],
        sources: references,
        runId,
      };
    } catch (error) {
      trace.push({
        failure: {
          code:
            error instanceof ApiError ? error.code : "PROVIDER_OR_TOOL_FAILURE",
          status: error instanceof OpenAI.APIError ? error.status : null,
        },
      });
      const totals = (trace as any[]).reduce(
        (sum, item) => ({
          input: sum.input + (item.inputTokens ?? 0),
          output: sum.output + (item.outputTokens ?? 0),
        }),
        { input: 0, output: 0 },
      );
      await db.query(
        "UPDATE usage_ledger SET status='REFUNDED',input_tokens=$2,output_tokens=$3,estimated_usd=$4 WHERE id=$1",
        [
          runId,
          totals.input,
          totals.output,
          (totals.input * rate.input + totals.output * rate.output) / 1e6,
        ],
      );
      await db.query(
        "UPDATE agent_runs SET status='FAILED',trace=$2 WHERE id=$1",
        [runId, JSON.stringify(trace)],
      );
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        502,
        "AI_UNAVAILABLE",
        "AI ยังไม่พร้อม คืนโควตาแล้ว ลองใหม่หรือใช้ editor",
      );
    }
  });
}
