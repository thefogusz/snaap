# วิจัยแนวทาง Optimize ทั้งระบบ — 8 ตุลาคม 2026

Snapshot: `2f54db3` (`main`) · งานนี้เป็นการวิจัยอย่างเดียว ไม่ได้แก้โค้ด ไม่ได้เรียก LLM แบบเสียเงิน ไม่ได้ต่อ exchange จริง และไม่ได้แตะ production

ตัวเลขทั้งหมดในเอกสารนี้วัดด้วย micro-benchmark บนเครื่อง local (Windows, Node 25.8) หรือประมาณจากโค้ด แต่ละข้อระบุว่าเป็นแบบไหน ไม่มีข้อไหนรับประกันผลบน Railway ได้ Baseline ก่อนวิจัย: `npm test` ผ่าน 603/603 และ `npm run typecheck` ผ่าน

งานที่ทำไปแล้ว (อยู่ใน [monitor-capacity](monitor-capacity.md), [refactor-audit](refactor-audit-2026-10-08.md), [frontend-performance](frontend-performance-2026-10-05.md)) ไม่ได้นำมาเสนอซ้ำ

## ลงมือทำแล้วในรอบแรก (branch `claude/system-optimization-research-50c32a`)

| ข้อ | สิ่งที่เปลี่ยน | ผลที่ตรวจแล้ว |
|---|---|---|
| 1 | `@fastify/compress` (br/gzip, brotli q5) ใน `src/api.ts`; static: HTML/JS/CSS = `no-cache` (ยัง revalidate), `/assets` และ `/vendor` = `max-age=86400` | `landing.css` 18,271 B → 4,169 B ผ่าน brotli ใน browser จริง; `tests/static-delivery.test.ts` |
| 2 | Hero ของ landing ใช้ AVIF (22 KB) พร้อม WebP (41 KB) fallback ลบ PNG 1.7 MB | โหลด AVIF 22,160 B และหน้าแสดงผลปกติ |
| 3 | Cache ผล indicator built-in ต่อ candle array ใน `src/domain/engine.ts` | เทียบกับ engine เดิม 31,260 ค่า ตรงกันทุกค่า (`Object.is`); 600 targets × 5 indicators × 2 passes: 132 ms → 3 ms; `tests/indicator-sharing.test.ts` |
| 6 | ตั้ง RECOVERING เฉพาะ target ใหม่ (`DO NOTHING`) และเขียนสถานะ READY/INSUFFICIENT ครั้งเดียวหลังคำนวณ progress | `scripts/realtime-check.ts` มี assertion ใหม่ (พิสูจน์แล้วว่า fail บนโค้ดเดิม: 2 ≠ 1); SQL ต่อ target 14 → 13 |
| 7 | pg-boss: pool `max: 5`, `maintenanceIntervalSeconds: 300`, `scan` เก็บ 1 ชม., `deliver` ลบหลัง 2 วัน | `test:integration:isolated`, `test:admin`, `test:notifications`, realtime และ load check (200 users) ผ่าน |
| 11 | Polling: unread refresh เฉพาะเมื่อ signal เปลี่ยน; tab ที่ซ่อนอยู่หยุด poll เว้นแต่เปิดเสียงหรือ desktop alert; admin หยุดตอนซ่อน | `signal-unread`, `admin-ui` tests ผ่าน |

หมายเหตุที่ต่างจากข้อเสนอเดิม: ไม่หยุด poll ใน tab ที่ซ่อนแบบเด็ดขาด เพราะผู้ใช้ที่เปิดเสียงหรือ desktop notification ต้องการแจ้งเตือนขณะ tab อยู่เบื้องหลัง และยังไม่ได้ใส่ `immutable`/versioned URL ให้ JS/CSS เพราะ dynamic import ภายใน JS ยังไม่มี versioning (เสี่ยงโหลดไฟล์ต่างรุ่นกัน) ยังไม่ได้แปลง `snaap-social-product.png` (og:image) ผลทดสอบทั้งหมด: `npm test` 608/608, typecheck ผ่าน

## สรุปลำดับความสำคัญ

