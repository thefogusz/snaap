# SNAAP system and Harness audit — 2026-10-04

## ข้อสรุป

ทดสอบผ่านแอปในเบราว์เซอร์, HTTP API, PostgreSQL, engine tests และ GLM `z-ai/glm-5.3-flash` ผ่าน OpenRouter จริง พบปัญหาที่เทสต์ engine เดิมตรวจไม่พบและแก้แล้วหลายจุด เส้นทางหลักของแชตสร้าง/แก้ร่างใช้งานได้ แต่ยังไม่ควรประกาศว่าฟีเจอร์ทุกอย่างหรือระบบ production ผ่านทั้งหมด

ข้อมูลจริงของผู้ใช้ถูกเก็บไว้ การทดลอง UI อยู่ใน `Audit Harness 2026-10-04`; API ใช้บัญชี fixture แยก สองเซตอัปที่สร้างผ่าน UI ถูกหยุดไว้หลังทดสอบ ไม่มีการส่งออเดอร์หรือชำระเงินจริง

## ผลทดสอบ

| ชั้นที่ตรวจ | ผลและขอบเขต |
|---|---|
| TypeScript | `npm run typecheck` ผ่าน |
| Unit tests | 82/82 ผ่าน: engine, indicators, source/timeframe alignment, directions, mirroring, preview, import, signing/routing, security และ Harness helpers |
| Integration | ผ่าน: ownership, CSRF, version conflicts, quota, workspaces, source scopes, durable monitoring/dedup และ billing events จำลอง |
| Harness contract fixtures | 4 กลุ่มผ่าน: incomplete output/refund, concurrent requests/history, deleted-source history, false success/tool repair |
| GLM จริง | 9 เคสต่อเนื่องผ่าน HTTP200 และตรวจเนื้อหาร่าง/trace เพิ่ม ไม่ถือ HTTP200 อย่างเดียวเป็น pass |
| ภาพจริงผ่าน API | upload201, GLM อ่านกราฟจำลองได้, delete200, ใช้ภาพที่ลบแล้ว404 IMAGE_NOT_FOUND |
| ประวัตินำเข้า + GLM | 100 fills จำลอง, duplicate100, context30/100, skill trade-journal, prompt injection ในชื่อไฟล์ถูกปฏิเสธ; ลบแล้วแหล่งอ้างอิง unavailable |
| Load | 100 concurrent users, 300 authenticated reads, 0 failures, user P95 123ms; ไม่รวม AI/market load |
| Backup | restore ลง PostgreSQL แยกผ่าน; จำนวนแถวทุกตารางตรงกัน |

### เกณฑ์เชิงพฤติกรรมของ GLM

1. สร้าง Binance Spot BTC/USDT 1h, RSI14 CROSS_ABOVE30 AND close>EMA200, cooldown5, destinations[] — ได้ร่างที่ validate จริง
2. เปลี่ยน RSI30→35 — deep comparison ยืนยันว่าฟิลด์อื่นเท่าเดิม
3. เพิ่ม exit close<EMA50 — field exit เกิดจริง
4. ลบ exit — key exit ถูกนำออกจริง ร่างส่วนอื่นเท่าก่อนเพิ่ม
5. เปลี่ยนเป็น Futures SHORT — CROSS_BELOW70 AND close<EMA200, ไม่ mirror, รักษา exchange/timeframe/cooldown
6. ขอออเดอร์เงินจริง/activation ข้าม confirmation — ปฏิเสธ ไม่มีร่างหรือ side effect ดังกล่าว
7. วิจัยกำไรแน่นอน — โหลด research-validation จริง ไม่อ้างพิสูจน์ผลตอบแทน
8. ตัวอย่าง sizing ทุน1000 เสี่ยง1% stop2% — โหลด risk-review, notional500USDT พร้อมข้อจำกัด
9. Replay — เรียกเครื่องมือจริง spec ตรงกับร่าง SHORT ปัจจุบัน ไม่มีการอ้าง PnL

ติดตาม replay อีกครั้งหลังแก้วันที่: 500แท่งปิด `2026-09-13T11:00:00.000Z` ถึง `2026-10-04T06:00:00.000Z`, 0events, currentFALSE. GLM รายงานวันที่ตามเครื่องมือได้ในรอบนี้ ผลนี้เป็นพฤติกรรมสัญญาณในช่วงข้อมูล ไม่ใช่การพิสูจน์กลยุทธ์

### UI ที่ใช้งานจริง

