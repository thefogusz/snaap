# รีเสิชระบบ AI / Technical Signals เพื่อพัฒนา SNAAP

วันที่ตรวจ: 5 ตุลาคม 2026 (Asia/Bangkok) · สถานะ: ข้อเสนอเพื่อพัฒนาต่อ ยังไม่ได้เพิ่มฟีเจอร์

ฐานโค้ดที่ตรวจ: commit `735e2a9` ใน checkout นี้; บันทึกบน branch `codex/ai-signal-research` เริ่มจาก detached HEAD ที่สะอาด ข้อค้นพบนี้ไม่รับรองสถานะของ branch หรือ deployment อื่น

## ข้อเสนอหลัก

พัฒนา SNAAP ให้บอกได้ว่า **สัญญาณเกิดเพราะอะไร ใช้ข้อมูลถึงเวลาไหน และมีหลักฐานผลลัพธ์ระดับใด** ก่อนเพิ่มโมเดลคาดการณ์ราคา

ระบบมีฐานดีอยู่แล้ว: deterministic evaluator, หลาย TF, evidence tree, signal revision, dedup และ replay ที่ใช้ transition เดียวกับ monitor สิ่งที่คุ้มที่สุดคือทำข้อมูลเหล่านี้ให้ผู้ใช้เข้าใจง่าย แก้ความกำกวมของความสดข้อมูล และเพิ่มเครื่องมือวัดผลอย่างเป็นขั้นตอน

อย่านำจำนวนอินดิเคเตอร์หรือคะแนนความเห็นตรงกันมาแสดงเป็นโอกาสชนะ ไม่มีแหล่งที่ตรวจในงานนี้พิสูจน์ว่าระบบตัวอย่างสร้างกำไรให้ SNAAP ได้ และยังไม่มีการทดลองผลตอบแทนในงานนี้

## 1. ระบบอ้างอิงและสิ่งที่นำมาใช้ได้

| ระบบ / แหล่งต้นทาง | สิ่งที่ตรวจพบ | สิ่งที่ควรนำมาใช้ | ข้อจำกัด |
| --- | --- | --- | --- |
| [TF Trend + Buy - Sell Signal Predictor By AI][R1] | ผู้เขียนระบุ multi-indicator, ตาราง 12 TF, TP จาก ATR และ OB/FVG; เป็น protected script | แนวคิดรวมบริบทและเป้าราคาในจอเดียว | ยืนยันสูตรหรือการใช้ ML ไม่ได้; ภาพตัวอย่างเป็น XAUUSD ของ Pepperstone ไม่ใช่ข้อมูลตลาดเดียวกับ SNAAP |
| [TradingView Technical Ratings][R2] | รวม 26 อินดิเคเตอร์ แยกกลุ่ม MA/oscillator เป็นคะแนนและตารางหลาย TF | คะแนนที่เปิดเผยกฎและแยกกลุ่มเหตุผล | เป็นคะแนนตามกฎ ไม่ใช่ความน่าจะเป็น; ไม่ควรนับ indicator ที่ใกล้กันเป็นหลักฐานอิสระ |
| [Machine Learning: Lorentzian Classification — jdehorty][R3] | ผู้เขียนอธิบาย classifier ที่ใช้ approximate nearest neighbors กับระยะทาง Lorentzian; หน้าเผยแพร่ระบุ open-source | ตัวอย่างการอธิบาย feature และวิธีเรียนรู้ให้ตรวจได้ | งานนี้อ่านคำอธิบาย ไม่ได้ audit โค้ดหรือยืนยันผลตอบแทน; ANN ในหน้านี้หมายถึง Approximate Nearest Neighbors ไม่ใช่ Artificial Neural Network |
| [SMC — LuxAlgo][R4] | ทำเครื่องหมาย BOS/CHoCH, order blocks และโซน price action | แปลงโครงสร้างราคาเป็น event ที่มีเวลายืนยันชัด | เป็นการตีความรูปแบบราคา ไม่ใช่หลักฐานคำสั่งสถาบัน; ศึกษาแนวคิดได้ แต่ต้องตรวจ license ก่อนนำโค้ดมาใช้ |
| [FreqAI][R5] | มี feature/label, การฝึกโมเดลใหม่, การอนุมาน และทดสอบย้อนหลังตามรอบฝึก | ออกแบบวงจรชีวิตโมเดลและการทดสอบตามเวลา | เอกสารระบุว่ากลยุทธ์ตัวอย่างไม่ได้ออกแบบให้ใช้ production; ไม่ใช่หลักฐานว่ากลยุทธ์ตัวอย่างทำกำไร |
| [scikit-learn Calibration][R6] และ [TimeSeriesSplit][R7] | เครื่องมือประเมิน/ปรับความน่าจะเป็นและแบ่งข้อมูลตามเวลา | แยกคะแนน โมเดล และความน่าจะเป็นที่ผ่านการตรวจ | chronological split อย่างเดียวไม่จัดการ label ซ้อนทับทุกกรณี; ต้องออกแบบช่วงเว้นตามปัญหา |
| [Freqtrade Lookahead][R8] / [Recursive analysis][R9] และ [TradingView Repainting][R10] | ตรวจการใช้อนาคต ผลจากประวัติตั้งต้น และข้อมูลแท่งที่ยังไม่ยืนยัน | ขยายชุดตรวจความสอดคล้อง live/replay ที่ SNAAP มี | การทดสอบบางเส้นทางผ่านไม่ได้รับรองทุกสัญญาณหรือทุกเงื่อนไข |