| # | เรื่อง | ด้าน | ผลที่คาดไว้ | แรง | เสี่ยง |
|---|---|---|---|---|---|
| 1 | เปิด brotli/gzip ให้ static และ JSON | Frontend | `/home` โหลด 1.10 MB เหลือ ~262 KB (−76%) **วัดแล้ว** | S | ต่ำ |
| 2 | แปลงภาพ hero ของ landing เป็น AVIF/WebP | Frontend | 1,738,661 B เหลือ 22–41 KB (−98%) **วัดแล้ว** | S | ต่ำ |
| 3 | Cache indicator built-in ใช้ร่วมกันข้าม rule | Monitor CPU | 600 targets/pair: 79.5 ms เหลือ 4.6 ms (−94%) **วัดแล้ว, ผลตรงเดิม 32,364/32,364** | S/M | ต่ำ |
| 4 | Cache ผลตรวจ candle validity ต่อ array | Monitor CPU | ประหยัด ~100–140 µs/target/frame (~6–8 s CPU ต่อการปิดแท่ง ที่ 60k targets) **วัดแล้ว** | S | ต่ำ |
| 5 | ย้ายข้อมูลที่เปลี่ยนทุกครั้งออกจาก `instructions` ของ AI | AI cost | ค่า input ต่อ turn −~79% (ประมาณ) | S/M | กลาง |
| 6 | หยุด status churn (RECOVERING→READY) และเขียนให้น้อยลง | DB | ลดการเขียนต่อ target ~50% และ incident ของ admin ไม่สลับสถานะไปมาอีก | S | ต่ำ |
| 7 | Delivery ไม่ถือ transaction ไว้ระหว่างส่ง HTTP | DB | คืน connection 2–4 จาก 8 ระหว่างส่ง | M | กลาง |
| 8 | Compile TS ก่อน deploy แทนการใช้ `tsx` ตอนรัน | Runtime | RSS 233 MB เหลือ 177 MB (−24%), import 1.5 s เหลือ 0.9 s **วัดแล้ว** | S/M | ต่ำ |
| 9 | ตั้งค่า pg-boss (maintenance, retention, pool) | DB | ตาราง job ไม่ค้าง ~25 ชม. และลด connection รวม 18+ ตัว | S | ต่ำ |
| 10 | เพิ่ม index ที่ขาด และ `created_at` index สำหรับ admin | DB | กันการสแกนทั้งตารางที่ใหญ่ขึ้นตามข้อมูล | S | ต่ำ |
| 11 | Polling ของหน้าเว็บ: หยุดตอน tab ซ่อนอยู่ และลด unread refresh | Frontend/API | 8 req/min เหลือ 4 (tab ที่เปิดดู) และ 0 (tab ที่ซ่อน) | S | ต่ำ |
| 12 | Realtime: ไม่ reconnect ทุก stream เมื่อมีการเพิ่ม pair | Monitor | ตัด warmup REST และ job burst ที่ไม่จำเป็น | S/M | กลาง |

S = ไม่ถึง 1 วัน · M = 1–3 วัน · L = มากกว่านั้น

---

## 1. Frontend และการส่งไฟล์

**สภาพตอนนี้** (ทดสอบกับ server local ที่ใช้ hook เดียวกับ production)

- `src/api.ts:774` ลงทะเบียน `@fastify/static` ด้วยค่า default ไม่มี `@fastify/compress` จึงไม่มีการบีบอัดเลย ส่วนการบีบอัดที่ Railway edge ยังไม่ได้ตรวจ ให้ใช้ `curl -I -H 'accept-encoding: br' https://snaap.me/home` เช็ก
- Hook ที่ `src/api.ts:152` ตั้ง `Cache-Control: no-store` แต่ static plugin เขียนทับเป็น `public, max-age=0` ทุกไฟล์จึงต้อง revalidate (304) ทุกครั้งที่โหลดหน้า ประมาณ 67 รอบต่อการเปิดหน้า

**ขนาดที่วัดได้** (raw / gzip-9 / brotli-11)

| หน้า | ไฟล์ | JS | CSS |
|---|---|---|---|
| `/home` | 44 JS + 22 CSS | 788,654 / 237,497 / 202,032 | 295,323 / 64,547 / 55,506 |
| landing | 1 + 1 | 17,144 / 5,331 / 4,593 | 18,111 / 4,343 / 3,707 |

**ข้อเสนอ**

