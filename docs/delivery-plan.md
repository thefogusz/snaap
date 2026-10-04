# ลำดับพัฒนาและการรับงาน

ฉบับออกแบบ 2026-10-03 · ทุก checkbox ยังไม่ใช่สิ่งที่ทำเสร็จแล้ว

## สถานะจริงของโปรเจกต์

มี static frontend 4 หน้า, แชตแบบตัวเลือก, rule dialog, watchlist จำลอง, history จำลอง, notification preview, dark/light preference. ยังไม่มี package.json, database, worker, authentication, exchange data, AI provider หรือการส่งข้อความจริง

คำสั่งที่มีจริง (PowerShell):

```powershell
Set-Location D:\SNAAP
node server.cjs
node --check dist/app.js
node --check dist/setup-flow.js
node --check dist/theme.js
git diff --check
```

`node server.cjs` รันค้างเพื่อเสิร์ฟ local; ตรวจ syntax ใน terminal อีกอัน ยังไม่มี `npm test` หรือ build script ห้ามรายงานว่ารันผ่านแล้ว เป้าหมาย command contract หลัง bootstrap เสนอ `npm run dev`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run test:replay` และ `npm run test:soak` ต้องสร้างและพิสูจน์ในงาน foundation

## โครงสร้างที่เสนอ

```text
dist/                         UI prototype ปัจจุบัน คงไว้ระหว่าง migration
docs/                         spec, research, contracts, fixtures examples
src/api/                      sessions, routes, boundary validation
src/domain/rules/              AST, compiler, indicators, evaluator
src/domain/alerts/             evidence, outbox, lifecycle
src/adapters/exchanges/        provider-specific normalization
src/adapters/notifications/    Telegram, LINE, webhook
src/workers/                   market, delivery, import, analysis
src/data/                      repositories, migrations, ownership policy
src/ai/                        draft composer, privacy filters
tests/unit/                    pure math and rule semantics
tests/integration/             DB, adapters, delivery fixtures
tests/replay/                  recorded event streams and crash cases
tests/e2e/                     user journeys and accessibility
```

ใช้ explicit result สำหรับ domain decision เช่น `MATCH | NO_MATCH | UNKNOWN` ไม่ catch error แล้วคืน false ทุกกรณี ตัวอย่างรูปแบบ pure function:

```ts
type Evaluation =
  | { kind: 'MATCH'; evidence: Evidence }
  | { kind: 'NO_MATCH'; failedConditions: string[] }
  | { kind: 'UNKNOWN'; reasons: DataIssue[] };

