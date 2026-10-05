import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { transaction } from "./data/db.js";
import { strategySchema } from "./domain/engine.js";
import {
  buildPreset,
  describePreset,
  presets,
} from "../dist/preset-catalog.js";
import { instruments } from "./markets.js";
import { ApiError } from "./errors.js";
import { cleanupChatImages } from "./files.js";
const configSchema = z
  .object({
    presetId: z.enum([
      "trend",
      "cross",
      "momentum",
      "rebound",
      "bands",
      "supertrend",
      "break-retest",
    ]),
    exchange: z.enum(["Binance", "Bybit", "OKX", "Bitget", "MEXC"]),
    market: z.enum(["Spot", "Perpetual Futures"]),
    side: z.enum(["SPOT", "LONG", "SHORT", "BOTH"]),
    pair: z.string().min(1).max(61).optional(),
    pairs: z.array(z.string().min(1).max(61)).min(1).max(10).refine(values => new Set(values).size === values.length, "คู่เทรดต้องไม่ซ้ำ").optional(),
    timeframe: z.enum(["5m", "15m", "1h", "4h", "1d"]),
    expectedRevision: z.number().int().nonnegative(),
    level: z.number().finite().positive().optional(),
  })
  .strict()
  .refine(input => (input.pair !== undefined) !== (input.pairs !== undefined), "ระบุคู่เทรดแบบเดียวเท่านั้น");