1. **บีบอัด (S)** — เพิ่ม `@fastify/compress` (`encodings: ['br','gzip']`, brotli quality ~5, threshold 1 KB) หรือสร้างไฟล์ `.br`/`.gz` ตอน startup แล้วใช้ `preCompressed: true` ซึ่งไม่กิน CPU ต่อ request
2. **ภาพ hero (S)** — `dist/assets/snaap-lime-flow.png` (1.7 MB, 1672×941) แสดงที่ opacity 0.1 เหนือ fold (`dist/landing.css:131`) แปลงด้วย sharp แล้ว: WebP 1600w q75 = 40,876 B, AVIF 1600w q45 = 22,160 B ใช้ `image-set()` และให้ WebP เป็น fallback ส่วน `snaap-social-product.png` (782 KB, ใช้เป็น og:image) เป็น JPEG q80 = 70 KB
3. **Cache headers (M)** — `/vendor/*` และ `/assets/*` ใส่เวอร์ชันในชื่อไฟล์ แล้วตั้ง `max-age=31536000, immutable` ส่วน JS/CSS ที่เขียนเองใช้ `max-age=300, stale-while-revalidate=86400` และ HTML ตั้ง `no-cache` ให้ชัดเจน
4. **Lazy-load lightweight-charts (M)** — 196 KB (61.7 KB gzip) โหลดตอนเริ่มทุกครั้ง แต่ใช้เฉพาะใน `studio.js` กับ `chat-artifacts.js` เปลี่ยนเป็นโหลดตอน render chart ครั้งแรก จะลด JS ตอนเปิดหน้าลงราว 25%
5. **Polling (S)**
   - `dist/browser-alerts.js:149` poll `/signals` ทุก 15 s และ `finally` เรียก `/signals/unread` ทุกครั้ง รวมเป็น 8 req/min ต่อ tab และไม่เช็ก `document.hidden` ให้ refresh unread เฉพาะเมื่อมี signal ใหม่ และหยุด poll ตอน tab ซ่อนอยู่
   - `dist/admin.js:995` ก็ poll 8 req/min แม้ tab ซ่อนอยู่
   - `dist/studio.js:377` ยิง `POST /preview` ทุก 30 s ควรเปลี่ยนเป็นยิงตอนแท่งเทียนของ timeframe นั้นปิด
   - ระยะยาว (L): ใช้ SSE ร่วมกับ PostgreSQL LISTEN/NOTIFY แทน polling
6. **modulepreload (S)** — dynamic import 19 ตัวทำให้ต้องรอเพิ่ม 2 รอบหลัง `workbench.js` ใส่ `<link rel="modulepreload">` ให้ชุดที่ใช้ตอนเริ่ม
7. **CSS 22 ไฟล์ที่ block render (M)** — รวมเหลือ 1–2 ไฟล์ ถ้าต้องการให้ self-host font ด้วย

## 2. Monitor และ engine (CPU)

ต้นทุนต่อ target ต่อการปิดแท่ง (history 1000 bars) อยู่ที่ราว **300 µs** หรือราว 18 s CPU ที่ 60,000 targets โดยยังไม่นับ SQL แหล่งใหญ่คือ `advance` + `branchProgress` คำนวณบาร์เดิมซ้ำ (132–183 µs) และ `seriesFreshness` (107–142 µs) fixture ใน `monitor-load-check.ts` ตอนนี้ใช้ `PRICE > 100` แท่งเดียว จึงไม่เห็นต้นทุนส่วนนี้