function evaluateRule(rule: CompiledRule, snapshot: MarketSnapshot): Evaluation {
  // No network, secrets, user mutation, or LLM calls in this function.
  return evaluateCompiledConditions(rule, snapshot);
}
```

## ขอบเขตการทำงาน

- ทำเสมอ: รักษา UI/ชื่อเมนูที่ยืนยันแล้ว, ทดสอบผลที่ผู้ใช้เห็น, validate ข้อมูลภายนอก, migration ย้อนตรวจได้, privacy/ownership tests
- ต้องมีข้อมูล/อนุญาตเฉพาะก่อนทำจริง: ใช้ credential ส่วนตัว, ซื้อบริการ/แพ็กเกจ, ส่งข้อความไปบัญชีคนอื่น, เปิด public host/tunnel, เปลี่ยนสิทธิ์บัญชี; การออกแบบนี้ไม่ได้ทำสิ่งเหล่านั้น
- ไม่ทำ: ใส่ secrets ใน source/log/LLM, trade/withdraw, อ้าง mock เป็น live, เปลี่ยนกระดานแทนโดยไม่บอก, ลดหลายกระดานเหลือหนึ่งโดยไม่รายงาน

## ช่วง A — ฐานข้อมูลและกฎที่เชื่อถือได้

### A1. Domain contract และ fixture

- [ ] ย้าย rule shape ออกจาก DOM เป็น shared schema/compiler
- รับงานเมื่อ: editor→JSON→Thai summary round-trip ตรงกัน, unit compatibility ผ่าน, invalid/unknown fields reject
- ตรวจ: unit tests ของ AND/OR/CROSS/UNKNOWN และตัวอย่าง valid/invalid; schema/type generation ไม่มี divergence

### A2. Persistence และ lifecycle

- [ ] PostgreSQL migrations, workspace, rules/revisions/drafts, transaction repositories
- รับงานเมื่อ: reload/restart ไม่ทำกฎหาย, concurrent edit ให้409, แก้ revision ไม่เปลี่ยน signal เก่า
- ตรวจ: integration transaction tests, local restore test; frontend แยก mock/live mode ชัด

### A3. Sessions และ ownership

- [ ] local workspace identity และ session boundary ที่ย้ายไป hosted auth ได้
- รับงานเมื่อ: workspace A อ่าน/แก้/ส่งออกข้อมูล B ไม่ได้, CSRF/Origin rules ผ่าน, logout/revoke ใช้ได้
- ตรวจ: negative authorization matrix ทุก resource endpoint

### A4. Indicator engine

- [ ] EMA/SMA/RSI/volume ratio และ seed/warmup policy
- รับงานเมื่อ: golden fixtures เทียบ reference ภายใต้ convention เดียวกัน, no future leakage, ข้อมูลขาดคืนUNKNOWN
- ตรวจ: convergence windows, flat prices, zero volume, rounding edge, exact crosses, unordered/duplicate inputs

## ช่วง B — หลายกระดานจริง

### B1. Adapter harness

- [ ] registry/catalogue/normalizer/health/backfill/subscription management
- รับงานเมื่อ: fixtures ของ Spot/perpetual แยกและ replay ผลเดิมได้
- ตรวจ: malformed payload, delisting, no-trade vs network gap, timezone/session, volume conversion

### B2–B6. Binance / Bybit / OKX / Bitget / MEXC

แต่ละ adapter เป็นงานรับรองแยก ไม่รวม giant patch เดียว

- [ ] REST history pagination + WS updates + reconnect + finality + capabilities
- รับงานเมื่อ: กระดานนั้นผ่าน contract fixtures, deterministic replay, forced disconnect และ bounded rate budget
- ตรวจ: final event ซ้ำ, out-of-order, connection rotation, 429/maintenance, regional unavailability, schema migration
- เป้าหมาย product: ผู้ใช้เลือกหลายกระดานและเฝ้าพร้อมกันได้; รายงานตาราง capability ที่ผ่านจริงและที่ยังติด blocker

### B7. Shared evaluation และ scanner groups

- [ ] ประเมินต่อ series แล้ว fan-out ไปหลายกฎ, bounded universe resolution
- รับงานเมื่อ: ไม่เปิด WS แยกต่อผู้ใช้, สมาชิกกลุ่มมี revision, กระดานหนึ่งล่มไม่ทำอีกกระดานหยุด
- ตรวจ: dynamic member changes, warmup newly listed pairs, group pin, 500-stream workload ที่เสนอ

## ช่วง C — แจ้งเตือนครบหนึ่งรอบ

### C1. Inbox + evidence + outbox

- [ ] atomic signal/outbox, checkpoints, duplicate guards
- รับงานเมื่อ: crash หลัง signal commit แล้วกลับมาส่งต่อได้, redelivery ไม่สร้าง signal ซ้ำ
- ตรวจ: fault injection ทุก boundary; pause/activate race มีผลตรงตาม contract

### C2. Telegram

- [ ] one-time linking, masked recipient, test message, throttled sender, UNKNOWN state
- รับงานเมื่อ: user ยืนยันผู้รับและทดสอบได้, provider error แสดง action ที่แก้ได้, no secret logs
- ตรวจ: wrong nonce, expired nonce, blocked bot,429, timeout-after-write, same event redrive

### C3. LINE / Webhook

- [ ] LINE Messaging API retry keys+signature binding; outbound HTTPS webhook HMAC/SSRF protection
- รับงานเมื่อ: key เดิมตลอด retries, safe redelivery, ปลายทาง private network ถูก reject
- ตรวจ: 409/429/5xx, signature replay, DNS rebinding/redirect fixtures; inbound local ใช้ mock จนอนุญาต public HTTPS

### C4. Quiet hours, grouping, delivery history

- [ ] ใช้ timezone ที่ผู้ใช้เลือก, digest, per-rule mute
- รับงานเมื่อ: เงียบแล้ว inbox ยังครบ, ไม่ส่ง burst ย้อนหลังเมื่อหมด mute, status ไม่อ้างว่าอ่านแล้ว
- ตรวจ: DST, reset timezone, accumulated backlog, expired alerts, same pair multiple exchanges

## ช่วง D — แชตที่ช่วยตั้งกฎจริง

### D1. Draft composer

- [ ] provider adapter, typed structured output, missing-slot questions, manual fallback
- รับงานเมื่อ: prompt ครบไม่ถามซ้ำ, prompt กำกวมถามก่อน, secret ถูก redact, AI ไม่ activate เอง
- ตรวจ: evaluation set ภาษาไทยอย่างน้อย100เคส รวม negation, ≥ vs >, OR, cross vs above, exchange aliases, unsupported indicators
- เป้าหมายเสนอ: exact semantic match ≥95% ใน supported cases, 0 silent activation, unsupported cases ต้อง clarify/reject ทั้งหมด; ยังไม่ใช่ผลที่วัดแล้ว

### D2. Edits และ memory

- [ ] conversation continuity, explicit/inferred preference, rule diff confirmation
- รับงานเมื่อ: แก้ “RSI เป็น35” ไม่เปลี่ยน exchange/timeframe โดยไม่ขอ, กฎเดิมทำงานระหว่าง draft
- ตรวจ: stale draft, competing device edit, prompt injection ใน source data, model timeout/cost ceiling

## ช่วง E — ประวัติและการค้นหารูปแบบ

### E1. File staging และ reconciliation

- [ ] CSV/XLSX formats ต่อกระดาน, mapping/timezone preview, row-level errors, duplicate detection
- รับงานเมื่อ: import file ซ้ำและ API overlap ไม่ทำ P&L ซ้ำ; fills เหมือนกันที่เกิดจริงสองครั้งไม่ถูกลบทิ้ง
- ตรวจ: partial fills, mixed fees, missing opening basis, hedge positions, malformed spreadsheets, timezone ambiguity

### E2. Read-only sync

- [ ] credential vault, permissions inspection, cursor/checkpoint, backfill coverage
- รับงานเมื่อ: revoke key หยุด sync แต่กฎ public ยังทำงาน; รู้ช่วงประวัติที่หาไม่ได้และขอไฟล์เพิ่มได้
- ตรวจ: pagination retries, stale credential, sync interruption, provider history limits ไม่เหมารวม

### E3. Analysis → rule draft

- [ ] position grouping, market enrichment, deterministic statistics, observations+evidence+feedback
- รับงานเมื่อ: ไม่ใช้ future candle, นับทั้งกำไรขาดทุน, ไม่อ้าง edge เมื่อ sample/coverage ไม่พอ, export reproduce ได้
- ตรวจ: chronological holdout, fee/funding exclusion labels, deleted source invalidation, no winner-only inference

## ช่วง F — ตรวจความพร้อมก่อนให้ใช้งานจริงต่อเนื่อง

- [ ] Runtime health/metrics, backup+restore, deletion/export, secret rotation, cost budgets
- [ ] 48-hour soak ผ่าน, forced WS rotation, adapter outage+backfill, provider delivery outage+recovery
- [ ] Desktop/mobile390px, keyboard-only, zoom200%, contrast+focus+screen-reader status, no sidebar wrapping regression
- [ ] Operations runbook: stop/restart worker, pause all, cancel queued jobs, provider outage, rollback engine version
- [ ] Confirm provider access/terms and data licensing for intended audience; do not infer public data = redistribution rights
- รับงานเมื่อทุก critical gate มีผลทดสอบเก็บได้; ไม่ใช่เพียง screenshot ใช้ได้หนึ่งครั้ง

## ระยะถัดไปที่ออกแบบรองรับ แต่ไม่ปนกับ release แรก

Multi-timeframe, intrabar provisional alerts, inbound TradingView bridge, stocks/gold licensed data, team workspace/billing เป็นงานแยกพร้อม capability/schema version ของตน ห้ามทำ placeholder เหมือนเปิดจริงเพื่อให้ดูครบ

## งบประมาณและการตัดสินใจที่ยังต้องใช้ข้อมูลจริง

ต้นทุนต่อเดือน = runtime+database+storage+AI requests+ข้อความที่คิดเงิน+market data entitlement ไม่มีราคาประมาณที่ตรวจไม่ครบปะปนกับงบอนุมัติ

ตัวอย่างประมาณพื้นที่ (ไม่ใช่ benchmark): 500 instruments × (96+24+6+1) candles/day สำหรับ15m/1h/4h/1d =63,500 rows/day. สมมติ1KB/row ≈1.9GB/30วันก่อน indexes/backups; หากเก็บ1mด้วยจะเพิ่ม720,000 rows/day. ต้องเลือก retention หลังวัด row/index size จริง

สิ่งที่ยังไม่ต้องบล็อกงานออกแบบ: provider AI/model ที่จะซื้อ, วิธี hosted deployment, budget/จำนวนผู้ใช้, private account permissions, ผู้รับข้อความจริง และหุ้น/ทองที่ต้องการ เริ่ม foundation แบบ local และ replay data ได้ก่อน

## Traceability

| สิ่งที่ผู้ใช้ต้องการ | ส่วนออกแบบ | งานพัฒนา |
|---|---|---|
| คุยแล้วตั้งเงื่อนไขง่าย | product §3–4 | A1,D1,D2 |
| หลายกระดานชั้นนำ | product §5 / architecture §3–4 | B1–B7 |
| รู้ว่าตัวไหนเข้าเงื่อนไข | product §6 / architecture §5 | A4,C1 |
| Telegram/LINE | product §7 / architecture §6 | C2–C4 |
| เรียนรู้จากประวัติ | product §8 / architecture §7 | E1–E3 |
| ข้อมูลไม่หาย | product §10 | A2,F |
| มือใหม่กับมือเก๋าใช้ได้ | product §4,11 | D1 + UI acceptance |
| local และไม่เผยแพร่เอง | architecture §2 | ทุกช่วง |
