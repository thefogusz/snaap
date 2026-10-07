import type { FastifyInstance } from "fastify";
import type pg from "pg";
import multipart from "@fastify/multipart";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { readSheet as readXlsxFile } from "read-excel-file/node";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { mergeTrades } from "./domain/imports.js";
import { transaction } from "./data/db.js";
import { checkXlsxSize } from "./zip-limit.js";
const tradeSchema = z
  .object({
    time: z.string().datetime({ offset: true }),
    exchange: z.enum(["Binance", "Bybit", "OKX", "Bitget", "MEXC", "Gate"]),
    pair: z
      .string()
      .regex(
        /^[A-Z0-9][A-Z0-9._-]{0,39}\/[A-Z0-9][A-Z0-9._-]{0,19}(?::[A-Z0-9._-]{1,30})?$/,
      ),
    market: z.enum(["Spot", "Futures"]).default("Spot"),
    contracts: z.coerce.number().positive().optional(),
    contractSize: z.coerce.number().positive().optional(),
    settle: z
      .string()
      .regex(/^[A-Z0-9]{1,20}$/)
      .optional(),
    positionSide: z.enum(["LONG", "SHORT"]).optional(),
    side: z.enum(["buy", "sell"]),
    price: z.coerce.number().positive(),
    quantity: z.coerce.number().positive(),
    fee: z.coerce.number().finite().optional(),
    feeCurrency: z
      .string()
      .regex(/^[A-Z0-9]{2,12}$/)
      .optional(),
    id: z.string().max(100).optional(),
  })
  .strict();