1. **Cache indicator built-in ใช้ร่วมกัน (S/M)** — `src/domain/engine.ts:654-716` คำนวณ EMA/RSI/ATR/MACD ใหม่ตั้งแต่บาร์ 0 ทุกครั้ง ทุก rule และ 2 ครั้งต่อบาร์ (`monitor.ts:222-256`) ให้ใช้ `WeakMap<Candle[], Map<key, result>>` โดย key = prefix length + timeframe + name + period + source + params ต้นแบบลดเวลาจาก 79.5 ms เหลือ 4.6 ms ต่อ 600 targets บน pair เดียว และตรวจด้วย `Object.is` แล้วตรงทุกค่า 32,364 กรณี (รวมกรณีมี gap) ค่า seed ของ indicator ยังถูกต้อง เพราะ warmup size ที่ต่างกันเป็น array คนละตัวอยู่แล้ว (`markets.ts:241`)
2. **Cache candle validity (S)** — `src/domain/insights.ts:63-103` เรียก `isValidCandle` (ซึ่งสร้าง object ใหม่ด้วย `Object.values`) กับทุกบาร์ ทุก target ให้เก็บ `firstInvalidIndex` ต่อ array ไว้ใน WeakMap
3. **Status churn (S, ยืนยันแล้ว)** — `monitor.ts:84-87, 218-221, 267-271` เขียน `RECOVERING` แล้วตามด้วย `READY` ทุกครั้ง ทำให้ trigger `admin_market` (`admin-schema.ts:63-72`) เปิดและปิด incident ทุกแท่ง แก้โดยคำนวณสถานะสุดท้ายแล้วเขียนครั้งเดียว และใส่ `WHEN (OLD.status IS DISTINCT FROM NEW.status)` ใน trigger (ต้องปรับ budget 14 statements ใน realtime-check ด้วย)
4. **รวมการเขียนต่อ target เป็น CTE เดียว (S/M)** — ลดจาก ~14 เหลือ ~10 round trips ส่วนการอ่านหลังได้ lock ยังต้องแยกไว้ตามที่ระบุในเอกสารเดิม
5. **Realtime reconnect (S/M, ยืนยันแล้ว)** — `realtime.ts:138-165` เมื่อมี key ใดเปลี่ยน จะปิด client ทั้งตัว ลบ candle cache ทั้งกลุ่ม แล้ว listener ใหม่เริ่มจาก `lastClosed=0` ทำให้ยิง job ทุก target ให้เก็บ client ไว้ แล้วเพิ่มหรือลบเฉพาะ key ที่เปลี่ยน และใช้ `unWatchOHLCV` กับ exchange ที่รองรับ (Binance, Bybit, OKX, MEXC)
6. **Telegram chart (S)** — `telegram-chart.ts` decode, resize และ encode PNG 3 รอบ (38 ms ต่อการส่ง) ให้ render SVG ที่ 976 px ครั้งเดียว cache favicon ไว้ และ cache ตาม signal+accent ราว 64 ตัว จะเหลือราว 10 ms
7. **Cache spec ที่ parse แล้ว ตาม (id, revision) (S)** — ทุกการแก้ spec ทำให้ revision เพิ่ม จึงทำได้อย่างปลอดภัย
8. **Extended indicator cache (S)** — `extended-indicators.ts:283` จะ `clear()` ทั้งหมดเมื่อครบ 64 ให้ตัดเฉพาะตัวเก่าสุด (LRU)
9. **Delivery เมื่อ `event.time === latest` เท่านั้น (S)** — `monitor.ts:203` ถ้า queue ช้ากว่า 1 แท่ง (เคยวัดได้ 100–157 s) setup 1m จะไม่ได้รับการแจ้งเตือนเลย ควรเปลี่ยนเงื่อนไขเป็นอายุสูงสุดของ signal ที่ยอมรับได้
10. **Preview O(bars²)** — 1000 bars ใช้ 220 ms ข้อ 1 จะช่วยได้ราว 3–4 เท่า

## 3. ฐานข้อมูลและ pg-boss

1. **Delivery ถือ transaction ระหว่างส่ง (M)** — `destinations.ts:428-490` lock row ไว้ระหว่างส่ง HTTP (สูงสุด 15 s) และ LINE ใช้ connection ที่สอง แก้เป็น claim `SENDING` → ส่งนอก transaction → บันทึกผล และให้ scan ทุกนาทีจัดการ `SENDING` ที่ค้าง
2. **Admin overview ยิง 13 query พร้อมกันทุก 15 s (S)** — `admin.ts:156-190` ใช้ pool ทั้ง 8 ตัวชั่วคราว รวมเป็น statement เดียว แล้วเพิ่ม index `created_at` ให้ `signals`, `usage_ledger` และ `agent_runs`
3. **History sync (M)** — `history-auto.ts:285` ถือ advisory lock บน pooled connection ไว้ตลอดการ sync และ `persist()` lock แถวของ user ด้วย `FOR UPDATE` แล้วอ่าน JSON ทั้งก้อนทุก market × ทุกสัปดาห์ ข้อเสนอคือ queue `history-sync` แบบ 1 job ต่อ connection ใช้ `groupConcurrency` ต่อ exchange ทำงานเป็นช่วง ๆ (50 units หรือ 60 s) แล้วส่ง job ตัวเองต่อ (round-robin) และ persist ครั้งเดียวต่อช่วง
4. **Index ที่ขาด (S)** — ดู DDL ด้านล่าง ให้ยืนยันด้วย `EXPLAIN (ANALYZE, BUFFERS)` ก่อน
5. **รายการ signal ส่ง `chart_snapshot` ที่ frontend ไม่ได้ใช้ (S)** — `api.ts:741` ใช้ `SELECT s.*` ให้ระบุคอลัมน์เอง และจำกัด unread count ที่ 100 (UI แสดงเป็น 99+ อยู่แล้ว)
6. **pg-boss (S)**
   - `maintenanceIntervalSeconds` default คือ 24 ชม. (`attorney.js:634`) ดังนั้น `deleteAfterSeconds: 3600` ที่ตั้งไว้จริง ๆ แล้วเก็บ job ไว้ราว 25 ชม.
   - ตั้ง `max: 4`, `maintenanceIntervalSeconds: 300` และ retention สั้นลงสำหรับ `scan`/`deliver`
   - ปิด worker `evaluate` เก่าหลังตรวจว่า drain หมดแล้ว