คำว่า AI ควรแยกเป็น 3 ประเภทใน SNAAP: (1) AI ช่วยร่าง/อธิบายกฎ (LLM ที่มีอยู่), (2) โปรแกรมคำนวณสัญญาณตามกฎ, (3) predictive ML ที่ต้องฝึกและประเมินแยก การใช้ AI ช่วยเขียนสูตรไม่ได้ทำให้สูตรนั้นเป็นโมเดลคาดการณ์อัตโนมัติ

## 2. สิ่งที่ SNAAP มีจริงใน checkout นี้

ใช้โค้ดเป็นหลัก เพราะ `docs/implementation-status.md` บางส่วนเก่ากว่าสถานะปัจจุบัน เช่น เอกสารบอก REST-only แต่ `src/realtime.ts` มี `watchOHLCV` และ `src/monitor.ts` เรียก `RealtimeMarkets` แล้ว การพบโค้ดไม่ใช่การรับรองความเสถียรกับ provider จริง

| ความสามารถ | หลักฐานใน repo | ช่องว่างที่เกี่ยวกับงานนี้ |
| --- | --- | --- |
| คำนวณกฎหลาย TF | `src/domain/engine.ts`: `frames`, `value`, `evaluate`; `src/markets.ts`: `neededFrames` | รองรับ 5m/15m/1h/4h/1d ไม่ใช่ 12 TF; ยังไม่พบตารางภาพรวมแบบแยก trend/momentum/volatility ในเส้นทางที่ตรวจ |
| หลักฐานประกอบสัญญาณ | `Evidence`, `Signal`, `preview()`; `dist/studio.js` แสดงเหตุผลรายแท่งแล้ว | ควรต่อยอดให้ระบุ clause, เวลาแหล่งข้อมูล และความขัดแย้ง ไม่เสนอสร้าง evidence UI ใหม่ทั้งหมด |
| กฎ/สัญญาณเวอร์ชันและ dedup | `src/monitor.ts`: บันทึก revision, event, dedup ลงฐานข้อมูล | ยังไม่มีข้อมูล provenance ครบแบบ dataset/model/feature version สำหรับงาน ML |
| ตัวเลือกอินดิเคเตอร์จำนวนมาก | `dist/indicator-catalog.js`, `src/domain/extended-indicators.ts`; เอกสาร expansion ระบุ 127 ผลลัพธ์ | จำนวนผลลัพธ์ไม่เท่ากับจำนวนตระกูลและไม่ใช่คุณภาพสัญญาณ; ไม่ต้องขยายจำนวนเป็นเป้าหมายหลัก |
| ATR และ return จากราคาเริ่มสัญญาณ | `engine.ts`: ATR, `ENTRY_RETURN`, `Lifecycle.entryPrice` | ยังไม่พบ risk-plan ที่ตรึง ATR ณ เวลาเข้า พร้อม SL/TP และต้นทุนใน schema ที่ตรวจ |
| Signal replay | `preview.ts`, `engine.ts: replay`, `harness.ts: replay_strategy` | Harness ระบุชัดว่าเป็น signal replay ไม่ใช่ผลตอบแทน; ยังไม่มี execution simulator ในเส้นทางนี้ |
| ป้องกันการใช้อนาคตบางส่วน | `value()` เลือก candle time <= เวลาประเมิน; extended-indicators tests มี causal-prefix; ten-day audit ตรวจ parity | ควรเพิ่มประวัติตั้งต้นหลายขนาด, revision และ arrival time; ห้ามอ้าง non-repaint ทุกกรณีจาก tests เหล่านี้ |
| ความสดของข้อมูล | `markets.ts: candles()` มี expectedClose แต่ปลายทางยังยอมรับอายุล่าสุด <= 2 TF และตั้ง READY | CONNECTED กับ CAUGHT_UP ควรแยก; health ปัจจุบันรวมระดับ exchange+market ขณะที่ความล่าช้าเกิดราย pair/TF |