async function flushImageCleanup(db: pg.Pool) {
  for (const row of (
    await db.query("SELECT id,storage_path FROM asset_cleanup")
  ).rows) {
    try {
      await unlink(row.storage_path);
    } catch (error: any) {
      if (error.code !== "ENOENT") continue;
    }
    await db.query("DELETE FROM asset_cleanup WHERE id=$1", [row.id]);
  }
}
export async function cleanupChatImages(
  db: pg.Pool,
  owner: string,
  conversationId: string,
  workspaceId?: string,
) {
  const removed = await transaction(db, async (c) => {
    const conv = await c.query(
      "SELECT id FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3) FOR UPDATE",
      [conversationId, owner, workspaceId ?? null],
    );
    if (!conv.rowCount) throw new ApiError(404, "NOT_FOUND", "ไม่พบบทสนทนา");
    const rows = (
      await c.query(
        "DELETE FROM assets WHERE owner_id=$1 AND purpose='chat' AND conversation_id=$2 RETURNING id,storage_path",
        [owner, conversationId],
      )
    ).rows;
    if (rows.length)
      await c.query(
        "UPDATE messages SET sources=COALESCE((SELECT jsonb_agg(s) FROM jsonb_array_elements(sources) s WHERE NOT (s->>'id'=ANY($2::text[]))),'[]'::jsonb) WHERE conversation_id=$1",
        [conversationId, rows.map((r) => r.id)],
      );
    for (const row of rows)
      await c.query(
        "INSERT INTO asset_cleanup(id,storage_path) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [row.id, row.storage_path],
      );
    return rows;
  });
  if (removed.length) await flushImageCleanup(db);
}
export async function registerFiles(app: FastifyInstance, db: pg.Pool) {
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8 },
  });
  const root = path.resolve(process.env.ASSET_STORAGE_PATH ?? ".local/assets");
  await mkdir(root, { recursive: true });
  await flushImageCleanup(db);
  app.get('/api/v1/conversations/:id/images', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    if (!(await db.query(
      'SELECT 1 FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3)',
      [id, req.userId, req.workspaceId ?? null],
    )).rowCount) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบบทสนทนา');
    return (await db.query(
      "SELECT id,name FROM assets WHERE owner_id=$1 AND purpose='chat' AND conversation_id=$2 AND ($3::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=assets.id AND s.owner_id=$1 AND s.kind='image' AND s.workspace_ids IS NOT NULL AND NOT ($3=ANY(s.workspace_ids)))) ORDER BY created_at DESC LIMIT 200",
      [req.userId, id, req.workspaceId ?? null],
    )).rows.reverse();
  });
  app.get("/api/v1/images", async (req) =>
    (
      await db.query(
        "SELECT id,name,metadata,created_at FROM assets WHERE owner_id=$1 AND purpose='library' AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=assets.id AND s.owner_id=$1 AND s.kind='image' AND s.workspace_ids IS NOT NULL AND NOT ($2=ANY(s.workspace_ids)))) ORDER BY created_at ASC LIMIT 10",
        [req.userId, req.workspaceId ?? null],
      )
    ).rows.map((row) => ({ ...row, url: `/api/v1/images/${row.id}` })),
  );
  app.post("/api/v1/images", async (req, reply) => {
    const input = z
      .object({
        purpose: z.enum(["chat", "library"]).default("library"),
        conversationId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.query);
    if (input.purpose === "chat" && !input.conversationId)
      throw new ApiError(
        400,
        "CONVERSATION_REQUIRED",
        "ภาพชั่วคราวต้องอยู่ในบทสนทนา",
      );
    const file = await req.file();
    if (!file) throw new ApiError(400, "IMAGE_REQUIRED", "เลือกภาพ");
    const bytes = await file.toBuffer();
    const metadata = await sharp(bytes, {
      limitInputPixels: 20000000,
    })
      .metadata()
      .catch(() => {
        throw new ApiError(
          400,
          "IMAGE_INVALID",
          "เปิดภาพไม่ได้ กรุณาเลือกไฟล์ PNG, JPEG หรือ WebP ที่สมบูรณ์",
        );
      });
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? ""))
      throw new ApiError(400, "IMAGE_TYPE", "รองรับ PNG, JPEG และ WebP");
    const data = await sharp(bytes, { limitInputPixels: 20000000 })
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer()
      .catch(() => {
        throw new ApiError(
          400,
          "IMAGE_INVALID",
          "ภาพเสียหรือมีขนาดใหญ่เกินไป กรุณาเลือกภาพใหม่",
        );
      });
    const normalized = await sharp(data).metadata();
    const id = randomUUID(),
      storagePath = path.join(root, id + ".webp");
    await writeFile(storagePath, data, { mode: 0o600 });
    let name = file.filename.slice(0, 120);
    try {
      await transaction(db, async (c) => {
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.userId,
        ]);
        if (input.purpose === "library") {
          const existing = (
            await c.query(
              "SELECT name FROM assets WHERE owner_id=$1 AND purpose='library'",
              [req.userId],
            )
          ).rows;
          if (existing.length >= 5)
            throw new ApiError(
              400,
              "IMAGE_LIBRARY_LIMIT",
              "ข้อมูลของฉันเก็บภาพได้สูงสุด 5 ภาพ ลบภาพเดิมก่อนเพิ่ม",
            );
          let number = 1;
          while (existing.some((r) => r.name === String(number))) number++;
          name = String(number);
        } else {
          const conv = await c.query(
            "SELECT id FROM conversations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR workspace_id=$3) FOR UPDATE",
            [input.conversationId, req.userId, req.workspaceId ?? null],
          );
          if (!conv.rowCount)
            throw new ApiError(404, "NOT_FOUND", "ไม่พบบทสนทนา");
        }
        await c.query(
          "INSERT INTO assets(id,owner_id,name,mime,storage_path,metadata,purpose,conversation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            id,
            req.userId,
            name,
            "image/webp",
            storagePath,
            { width: normalized.width, height: normalized.height },
            input.purpose,
            input.conversationId ?? null,
          ],
        );
      });
    } catch (error) {
      await unlink(storagePath).catch(() => {});
      throw error;
    }
    return reply.code(201).send({
      id,
      name,
      purpose: input.purpose,
      width: normalized.width,
      height: normalized.height,
      url: `/api/v1/images/${id}`,
    });
  });
  app.patch("/api/v1/images/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { name } = z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .regex(/^[^@"\u0000-\u001f]+$/),
      })
      .strict()
      .parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      if (
        (
          await c.query(
            "SELECT 1 FROM assets WHERE owner_id=$1 AND purpose='library' AND lower(name)=lower($2) AND id<>$3",
            [req.userId, name, id],
          )
        ).rowCount
      )
        throw new ApiError(
          409,
          "IMAGE_NAME_EXISTS",
          "ชื่อนี้ใช้แล้ว เลือกชื่ออื่น",
        );
      const row = (
        await c.query(
          "UPDATE assets SET name=$1 WHERE id=$2 AND owner_id=$3 AND purpose='library' AND ($4::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=assets.id AND s.owner_id=$3 AND s.kind='image' AND s.workspace_ids IS NOT NULL AND NOT ($4=ANY(s.workspace_ids)))) RETURNING id,name",
          [name, id, req.userId, req.workspaceId ?? null],
        )
      ).rows[0];
      if (!row) throw new ApiError(404, "NOT_FOUND", "ไม่พบภาพ");
      return row;
    });
  });
  app.get("/api/v1/images/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const row = (
      await db.query(
        "SELECT * FROM assets WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=assets.id AND s.owner_id=$2 AND s.kind='image' AND s.workspace_ids IS NOT NULL AND NOT ($3=ANY(s.workspace_ids))))",
        [id, req.userId, req.workspaceId ?? null],
      )
    ).rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "ไม่พบภาพ");
    return reply.type(row.mime).send(await readFile(row.storage_path));
  });
  app.delete("/api/v1/images/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const row = (
      await db.query(
        "DELETE FROM assets WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=assets.id AND s.owner_id=$2 AND s.kind='image' AND s.workspace_ids IS NOT NULL AND NOT ($3=ANY(s.workspace_ids)))) RETURNING storage_path",
        [id, req.userId, req.workspaceId ?? null],
      )
    ).rows[0];
    if (row) await unlink(row.storage_path).catch(() => {});
    return { ok: true };
  });
  app.post("/api/v1/imports/preview", async (req) => {
    const file = await req.file();
    if (!file)
      throw new ApiError(400, "FILE_REQUIRED", "เลือกไฟล์ CSV หรือ XLSX");
    const buffer = await file.toBuffer();
    let rows: any[];
    if (file.filename.toLowerCase().endsWith(".xlsx")) {
      try {
        checkXlsxSize(buffer);
      } catch {
        throw new ApiError(
          400,
          "XLSX_LIMIT",
          "ไฟล์ Excel ไม่ถูกต้องหรือขยายแล้วเกิน 30 MB",
        );
      }
      const cells = await readXlsxFile(buffer).catch(() => {
        throw new ApiError(
          400,
          "XLSX_INVALID",
          "อ่านตารางไม่ได้ กรุณาตรวจไฟล์ Excel",
        );
      });
      const headers = cells.shift()?.map(String) ?? [];
      rows = cells.map((row) =>
        Object.fromEntries(
          headers.map((h, i) => [
            h,
            row[i] instanceof Date ? (row[i] as Date).toISOString() : row[i],
          ]),
        ),
      );
    } else if (file.filename.toLowerCase().endsWith(".csv")) {
      try {
        rows = parse(buffer, {
          columns: true,
          skip_empty_lines: true,
          bom: true,
          max_record_size: 10000,
        });
      } catch {
        throw new ApiError(
          400,
          "CSV_INVALID",
          "อ่าน CSV ไม่ได้ กรุณาตรวจเครื่องหมายคำพูดและจำนวนคอลัมน์ในแต่ละแถว",
        );
      }
    } else throw new ApiError(400, "FILE_TYPE", "รองรับ CSV หรือ XLSX");
    if (rows.length > 10000)
      throw new ApiError(400, "IMPORT_LIMIT", "ไม่เกิน 10,000 แถวต่อไฟล์");
    const valid: unknown[] = [],
      errors: unknown[] = [];
    rows.forEach((row, i) => {
      const clean = Object.fromEntries(
        Object.entries(row).filter(([, v]) => v !== "" && v !== null),
      );
      const parsed = tradeSchema.safeParse(clean);
      if (parsed.success) valid.push(parsed.data);
      else if (errors.length < 20)
        errors.push({
          row: i + 2,
          fields: parsed.error.issues.map((x) => x.path.join(".")),
        });
    });
    return {
      name: file.filename,
      rows: valid,
      total: rows.length,
      errors,
      feeMissing: valid.filter((x: any) => x.fee === undefined).length,
      format: "time,exchange,market,pair,side,price,quantity,fee,id",
    };
  });
  app.post("/api/v1/imports", async (req, reply) => {
    const input = z
      .object({
        name: z.string().max(120),
        accountScope: z.string().trim().min(1).max(80),
        rows: z.array(tradeSchema).max(10000),
      })
      .strict()
      .parse(req.body);
    return transaction(db, async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      const existing = (
        await c.query(
          "SELECT rows FROM imports WHERE owner_id=$1 AND account_scope=$2",
          [req.userId, input.accountScope],
        )
      ).rows.flatMap((r) => r.rows);
      const merged = mergeTrades(existing, input.rows),
        id = randomUUID();
      await c.query(
        "INSERT INTO imports(id,owner_id,name,rows,account_scope) VALUES($1,$2,$3,$4,$5)",
        [
          id,
          req.userId,
          input.name,
          JSON.stringify(merged.rows),
          input.accountScope,
        ],
      );
      return reply.code(201).send({
        id,
        inserted: merged.rows.length,
        duplicates: merged.duplicates,
        ambiguous: merged.ambiguous,
      });
    });
  });
  app.get(
    "/api/v1/imports",
    async (req) =>
      (
        await db.query(
          "SELECT id,name,account_scope,jsonb_array_length(rows) AS count,created_at FROM imports WHERE owner_id=$1 AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=imports.id AND s.owner_id=$1 AND s.kind='import' AND s.workspace_ids IS NOT NULL AND NOT ($2=ANY(s.workspace_ids)))) ORDER BY created_at DESC",
          [req.userId, req.workspaceId ?? null],
        )
      ).rows,
  );
  app.delete("/api/v1/imports/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.query("DELETE FROM imports WHERE id=$1 AND owner_id=$2", [
      id,
      req.userId,
    ]);
    return { ok: true };
  });
}