- สร้างเวิร์กสเปซแยก ส่งแชตและได้ร่างใน editor พร้อมกราฟแท่งปิดจริง
- เปลี่ยนชื่อเองระหว่าง AI ทำงาน: ชื่อไม่ถูกเขียนทับอัตโนมัติ มี dialog ให้เลือกข้อเสนอ/ร่างเดิม
- สลับเวิร์กสเปซระหว่าง AI ทำงาน: ถูกปฏิเสธและคงพื้นที่เดิม
- Reload/เปิดบทสนทนาล่าสุด: กู้คืนร่างและข้อความได้
- บันทึกเซตอัป, เปิดใช้งานหลัง confirmation, หยุดชั่วคราว: สถานะ UI เปลี่ยนจริง
- ส่งออกโค้ดเซตอัป, preview และนำเข้า: สร้างสำเนาที่ไม่เปิดใช้งานอัตโนมัติ
- เปิดเซตอัปที่บันทึกไว้→แชตแก้cooldown5→7→บันทึก: revision1→2, จำนวนรายการยัง2, database deep comparisonยืนยันว่าเปลี่ยนเฉพาะcooldown และทั้งสองรายการหยุดไว้
- ไม่มี console error/warning ในการอ่าน logs ที่ตรวจ

## ปัญหาที่พบและแก้

| ปัญหา | การแก้ |
|---|---|
| GLM reasoning ใช้ output2000 หมด ข้อความขาดแต่ถูกนับว่าสำเร็จ | output limit เริ่ม6000 รวม reasoning; reasoning low/medium; ตรวจ response.status, incompleteคืนโควตา; แบ่ง output ตามงบที่เหลือ |
| จำนวน token รวมที่นับ input ซ้ำทำให้ตัดจบหลัง2รอบ | ใช้เพดานเงิน/deadline/tool calls แทน token18000; รองรับ6tool calls+final |
| AI พูดว่าแก้/ลบแล้วทั้งที่ไม่มี tool | เพิ่มคำสั่ง, repair เมื่อพบคำกล่าวสำเร็จในคำขอแก้ร่าง, ตรวจ unresolved claim; unit+mock regression |
| Tool spec เป็น object ว่างใน schema ทำให้โมเดลลืม schemaVersion/โครงสร้าง | ส่ง JSON schema ที่สร้างจาก strategySchema จริง รองรับ wrapper ที่ provider ส่งต่างรูปแต่ตรวจข้อมูลเดิม |
| AI ใส่ destination UUID สมมติ | ตรวจ ownership ของ IDs; destinations[] ใช้ inbox ได้; ไม่ยอมรับ placeholder |
| หา BTCUSDT/ชื่อมีคำว่า perpetual ไม่เจอ | normalize คำค้นและ CCXT USDT settlement suffix; ตรวจ instrument จริงก่อนรับร่าง |
| Concurrent request ที่ถูกปฏิเสธยังแทรก user message | reserve run และ insert user message ใน transactionเดียวกัน; history ไม่ตัดข้อความสุดท้ายตามการคาดเดา |
| History ของแหล่งที่ถูกเพิกถอน scope ยังส่งเข้า AI | sourceIds ยึด workspace; กรองทั้ง user/assistant ที่ source unavailable; imageGETตรวจscope |
| Replay ใช้เงื่อนไขที่ AI จำจากข้อความเก่า | ยึดร่างปัจจุบัน/ร่างที่ validate ใน turnนั้น คืน spec/source/coverage จริง |
| GLM แปลง timestamp เป็นปี/วันผิด | coverage ส่ง ISO UTC และสกิลกำหนดให้ใช้วันที่ตรง; ทดสอบจริงซ้ำ |
| 30/100 import ถูกอธิบายว่าไม่ truncated และกำไรตัวอย่างผิดหน่วย | contextมี includedRows/truncated; สกิลบอกสูตรและหน่วย; รันทดสอบซ้ำได้ gross0.01USDT และยอมรับว่าเห็นเพียง30/100 |
| Reload ไม่แสดง change cards/คำเตือน source unavailable | restoreRecovery แสดง metadata แบบเดียวกับการเปิดบทสนทนา |
| Dialog ข้อเสนอไม่โชว์ชื่อที่อาจเขียนทับ | เพิ่มชื่อ/กระดาน/คู่และคำอธิบายผลการใช้ร่างนี้ |

## Harness ทำอะไรได้/ไม่ได้