ขอบเขตตลาด: โค้ดตรวจ Spot หรือ USDT-settled linear swap ของกระดานคริปโต การนำแนวคิดจากกราฟทองมาใช้ไม่ได้ทำให้รองรับ Pepperstone XAUUSD ต้องมี adapter, session/calendar และ contract specification แยกถ้าจะรองรับจริง

## 3. งานที่ควรทำตามลำดับ

### P0 — แสดงข้อมูลที่สดจริงและระบุเวลาตัดสิน

**ปัญหาที่มีหลักฐาน:** `tests/signals-market-window-audit.test.ts` มีกรณีแท่งล่าสุดช้าหนึ่งแท่ง 5m แต่ health เป็น READY; โค้ด `candles()` ยังมี tolerance ดังกล่าว Monitor เทียบ TF อื่นกับแท่งหลักล่าสุด จึงไม่ได้พิสูจน์ว่าแท่งหลักตามเวลาปัจจุบันทันแล้ว

ข้อเสนอ:

- เพิ่ม metadata ราย exchange/market/pair/TF: `lastClosedAt`, `expectedClosedAt`, `receivedAt`, `lagBars`, `quality`, `confirmationSource`
- แยกสถานะเชื่อมต่อได้ / กำลังรอปิดแท่ง / ข้อมูลตามทัน / กำลังเติมข้อมูล / ข้อมูลล่าช้า โดยมี grace period ที่ประกาศและทดสอบตาม provider
- ไม่ให้ status ของคู่หนึ่งทับความล่าช้าของอีกคู่ ใช้ข้อมูลชุดเดียวกันใน chart, monitor และ AI context
- แยก `observedAt` กับ `evaluatedAt`; event ที่กู้กลับมาภายหลังต้องมี recovered provenance และ policy การแจ้งเตือนที่ชัด
- REST path ปัจจุบันกรองตามนาฬิกา ส่วน stream ใช้แท่งถัดไปเป็นหลักฐานปิด ควรบันทึก/ตรวจ finalization policy ให้ชัดก่อนรับรองความเหมือนกัน

จุดแก้หลัก: `src/markets.ts`, `src/realtime.ts`, `src/monitor.ts`, schema/status API และ `dist/notifications.js`/`dist/studio.js`

เกณฑ์รับงาน: จำลองเลยขอบแท่ง, ช้าหนึ่งแท่ง, TF ใหญ่ไม่ครบ, gap, clock skew และ reconnect; ข้อมูลล่าช้าต้องไม่แสดงว่าตามทัน และไม่สร้างสัญญาณสดจากข้อมูลเก่าโดยไม่มีสถานะกำกับ

### P1-A — ตารางบริบทหลาย TF พร้อมเหตุผลที่ขัดกัน