7. **Pool timeouts (S)** — `db.ts:4` ไม่มี `statement_timeout`, `idle_in_transaction_session_timeout` หรือ `connectionTimeoutMillis` ควรตั้งหลังจากแก้ข้อ 1 แล้ว
8. **Migration รันทั้ง schema ทุกครั้งที่ boot (M)** — ราว 150 statements รวม backfill ให้เปลี่ยนเป็นตาราง `schema_migrations` คู่กับ advisory lock และ `lock_timeout`
9. **ตารางที่โตไม่มีขอบเขต (S/M)** — `replay_runs` (100–300 KB/คลิก), `agent_runs.trace`, `admin_events` ที่ resolved แล้ว, checkpoint ของ revision เก่า และ `signals.chart_snapshot` ให้ลบหรือ null เป็นระยะจาก scan ที่รันทุกชั่วโมง ส่วนตาราง monitor ให้ตั้ง `fillfactor=70` เพื่อให้ได้ HOT update

```sql
CREATE INDEX CONCURRENTLY conversations_owner_recent ON conversations(owner_id, created_at DESC, id DESC);
CREATE INDEX CONCURRENTLY deliveries_destination ON deliveries(destination_id);
CREATE INDEX CONCURRENTLY agent_runs_conv ON agent_runs(conversation_id);
CREATE INDEX CONCURRENTLY agent_runs_running ON agent_runs(owner_id, created_at) WHERE status='RUNNING';
CREATE INDEX CONCURRENTLY usage_ledger_reserved ON usage_ledger(created_at) WHERE status='RESERVED';
CREATE INDEX CONCURRENTLY assets_owner ON assets(owner_id, purpose);
CREATE INDEX CONCURRENTLY assets_conv ON assets(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX CONCURRENTLY imports_owner_scope ON imports(owner_id, account_scope);
CREATE INDEX CONCURRENTLY rules_workspace ON rules(workspace_id);
CREATE INDEX CONCURRENTLY conversations_workspace ON conversations(workspace_id);
CREATE INDEX CONCURRENTLY signals_created ON signals(created_at);
CREATE INDEX CONCURRENTLY usage_ledger_created ON usage_ledger(created_at);
CREATE INDEX CONCURRENTLY agent_runs_created ON agent_runs(created_at DESC);
```

## 4. AI chat harness (ต้นทุนและ latency)

input ราว 20k tokens ต่อรอบ (skills 6.8k + ข้อความคงที่และ catalog 5.5k + tool schema 7k) จาก audit 10 requests พบว่า input คิดเป็น **~89% ของค่าใช้จ่าย** โค้ดยังไม่ใช้ `prompt_cache_key`, `cached_tokens` หรือ `parallel_tool_calls`