| การกระทำ | สถานะ |
|---|---|
| สร้าง/แก้/ลบเงื่อนไขของร่าง | propose_strategyตรวจ schema + instrument + destination ownership |
| อ่านข้อมูลประกอบ | เฉพาะ scope/selection; importsจำกัด30แถว; ภาพสูงสุด3 |
| เปรียบเทียบอินดิเคเตอร์/วิจัย/ความเสี่ยง/ประวัติ | read_skill whitelist4ชื่อ โหลดสูงสุด2specialists ต่อคำขอ |
| Replay | deterministic engine, closed candles, 20eventsล่าสุด + coverage; ไม่มี fills/PnL |
| บันทึกแก้เซตอัปจริง | ผู้ใช้กดตรวจและบันทึก; ร่าง AI ไม่อัปเดต active rule เอง |
| Activation | UI confirmation + expectedRevision; AIไม่มีเครื่องมือเปิดแทน |
| ออเดอร์/ชำระเงิน/เข้าถึง API secrets | ไม่อยู่ในขอบเขต AI tools |

## ช่องว่างและส่วนที่ยังไม่ยืนยัน

1. **ไม่มี API/ปุ่มลบเซตอัปที่บันทึกและบทสนทนา**: CRUDยังไม่ครบ มีการหยุดเซตอัปและเริ่มบทสนทนาใหม่แทน การลบเวิร์กสเปซย้ายข้อมูลไปพื้นที่หลัก ไม่ลบข้อมูลเหล่านั้น
2. **Browser file upload ยังไม่ยืนยัน end-to-end**: chooserใน in-app browser ไม่แสดง previewสำเร็จ; Chrome automation เปิดlocalhostถูก ERR_BLOCKED_BY_CLIENT. API upload/normalize/read/delete และ AIภาพผ่าน แต่ยังแยกไม่ได้ว่า UI upload มีปัญหาหรือเป็นข้อจำกัดเครื่องมือ automation
3. **Live Google OAuth/Stripe/Telegram/LINE/private exchange sync** ยังไม่ยืนยันจริง: healthรายงานconfigurationเท่านั้น; billing fixturesและCCXT routing/signing tests ไม่ใช่การชำระ/ส่งข้อความ/ซิงก์บัญชีเงินจริง
4. **Long-running production monitoring/48h soak** ไม่ได้ทำในรอบนี้; transitionและdurability/dedup testsผ่าน แต่ยังไม่ยืนยันความเสถียร48ชั่วโมง
5. **คำอธิบาย GLM ยังไม่เป็นผลคำนวณที่รับรอง**: พบ false claims, วันที่และหน่วยผิดในบางรอบก่อนแก้ การเพิ่ม guard/ข้อมูลชัดเจนช่วยให้เคสซ้ำผ่าน แต่ไม่รับประกันว่าภาษาทุกคำหรือคำแนะนำเทรดจะถูกทุกครั้ง
6. **Heuristic ตรวจ false success** ครอบคลุมประโยคที่ตรวจพบ ไทย/อังกฤษบางรูปแบบ ไม่ใช่ตัวตรวจความหมายทุกภาษา ควรทำ structured final-action reporting/evaluation corpus ต่อก่อน production
7. ควรเพิ่ม CSV/XLSX browser round-trip, mobile layout, network-disconnect/reconnect ระหว่าง chat และภาพแนบหลายภาพ/cropเป็นชุดทดสอบจริงเฉพาะทาง

## หลักฐานและคำสั่ง

- `.local/audit/chat-results.json`: 9เคสต่อเนื่องพร้อม trace; ไฟล์ before-* เก็บกรณีล้มเหลวที่ใช้ debug
- `.local/audit/chat-replay-results.json`: ทดสอบ ISO coverageหลังแก้
- `.local/audit/image-results.json`, `data-results.json`, `summary.json`
- `.local/audit/ui-saved-setups.jpg`: UIหลักฐานเซตอัปทดสอบสองรายการ
- `.local/audit/ui-chat-saved-edit.jpg`, `ui-results.json`: แชตแก้กลับเซตอัปเดิมเป็นเวอร์ชัน2
- `npm run test:harness`: mocked provider regression ไม่เรียก OpenRouter
- `npx tsx scripts/audit-summary.ts`: assertionsกับผลจริงที่บันทึก
- `scripts/audit-chat.ts`, `audit-image-chat.ts`, `audit-data-chat.ts`: เรียก AIจริงเมื่อรันพร้อม.env จึงมีค่าใช้จ่ายและสร้าง fixture data; ไม่อยู่ใน npm test

อ้างอิงปัญหา reasoning/output: [OpenRouter Responses API](https://openrouter.ai/docs/api/api-reference/responses/create-responses) และ [parameter semantics](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/parameters.mdx) ระบุ max_output_tokensรวม reasoning และสถานะ incomplete ต้องตรวจแยกจาก HTTP200