เริ่มจาก TF ที่ระบบรองรับอยู่แล้ว แสดง Trend / Momentum / Volatility / Data status และเวลาของแท่งที่ใช้ แยก “เทรนด์ยังลง” ออกจาก “โมเมนตัมกำลังฟื้น” ได้โดยไม่ต้องบังคับให้ทุกช่องเป็น BUY/SELL

ใช้ `value()`/`evaluate()` เดิมและ evidence snapshot เดียวกับ monitor ทุกช่องเปิดดูสูตรและค่าจริงได้ ข้อมูลไม่พอให้แสดง UNKNOWN ไม่แปลงเป็นกลางหรือคะแนนศูนย์ กฎแจ้งเตือนต้องอ้างเงื่อนไขชัดเจน ไม่เปิดใช้งานเพียงเพราะคะแนนรวมสูง

ถ้าจำเป็นต้องมีคะแนนรวม ให้เรียก “คะแนนความสอดคล้อง” พร้อมสูตรและ version; จัดกลุ่ม trend/momentum/volume เพื่อจำกัดน้ำหนักซ้ำ การจัดกลุ่มไม่ได้ทำให้ข้อมูลเป็นอิสระทางสถิติ

จุดต่อยอด: `preview.ts`, `Evidence`, `dist/studio.js`, API สำหรับ context summary และ optional harness tool ที่คืน structured evidence

เกณฑ์รับงาน: ทุกช่องย้อนถึง clause/TF/source timestamp ได้; replay กับ live บน snapshot เดียวกันให้ค่าเดียวกัน; UNKNOWN ไม่ทำให้คะแนนดูดีขึ้น; ระบุจุดที่ไม่ผ่านแทนเพียงแสดงคะแนน

### P1-B — แผน SL/TP ตามความผันผวนที่ตรวจสูตรได้

ใช้ ATR ที่มีอยู่สร้างแผนสมมติ เช่น Long: SL = reference − k_stop × ATR_at_entry, TP = reference + k_target × ATR_at_entry; Short กลับเครื่องหมาย แสดงหน่วยราคา ระยะเสี่ยง และ reward/risk ก่อน/หลังสมมติต้นทุน

ATR วัดขนาดการแกว่ง ไม่ได้ทำนายทิศ [R11] ข้อเสนอคือเพิ่มสัญญาข้อมูล `RiskPlan` แยกจากข้อความ LLM ตรึงค่า ATR กับ reference ณ สัญญาณ ถ้าผู้ใช้เลือก trailing ต้องมี state/update policy คนละแบบ ห้ามขยับ TP/SL เดิมตาม ATR ล่าสุดเงียบ ๆ

`ENTRY_RETURN` ที่มีอยู่ยังไม่ใช่บันทึก fill จริง และ schema CUSTOM เป็นผลรวมจำกัด ยังไม่ควรอ้างว่าแผน lifecycle นี้ทำได้ครบด้วยการ import สูตรเดิม

เกณฑ์รับงาน: unit/precision ถูก, Long/Short สมมาตร, ATR ไม่พอเป็น UNKNOWN, ค่า snapshot ไม่เปลี่ยนเมื่อแท่งใหม่มา และแยก reference price จาก fill price; ไม่มีการส่งออเดอร์

### P1-C — หลักฐานผลลัพธ์สองระดับ

1. **Signal outcome:** ระบุ horizon แล้ววัดการเคลื่อนไหวหลังสัญญาณ, MFE/MAE, เวลาแตะระดับ และจำนวนตัวอย่าง โดยไม่เรียกทั้งหมดว่า win rate ของการเทรด
2. **Execution simulation:** จึงค่อยมี fill policy, spread, fee, slippage, funding สำหรับตลาดที่มีข้อมูล, position sizing และ open positions ที่ยังไม่จบ

สัญญาณที่เกิดหลังปิดแท่งไม่ควรได้ fill ที่ราคาปิดเดียวกันโดยอัตโนมัติ กำหนดจุดเริ่มที่ซื้อขายได้จริงหรือ next-bar assumption ให้ชัด ถ้า TP และ SL อยู่ในแท่งเดียวกันต้องรายงานกำกวม/ใช้ข้อมูลย่อย หรือใช้สมมติฐานอนุรักษนิยมที่ประกาศ ห้ามเลือกฝั่งชนะจาก OHLC อย่างเดียว