export function registerPresets(
  app: FastifyInstance,
  db: pg.Pool,
  dependencies: { instruments?: typeof instruments } = {},
) {
  const readInstruments = dependencies.instruments ?? instruments;
  // Materialize the accepted chat draft without another AI request. Locking the
  // conversation makes retries reuse the same card and preserves its saved rule.
  app.post("/api/v1/conversations/:id/setup-card", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        ruleId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    return transaction(db, async (c) => {
      const conv = (
        await c.query(
          "SELECT * FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3) FOR UPDATE",
          [id, req.userId, req.workspaceId ?? null],
        )
      ).rows[0];
      if (!conv)
        throw new ApiError(404, "CONVERSATION_NOT_FOUND", "ไม่พบบทสนทนา");
      if (conv.draft_revision !== input.expectedRevision)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "ร่างเปลี่ยนแล้ว กรุณาเปิดบทสนทนาใหม่",
        );
      const spec = strategySchema.parse(conv.draft);
      const latest = (
        await c.query(
          "SELECT * FROM messages WHERE conversation_id=$1 AND ui_card->>'type' IN ('preset','setup') ORDER BY created_at DESC,id DESC LIMIT 1",
          [id],
        )
      ).rows[0];
      const ruleId = input.ruleId ?? latest?.ui_card.ruleId ?? null;
      if (
        ruleId &&
        !(
          await c.query(
            "SELECT id FROM rules WHERE deleted_at IS NULL AND id=$1 AND owner_id=$2 AND workspace_id IS NOT DISTINCT FROM $3::uuid",
            [ruleId, req.userId, conv.workspace_id],
          )
        ).rowCount
      )
        throw new ApiError(404, "RULE_NOT_FOUND", "ไม่พบเซตอัปที่บันทึกไว้");
      if (
        latest &&
        isDeepStrictEqual(latest.ui_card.spec, spec) &&
        latest.ui_card.ruleId === ruleId
      )
        return { message: latest };
      const message = (
        await c.query(
          "INSERT INTO messages(id,conversation_id,role,content,ui_card) VALUES($1,$2,'assistant','',$3) RETURNING *",
          [randomUUID(), id, { type: "setup", spec, ruleId }],
        )
      ).rows[0];
      return { message };
    });
  });
  app.post("/api/v1/conversations/:id/preset", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params),
      input = configSchema.parse(req.body);
    const owned = await db.query(
      "SELECT id FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3)",
      [id, req.userId, req.workspaceId ?? null],
    );
    if (!owned.rowCount)
      throw new ApiError(404, "CONVERSATION_NOT_FOUND", "ไม่พบบทสนทนา");
    if ((input.market === "Spot") !== (input.side === "SPOT"))
      throw new ApiError(400, "DIRECTION_REQUIRED", "เลือกฝั่งให้ตรงกับตลาด");
    if (
      input.presetId === "break-retest" &&
      (!input.level || input.side === "BOTH")
    )
      throw new ApiError(
        400,
        "PRESET_LEVEL_REQUIRED",
        "ระบุระดับราคามากกว่า 0 และเลือก Spot, Long หรือ Short",
      );
    const spec = strategySchema.parse(buildPreset(input.presetId, input));
    const catalog = await readInstruments(input.exchange, input.market, true);
    if (spec.pairs.some(pair => !catalog.items.some((p) => p.symbol === pair && p.supported)))
      throw new ApiError(
        400,
        "UNSUPPORTED_INSTRUMENT",
        "คู่เทรดไม่พร้อมบนตลาดนี้ กรุณาเลือกใหม่",
      );
    return transaction(db, async (c) => {
      const row = (
        await c.query(
          "UPDATE conversations SET draft=$1,draft_revision=draft_revision+1 WHERE id=$2 AND owner_id=$3 AND draft_revision=$4 AND ($5::uuid IS NULL OR workspace_id=$5) RETURNING draft_revision",
          [
            spec,
            id,
            req.userId,
            input.expectedRevision,
            req.workspaceId ?? null,
          ],
        )
      ).rows[0];
      if (!row)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "บทสนทนาหรือร่างเปลี่ยนแล้ว เปิดใหม่ก่อนเลือกพรีเซ็ต",
        );
      const p = presets.find((p) => p.id === input.presetId)!;
      const content = `เลือกพรีเซ็ต ${p.title} แล้ว\n${describePreset(spec)}\nยังไม่เปิดแจ้งเตือน`;
      const card = { type: "preset", presetId: p.id, spec, ruleId: null };
      const message = (
        await c.query(
          "INSERT INTO messages(id,conversation_id,role,content,ui_card) VALUES($1,$2,'assistant',$3,$4) RETURNING *",
          [randomUUID(), id, content, card],
        )
      ).rows[0];
      return { spec, ...row, message };
    });
  });
  // Atomic, idempotent save per card. Uses the conversation's latest reviewed draft.
  app.post(
    "/api/v1/conversations/:id/:cardType/:messageId/save",
    async (req) => {
      const { id, messageId } = z
        .object({
          id: z.string().uuid(),
          messageId: z.string().uuid(),
          cardType: z.enum(["preset", "setup-card"]),
        })
        .parse(req.params);
      const input = z
        .object({
          expectedRevision: z.number().int().nonnegative(),
          expectedRuleRevision: z.number().int().positive().optional(),
          destinations: z.array(z.string().uuid()).max(5),
        })
        .strict()
        .parse(req.body);
      const candidate = (
        await db.query(
          "SELECT draft FROM conversations WHERE id=$1 AND owner_id=$2 AND draft_revision=$3 AND ($4::uuid IS NULL OR workspace_id=$4)",
          [id, req.userId, input.expectedRevision, req.workspaceId ?? null],
        )
      ).rows[0];
      if (!candidate)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "ร่างเปลี่ยนแล้ว กรุณาตรวจใหม่",
        );
      const checked = strategySchema.parse(candidate.draft);
      for (const exchange of checked.exchange) {
        const catalog = await readInstruments(exchange, checked.market, true);
        if (
          checked.pairs.some(
            (pair) =>
              !catalog.items.some((p) => p.symbol === pair && p.supported),
          )
        )
          throw new ApiError(
            400,
            "UNSUPPORTED_INSTRUMENT",
            "คู่เทรดไม่พร้อมบนตลาดนี้ กรุณาเลือกใหม่",
          );
      }
      const saved = await transaction(db, async (c) => {
        const conv = (
          await c.query(
            "SELECT * FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3) FOR UPDATE",
            [id, req.userId, req.workspaceId ?? null],
          )
        ).rows[0];
        if (!conv || conv.draft_revision !== input.expectedRevision)
          throw new ApiError(
            409,
            "REVISION_CONFLICT",
            "ร่างเปลี่ยนแล้ว กรุณาตรวจใหม่",
          );
        const m = (
          await c.query(
            "SELECT * FROM messages WHERE id=$1 AND conversation_id=$2 FOR UPDATE",
            [messageId, id],
          )
        ).rows[0];
        if (!["preset", "setup"].includes(m?.ui_card?.type))
          throw new ApiError(404, "PRESET_NOT_FOUND", "ไม่พบการ์ดพรีเซ็ต");
        const latest = (
          await c.query(
            "SELECT id FROM messages WHERE conversation_id=$1 AND ui_card->>'type' IN ('preset','setup') ORDER BY created_at DESC,id DESC LIMIT 1",
            [id],
          )
        ).rows[0];
        if (latest?.id !== messageId)
          throw new ApiError(
            409,
            "PRESET_SUPERSEDED",
            "ใช้การ์ดเซตอัปล่าสุดในบทสนทนานี้",
          );
        const spec = strategySchema.parse({
          ...conv.draft,
          destinations: input.destinations,
        });
        const verified = await c.query(
          "SELECT id FROM destinations WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND verified",
          [req.userId, spec.destinations],
        );
        if (verified.rowCount !== spec.destinations.length)
          throw new ApiError(
            400,
            "DESTINATION_UNVERIFIED",
            "กรุณายืนยันช่องทางก่อน",
          );
        let rule;
        if (m.ui_card.ruleId) {
          rule = (
            await c.query(
              "SELECT * FROM rules WHERE deleted_at IS NULL AND id=$1 AND owner_id=$2 AND workspace_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE",
              [m.ui_card.ruleId, req.userId, conv.workspace_id],
            )
          ).rows[0];
          if (!rule)
            throw new ApiError(
              404,
              "RULE_NOT_FOUND",
              "เซตอัพถูกลบแล้ว เลือกพรีเซ็ตใหม่",
            );
          if (!isDeepStrictEqual(rule.spec, spec)) {
            if (rule.revision !== input.expectedRuleRevision)
              throw new ApiError(
                409,
                "REVISION_CONFLICT",
                "เซตอัพเปลี่ยนแล้ว กรุณาเปิดบทสนทนาใหม่",
              );
            rule = (
              await c.query(
                "UPDATE rules SET spec=$1,revision=revision+1,active=false,updated_at=now() WHERE id=$2 RETURNING *",
                [spec, rule.id],
              )
            ).rows[0];
            await c.query(
              "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,$2,$3)",
              [rule.id, rule.revision, spec],
            );
          }
        } else {
          rule = (
            await c.query(
              "INSERT INTO rules(id,owner_id,spec,workspace_id) VALUES($1,$2,$3,$4) RETURNING *",
              [randomUUID(), req.userId, spec, conv.workspace_id],
            )
          ).rows[0];
          await c.query(
            "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,1,$2)",
            [rule.id, spec],
          );
        }
        const draft = (
          await c.query(
            "UPDATE conversations SET draft=$1,title=$3,saved_rule_id=$4,draft_revision=draft_revision+1,setup_saved_at=now(),setup_status_known=true WHERE id=$2 RETURNING draft_revision",
            [spec, id, spec.name, rule.id],
          )
        ).rows[0];
        const card = { ...m.ui_card, ruleId: rule.id };
        await c.query("UPDATE messages SET ui_card=$1 WHERE id=$2", [
          card,
          messageId,
        ]);
        return { rule, spec, ...draft, card };
      });
      await cleanupChatImages(db, req.userId, id, req.workspaceId);
      return saved;
    },
  );
}