1. **ทำให้ prefix คงที่ (S/M)** — `harness.ts:431-437` วาง evidence (ที่มี `asOf: new Date()`), draft และ editor focus ไว้ก่อนข้อความคงที่ 5.5k tokens และ tools จึง cache ได้แค่ 6.8k tokens แรก ให้ย้ายข้อมูลที่เปลี่ยนไปเป็น `developer` input item ท้าย history ค่าที่ประมาณได้ (ราคา gpt-5-mini) คือ $0.0035 เหลือ $0.0007 ต่อ turn (−79%) และ prefill เร็วขึ้นด้วย ต้องปรับ privacy check ใน `harness-contract-check.ts`
2. **ไม่แก้ `instructions` ระหว่าง turn (S)** — `read_skill` และ repair note (`harness.ts:600, 646`) ต่อท้าย instructions ให้ส่งเป็น tool output หรือ developer item แทน
3. **`replay_strategy` ไม่ต้องมี parameter (S)** — ตอนนี้ใช้ schema 9.9k ตัวอักษรชุดเดียวกับ `propose_strategy` แต่ replay draft ที่มีอยู่แล้ว ประหยัดราว 2.6k tokens ต่อรอบ และ output ราว 500 tokens เมื่อมีการเรียก
4. **บันทึก cached tokens ใน ledger (S)** — ตอนนี้คิดราคา input ทั้งหมดเป็นราคาเต็ม จึงวัดผลการ optimize ไม่ได้
5. **`prompt_cache_key` / OpenRouter session (S)** — ทดสอบกับ `provider.require_parameters` ก่อนใช้
6. **`include: ["reasoning.encrypted_content"]` (S)** — ใช้ reasoning items ซ้ำข้ามรอบได้เมื่อตั้ง `store: false` ต้อง smoke test กับ OpenAI ตรงก่อน
7. **รัน read-only tools แบบขนาน (M)** — `harness.ts:608-815` ตอนนี้เรียกทีละตัว (มี turn ที่ใช้ 23.8 s) ใช้ `Promise.all` แต่ยังเขียนผลตามลำดับเดิม
8. **History window ที่คงที่ (M)** — ตัดทีละช่วงประมาณ 6 ข้อความแทนแบบ sliding `LIMIT 10` ซึ่งทำให้ cache หลุดทุก turn
9. **ลดเวลาก่อนเรียก model ครั้งแรก (S)** — โหลด skill files ครั้งเดียวตอน startup และรัน DB query กับ sharp แบบขนาน
10. **Evidence truncation** — `JSON.stringify(...).slice(0, 18000)` อาจตัด JSON จนเสีย ให้ตัดจำนวนแถวก่อนแล้วค่อย stringify
11. **Perceived latency** — ส่ง event บอกความคืบหน้าของ tool ไปที่ client ระหว่าง reasoning หรือระหว่างรัน tool

## 5. Runtime

**Compile ก่อน deploy (S/M)** — ตอนนี้ `npm start` ใช้ `node --import tsx` วัดการ import `src/api.ts` 3 รอบ:

| | import | RSS | heap |
|---|---:|---:|---:|
| tsx | ~1,530 ms | ~233 MB | 82 MB |
| JS ที่ compile แล้ว (tsc) | ~900 ms | ~177 MB | 66 MB |

Railway คิดเงินตาม RAM ข้อนี้จึงลดค่าใช้จ่ายได้โดยตรง ต้องจัดการ `src/domain/engine.ts` ที่ import `dist/indicator-catalog.js` (ใช้ esbuild bundle หรือคัดลอก `dist/*.js` ไปด้วย) และ `ai/provider.ts:8` ใช้ parameter properties ซึ่ง Node type-stripping ไม่รองรับ จึงยังต้องใช้ tsc หรือ esbuild

ต้นทุนการ import ของแต่ละ dependency (RSS หลัง import แยกตัว, baseline Node ~35 MB): ccxt 110 MB, stripe 61 MB, openai 60 MB, pg-boss 55 MB ส่วน ccxt export แค่ `.` จึง import เฉพาะ exchange ที่ใช้ไม่ได้

## ลำดับที่แนะนำ

1. **สัปดาห์นี้ (ทุกข้อ S และเสี่ยงต่ำ):** compression, ภาพ hero, polling visibility, indicator cache กับ validity cache, status churn, pg-boss config, index
2. **ถัดไป:** AI prefix คงที่ + บันทึก cached tokens (ต้องทำคู่กัน จะได้วัดผลได้), compile ก่อน deploy, realtime reconnect, Telegram chart
3. **ต้องออกแบบเพิ่ม:** delivery นอก transaction, history sync queue, migration versioning, retention, cache headers พร้อม versioning
4. **ก่อนเชื่อตัวเลข capacity:** เพิ่ม fixture ใน `monitor-load-check.ts` ที่ใช้ indicator จริง (EMA cross, RSI) เพราะ fixture `PRICE > 100` ตอนนี้ซ่อนต้นทุนข้อ 2.1–2.2 ไว้