เก็บ signal snapshot แบบ append-only และ outcome ภายหลังแยกกัน มี `specRevision`, `engineVersion`, `dataSnapshotId`, `decisionAt`, `availableAt`, `horizon`, `outcomeStatus` เพื่อแยก historical reconstruction จากสิ่งที่ระบบรู้ตอนนั้น

ประวัติใน `candles()` จำกัด 8 หน้า และ cache เป็น window สำหรับคำนวณ ไม่ใช่คลังวิจัยหลายปี ต้องมี bounded historical download/dataset store ก่อนอ้างผลระยะยาว

เกณฑ์รับงาน: reproducible run, coverage/missing data, unresolved outcomes, chronological holdout, ค่า net หลังต้นทุน และ baseline เดียวกัน; ไม่ใช้ win rate เดี่ยว ๆ ตัดสินคุณภาพ

### P2-A — ระบุสภาพตลาดและมีสถานะ “ยังไม่เข้าเงื่อนไข”

เริ่มด้วยกฎอธิบายได้จากข้อมูลที่มี เช่น slope ของ MA, ADX, ATR/price หรือ BB width แยก trend/range กับ high/low volatility ตามนิยามที่ versioned ตัวอย่างเหล่านี้เป็นสมมติฐานที่ต้องทดสอบ ไม่ใช่สูตรรับรอง

LLM ใช้บริบทนี้อธิบายว่ากฎตามเทรนด์กำลังเจอช่วงแกว่ง หรือ TF ขัดกัน แล้วเสนอร่างให้ตรวจ ห้ามเปลี่ยน active strategy เงียบ ๆ เปรียบเทียบกฎเดิมกับกฎเพิ่ม regime filter โดยดูทั้งผลลัพธ์ จำนวนสัญญาณที่เหลือ และความเสี่ยงจากการเลือกพารามิเตอร์

### P2-B — SMC แบบตรวจเวลาได้ เริ่มเล็ก

เริ่มจาก FVG/BOS ที่นิยามแน่นอนก่อน Order Block เต็มระบบ ตัวอย่างนิยาม FVG ขาขึ้น: low ของแท่งที่สาม > high ของแท่งแรก โดยรอแท่งที่สามปิด และระบุว่าจะกรองขนาดช่องว่างอย่างไร

Pivot ที่ต้องรอแท่งขวายืนยันต้องแยก `pivotAt` กับ `confirmedAt`; signal ใช้ได้หลัง confirmedAt เท่านั้น กำหนด wick/close break, touch/fill/invalidation และอายุโซน ไม่วาดย้อนหลังแล้วคิดว่า signal ใช้ได้ตั้งแต่ pivotAt

เพิ่มเฉพาะหลัง schema รองรับ event/zone และผ่าน causal-prefix/replay parity พร้อมวัดประโยชน์เพิ่มเทียบ baseline ไม่ยกคำว่า Smart Money เป็นหลักฐานว่าพบคำสั่งจริง

### P3 — ทดลอง predictive ML หลังมีชุดข้อมูลและการวัดผล

เริ่มจากคำถามแคบ เช่น “ผลตอบแทนจากจุดเข้าเชิงสมมติที่กำหนด ถึงอีก H แท่ง เกินต้นทุนหรือไม่” กำหนด exchange/market/pair/TF/horizon ก่อน การทำนาย close-to-close เป็นอีก target หนึ่งและต้องติดป้ายต่างจากผลซื้อขาย

ทดลอง logistic regression เป็น baseline ที่ตรวจง่าย ก่อนเทียบ gradient boosting หรือ neighbor classifier ไม่ใช้โมเดลใหญ่หรือ feature หลายพันตัวเป็นเป้าหมายในตัวเอง

- Features: returns หลายช่วง, ATR/price, RSI, ADX, volume ratio และ TF ใหญ่ที่ยืนยันแล้ว; scaler/feature selection fit เฉพาะ train
- Labels ใช้ข้อมูลอนาคตได้เพื่อสร้างผลลัพธ์ฝึก แต่จะเข้า training set ได้ต่อเมื่อ outcome นั้นทราบแล้ว ณ training cutoff
- แบ่ง train → validation/calibration → test ตามเวลา จัดการ label overlap ด้วยช่วงเว้น/การตัดตัวอย่างตาม event horizon ไม่สุ่มแถวปนอดีต–อนาคต [R7]
- เทียบ base rate, กฎเดิม และโมเดลภายใต้ข้อมูล/ต้นทุนเดียวกัน เก็บจำนวนทางเลือกที่ลอง ไม่แต่งพารามิเตอร์จาก test ซ้ำ
- ประเมิน log loss/Brier ร่วมกับ reliability diagram และจำนวนตัวอย่างต่อช่วงคะแนน; Brier ต่ำอย่างเดียวไม่ได้พิสูจน์ calibration ดีกว่า [R6]
- เก็บ model version, training cutoff, feature version, dataset hash และ expiry; ถ้าข้อมูลหรือโมเดลไม่พร้อมให้ abstain
- ทดลอง shadow mode: บันทึก prediction โดยยังไม่เปลี่ยน alert gate เพื่อดู drift และผลนอกชุดฝึก; shadow mode ไม่จำลอง fill หากยังไม่มี execution simulator

รับแนวคิด retraining/evaluation ของ FreqAI มาออกแบบ ไม่จำเป็นต้องย้าย SNAAP ทั้งระบบไป Freqtrade ใช้ offline research pipeline แยกจาก TypeScript alert engine ก่อน แล้วเลือกวิธีเสิร์ฟโมเดลเมื่อมีหลักฐานว่าคุ้ม

## 4. บทบาท AI ที่ต่อยอดได้เร็วที่สุด

LLM ปัจจุบันเหมาะกับการแปลภาษาคนเป็นกฎและอธิบาย structured evidence มากกว่าคิดเปอร์เซ็นต์จากภาพกราฟ

เสนอ tool ผลลัพธ์ read-only เช่น `explain_setup_context`: คืนรายการเงื่อนไขผ่าน/ไม่ผ่าน/ไม่ทราบ, TF, ค่าตัวชี้วัด, ราคาอ้างอิง, lastClosedAt, freshness และข้อขัดแย้ง โดยให้ engine เป็นผู้คำนวณ ตัวอย่างคำตอบที่ต้องทำได้:

> “เงื่อนไขเทรนด์ 1h ผ่าน แต่จังหวะ RSI 15m ยังไม่ตัดระดับที่ตั้งไว้ จึงยังไม่มีสัญญาณ ข้อมูล 15m ถึงเวลา … ส่วน 1h ถึงเวลา …”

ใช้เครื่องมือที่คำนวณสำเร็จแล้วเท่านั้น ไม่ให้ LLM สร้างค่าหรือ performance เอง เพิ่ม evaluation cases ที่ TF ขัดกัน, ข้อมูลขาด, replay มี events แต่ไม่มีกำไร, และผู้ใช้ถามโอกาสชนะโดยไม่มี calibration

## 5. แผนส่งมอบที่แนะนำ

| ระยะ | Deliverable | ขนาดโดยเปรียบเทียบ | Dependency / เกณฑ์ไปต่อ |
| --- | --- | --- | --- |
| A | Freshness metadata + evidence context + ตาราง TF เดิม | กลาง | ตรวจ timestamp contract และ replay/live parity ก่อนใช้ UI |
| B | ATR risk-plan + signal outcome ledger | กลาง–ใหญ่ | Snapshot immutable, เกณฑ์ outcome และ ambiguous case ชัด |
| C | Historical datasets + execution simulation + holdout reports | ใหญ่ | แหล่งประวัติ/ต้นทุนครบ; run ทำซ้ำได้ |
| D | Regime/SMC experiments | กลาง–ใหญ่ตาม schema | เปรียบเทียบประโยชน์เพิ่มบนข้อมูลทดสอบเดียวกัน |
| E | ML baseline, calibration, shadow mode | ใหญ่และเป็นงานทดลอง | ต้องมี C; ตัดสินจากหลักฐาน ไม่รับประกันว่าจะดีกว่ากฎเดิม |

ขนาดเป็นการประเมินความซับซ้อน ไม่ใช่กำหนดวันส่ง จุดเริ่มที่แนะนำคือ A เพราะแก้ปัญหาที่ตรวจพบและใช้ของเดิมได้มากที่สุด B/C จำเป็นก่อนโชว์ตัวเลขผลลัพธ์ D/E เลือกทำตามผลทดลอง

## 6. สิ่งที่ยังไม่ควรนำมาใช้

- BUY/SELL % ที่ไม่มี target/horizon/calibration หรือสูตรคะแนนเปิดเผย
- ตาราง 12 TF ก่อนตรวจ capability/cost ของทุก TF; ใช้ 5 TF เดิมก่อน
- Copy protected Pine หรือเรียกการ import JSON ว่ารัน Pine ได้; ดูข้อจำกัดเดิมใน `dist/indicator-import.js`
- เพิ่มอินดิเคเตอร์จำนวนมากแล้วให้โหวตเท่ากันทุกตัว
- ให้ LLM ตัดสินทุก tick หรือแก้ active rules ตามข้อความอัตโนมัติ
- อ้างว่า XAUUSD ของ broker กับ token ทอง/คริปโตคู่ใดคู่หนึ่งเป็น feed ทดแทนกัน

## 7. การตรวจและข้อจำกัดของงานนี้

- อ่านโค้ด engine, preview, markets, realtime, monitor, harness, UI evidence และ audit tests ประกอบเอกสารเดิม
- ค้น/อ่านแหล่งต้นทางด้าน technical ratings, SMC, ML lifecycle, calibration และ bias; สคริปต์ตั้งต้นอาศัยหน้าเผยแพร่ที่เปิดอ่านในบทสนทนานี้ ไม่ได้เข้าถึง protected source
- ลองรัน `node --import tsx --test tests/signals-market-window-audit.test.ts` แต่ checkout ไม่มี package `tsx` จึงไม่เริ่มชุดทดสอบ ไม่รายงานว่ารันผ่านในงานนี้
- Freshness finding อ้างโค้ดปัจจุบันและ fixture/audit ที่มีอยู่ ไม่ได้วัดความล่าช้ากระดานจริง
- ยังไม่ได้ benchmark โมเดล, backtest ผลตอบแทน, ทดสอบ provider สด หรือ audit license สำหรับนำโค้ดภายนอกมาใช้
- งานรอบนี้เพิ่มรายงานเท่านั้น ข้อเสนอ API/schema ทั้งหมดเป็น proposed ไม่ใช่ implementation ที่ส่งมอบแล้ว

## แหล่งอ้างอิง

[R1]: https://th.tradingview.com/script/hhCnmsRO/
[R2]: https://www.tradingview.com/support/solutions/43000614331-technical-ratings/
[R3]: https://tr.tradingview.com/script/WhBzgfDu-Machine-Learning-Lorentzian-Classification/
[R4]: https://www.luxalgo.com/library/indicator/smart-money-concepts-smc/
[R5]: https://www.freqtrade.io/en/stable/freqai/
[R6]: https://scikit-learn.org/stable/modules/calibration.html
[R7]: https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html
[R8]: https://www.freqtrade.io/en/stable/lookahead-analysis/
[R9]: https://www.freqtrade.io/en/stable/recursive-analysis/
[R10]: https://www.tradingview.com/pine-script-docs/concepts/repainting/
[R11]: https://www.tradingview.com/support/solutions/43000501823-average-true-range-atr/

- [R1 — สคริปต์ตั้งต้น][R1]
- [R2 — Technical Ratings][R2]
- [R3 — Lorentzian Classification][R3]
- [R4 — SMC ของ LuxAlgo][R4]
- [R5 — FreqAI][R5]
- [R6 — Probability calibration][R6]
- [R7 — TimeSeriesSplit][R7]
- [R8 — Lookahead analysis][R8]
- [R9 — Recursive analysis][R9]
- [R10 — Repainting][R10]
- [R11 — ATR][R11]
