# TradingView Ideas → โอกาสพัฒนา SNAAP

5 ตุลาคม 2026 · Research & proposed backlog · ฐานโค้ด `735e2a9` · branch `codex/ai-signal-research`

อ่านคู่กับ [รายงาน AI / signal engine](ai-signal-research-2026-10-05.md) ซึ่งลงรายละเอียดเรื่อง freshness, replay, ATR, calibration และ ML

## ข้อสรุปสำหรับผลิตภัณฑ์

โอกาสที่เหมาะกับ SNAAP มากที่สุดคือ **นำไอเดียมาแปลงเป็นแผนที่เฝ้าติดตามได้**: แยกบริบท → trigger → รอยืนยัน → ยกเลิก → หมดอายุ → วัดผล โดยเก็บแหล่งที่มาและสิ่งที่ผู้ใช้ตัดสินใจเพิ่มไว้ครบ

หน้า Ideas เป็นแหล่งสมมติฐาน รูปแบบการสื่อสาร และความต้องการของผู้ใช้ ไม่ใช่ชุดกลยุทธ์ที่ผ่านการพิสูจน์แล้ว งานนี้ไม่ได้จัดอันดับผลกำไรของผู้เขียน และไม่ได้รับรองตัวเลขเศรษฐกิจ/ราคาที่กล่าวในโพสต์ว่าเป็นข้อมูลตลาดล่าสุด

## 1. ขอบเขตที่อ่านจริง

สำรวจ 4 มุมมองใน browser:

1. [Popular](https://www.tradingview.com/ideas/): 24 การ์ด
2. [Editors’ picks](https://www.tradingview.com/ideas/editors-picks/): 24 การ์ด
3. [Editors’ picks — Education](https://www.tradingview.com/ideas/editors-picks/?type=education): 24 การ์ด
4. [Most recent](https://www.tradingview.com/ideas/?sort=recent_extended): 24 การ์ด

รวม **96 การ์ด / 89 URL ไม่ซ้ำ** ใน snapshot ที่เปิดอ่าน คัดเปิดหน้าเนื้อหารายโพสต์ **18 เรื่อง**: 16 เรื่องจากฟีด และอีก 2 เรื่องจากการค้นเฉพาะเรื่อง Volume Profile กับ Open Interest รายชื่อทั้ง 18 อยู่ด้านล่าง

อ่านชื่อ คำโปรย และประเภทจากฟีด; สำหรับ 18 เรื่องอ่านเนื้อหาข้อความในหน้ารายละเอียด ไม่ได้ดูวิดีโอเต็ม ไม่ได้ตรวจกราฟทุกภาพ และไม่ได้ audit ซอร์สโค้ดของอินดิเคเตอร์ในภาพ การแบ่ง 20 กลุ่มในรายงานเป็น taxonomy สำหรับ SNAAP ที่สังเคราะห์เอง ไม่ใช่ประกาศว่ามี 20 หมวดทางการของ TradingView

**ไม่ได้อ่านทุกโพสต์ทั้งเว็บไซต์** ฟีดเปลี่ยนต่อเนื่องและมีหลายหน้ามาก ตัวอย่างรอบนี้ไม่สุ่มเชิงสถิติ จึงใช้ค้นหาความต้องการและขอบเขตฟีเจอร์ได้ แต่ใช้อ้างสัดส่วนความนิยมของทั้งชุมชนไม่ได้ หมวดที่ได้เพียงคำโปรยหรือผลค้นระบุระดับไว้ในตาราง ไม่แสดงว่าอ่านลึกเท่ากัน

## 2. สิ่งที่เห็นซ้ำและผลต่อ SNAAP

### 2.1 เงื่อนไขมีค่ามากกว่าป้าย Long/Short

[แผน AAPL][I04] แยกเงื่อนไขขาขึ้น ขาลง และกรณีไม่เข้า ขณะที่ [RIOT][I05] มีป้าย Long แต่เนื้อหาพิจารณาทั้ง bull count และ bear count ดังนั้นการรับไอเดียต้องอ่าน scenario ไม่ใช้ป้ายบอกฝั่งเป็นกฎตรง ๆ

เสนอให้แต่ละ scenario มี trigger, confirmation, invalidation และ expiry ของตัวเอง ถ้าข้อมูลยังไม่ครบให้คงเป็น draft ไม่เลือกฝั่งแทนผู้ใช้

### 2.2 การรอเป็นสถานะที่ต้องออกแบบ

[Break & Retest][I01] แยกการเบรก การกลับมาทดสอบ และการยืนยัน; [BTC Daily][I14] ระบุเงื่อนไขเมื่อราคาปิดผ่านระดับกับกรณีที่แผนเสีย SNAAP มี stages/withinBars/cancel อยู่แล้ว จึงต่อยอดเป็นแถบสถานะ “รอเบรก / รอรีเทสต์ / รอยืนยัน / ยกเลิก / หมดเวลา” ได้โดยใช้ evaluator เดิม

คำว่า “rejection”, “strong volume”, “successful retest” ยังไม่เป็นสูตร ต้องกำหนดตัวเลขหรือกฎก่อนแปลงเป็น alert คงคำอธิบายเดิมเป็น source claim แล้วบันทึก operational definition ที่ผู้ใช้เลือกแยกกัน

### 2.3 แหล่งข้อมูลและ TF เปลี่ยนความหมาย

[บทเรียน SMA][I07] เน้นว่า period เท่ากันบนต่าง TF ใช้ข้อมูลคนละช่วง ในฟีดมี Spot, perpetual, CFD, index และ continuous futures ปนกัน รวมถึง 2m, 5h, 3D, weekly ที่ SNAAP ยังไม่รองรับ

ก่อนสร้างกฎต้องยืนยัน venue + instrument + market + TF + price source ถ้าไม่รองรับให้บอกตรง ๆ ห้ามแทน CFD ด้วย Spot หรือ 5h ด้วย 4h โดยไม่เปิดเผย การปรับไอเดียมาคริปโตถือเป็นกลยุทธ์เวอร์ชันใหม่ที่ต้องทดสอบใหม่

### 2.4 ความผันผวนและผลลัพธ์ต้องมีหน่วย

[Volatility][I02] เปรียบเทียบหลาย lookback และแยกความผันผวนที่สังเกตจากการคาดการณ์ ส่วน [Expectancy][I03] ชี้ว่าความถี่ชนะต้องดูคู่กับขนาดกำไร/ขาดทุน

สำหรับ SNAAP: แสดง planned reward/risk แยกจาก realized payoff ratio; annualized volatility ต้องมี calendar convention; normalized distance เป็นหน่วยเปรียบเทียบ ไม่ใช่ probability โดยอัตโนมัติ

### 2.5 อ่านเพื่อคัดกรอง ไม่ใช่แปลงทุกประโยคเป็นจริง

ตัวอย่างที่พบ:

- [Volume Profile][I12] อธิบายบริบทกลับมารับเหนือกรอบ แต่ประโยคเรื่อง stop อาจไม่สอดคล้องกับฝั่ง Long จึงควร flag ให้ตรวจ ไม่ย้ายเป็น order rule อัตโนมัติ
- [OI][I13] ใช้คำว่า long/short ratio กับระดับ 50 โดยไม่มีหน่วยชัดในประโยคนั้น API แต่ละแหล่งอาจใช้สัดส่วนบัญชีหรือ ratio คนละนิยาม ต้องตรวจ contract ของแหล่งจริง [D2]
- [Elliott triangle][I10] มีการอธิบายย้อนหลังและถ้อยคำมั่นใจสูง การตรงเป้าในภาพหนึ่งไม่ใช่ผลทดสอบหลายตัวอย่าง
- [FOGO][I16] มี tag Harmonic Patterns แต่เนื้อหาหลักเป็น range breakout กับ RSI divergence จึงไม่ควรจัดประเภทจาก tag เพียงอย่างเดียว
- [PYUSD dominance][I08] เสนอความสัมพันธ์กับตลาดคริปโต แต่ไม่ได้ให้ rolling correlation หรือ causal test ในข้อความที่อ่าน จึงควรเก็บเป็น hypothesis

ผลต่อระบบ: เพิ่มการตรวจว่า SL อยู่ถูกฝั่ง, หน่วยถูก, วันที่ไม่หมดอายุ, แหล่งข้อมูลตรงกัน และค่าที่ AI เติมใหม่ถูกแยกจากค่าที่ผู้เขียนให้

## 3. แผนที่แนวคิด 20 กลุ่ม

ระดับอ่าน: **ลึก** = เปิดอ่านข้อความรายโพสต์; **ฟีด** = อ่านชื่อ/คำโปรย; **ค้น** = หลักฐานจากผลค้น/เอกสารประกอบ ยังไม่ใช่การอ่านกลยุทธ์หลายเรื่องในหมวดนั้น

| กลุ่ม | หลักการ / สิ่งที่ใช้ตรวจ | นำมาใช้ใน SNAAP | ความพร้อมและข้อจำกัด |
| --- | --- | --- | --- |
| 1. Trend following / pullback | ทิศทางใหญ่ + ราคากลับเข้าโซน + trigger | preset ตามเทรนด์ที่แยก filter/trigger | ตัวคำนวณ MA/Supertrend มี; ระบุ slope/zone ให้ชัด · ฟีดและลึก I14 |
| 2. Support/resistance / break-retest | เบรกระดับแล้วทดสอบใหม่ก่อนยืนยัน | stages, withinBars, cancel พร้อม progress UI | ระดับคงที่ทำได้มาก; เส้นเอียงอัตโนมัติต้องเพิ่ม anchor · ลึก I01/I04/I14 |
| 3. Range / mean reversion | กรอบราคาและการกลับเข้ากรอบ | preset range กับ no-trade เมื่อหลุดกรอบ | BB/RSI มี; ห้ามใช้ oversold เป็นคำสั่งซื้อเดี่ยว · ฟีด + I12 |
| 4. Momentum / oscillator | ระดับ การตัด และการเปลี่ยนโมเมนตัม | ตัวเลือกกฎและ evidence comparison | RSI/MACD มีแล้ว; ความเห็นตรงกันไม่เป็นอิสระ · ลึก I06/I16 |
| 5. Divergence | ราคาและ oscillator ทำ swing คนละทิศ | event divergence ที่มี confirmedAt | ยังต้อง pivot pairing, lag, tolerance; ไม่เท่ากับ RSI threshold · ลึก I16 |
| 6. Candlestick / rejection | body/wick และบริบทก่อนเกิดรูปแบบ | pattern event หรือสูตรแท่งที่ระบุชัด | schema ปัจจุบันไม่มี arbitrary lag/body arithmetic; ไม่แปลงคำว่าแท่งสวยเอง · ค้น D5 |
| 7. Triangle / flag / wedge / double top | โครงสร้างหลาย swing และการหลุดขอบ | annotation → scenario; เริ่มจากระดับที่ผู้ใช้ระบุ | scanner อัตโนมัติเป็นอีกงาน; projection ไม่รับประกัน target · ลึก I17 + ฟีด |
| 8. SMC / ICT / liquidity | BOS/CHoCH, sweep, FVG, OB | event/zone model และวงจร valid/mitigated/invalid | ต้องนิยามให้คำนวณได้; อ่านราคาไม่ได้ยืนยันสถาบัน · ฟีด + รายงาน AI เดิม |
| 9. Wyckoff / accumulation | ลำดับช่วงราคา/volume และ spring/upthrust | template narrative และ sequence เมื่อระบุกฎครบ | phase label มีดุลพินิจ; ไม่เปิด auto-classification ก่อนพิสูจน์ · ค้น D6 |
| 10. Fibonacci / harmonic | anchor swing และ ratio geometry | anchored levels, tolerances, invalidation | ต้อง version anchor และเวลาทราบ pivot; ไม่ใช้ tag เป็นหลักฐาน · ลึก I18 + ฟีด |
| 11. Elliott Wave | หลาย wave count และ alternative scenario | เก็บ competing hypotheses พร้อม invalidation | ไม่ควรเริ่มจาก AI นับคลื่นอัตโนมัติ; แยกบทเรียนกับกฎเฉพาะผู้เขียน · ลึก I05/I10 |
| 12. Gann / Hurst / cycles | ระยะเวลา ระดับราคา และวงจรสมมติ | annotated research / experiment | เสี่ยงเลือกจุดย้อนหลังและการเลื่อนข้อมูล; ใช้ holdout · ลึก I11 + Gann ในฟีด |
| 13. Volume / VWAP / Volume Profile | participation และการกระจายตามราคา | volume ratio/VWAP ใช้ก่อน; POC/VAH/VAL ภายหลัง | VP ต้อง lower-TF/volume distribution และนิยามช่วง ไม่สร้างจาก OHLCV แท่งเดียว [D1] · ลึก I12 |
| 14. OI / funding / liquidation / order flow | participation/carry และข้อมูลอนุพันธ์ | context panel ต่อสัญญาและ venue | ต้อง feed เฉพาะ, หน่วย, latency, coverage; OI เพิ่มไม่ระบุฝั่งชนะเอง [D2–D4] · ลึก I13 |
| 15. Multi-timeframe | TF ใหญ่บริบท TF เล็กจังหวะ | ตาราง TF และอธิบายข้อขัดแย้ง | มี 5 TF ใน engine; ใช้ closed/as-of เท่านั้น · ลึก I01/I07 |
| 16. Volatility / regime / normalization | ATR, realized vol, standardized distance | risk-plan, regime context, เปรียบเทียบหน่วย | ATR/STDDEV มี; expression/normalization ใหม่ต้อง version สูตร ไม่รับสูตรพิเศษจากโพสต์โดยไม่มี audit · ลึก I02/I06 |
| 17. Intermarket / relative strength / breadth | เปรียบเทียบ coin กับ BTC, dominance, universe | relative-strength view และ benchmark context | operands ปัจจุบันไม่มี instrument อื่น; pairs[] ประเมินแยก ไม่ใช่ spread/correlation · ลึก I08/I09 |
| 18. Macro / news / fundamentals | event, policy, earnings, valuation | event context + planned pause/expiry | ต้อง data provider, release/revision time; claims ในโพสต์ไม่ใช่ verified feed · ฟีด |
| 19. Risk / expectancy / execution | entry/stop/target, payoff, costs, invalidation | scenario card และ outcome report | replay ปัจจุบันไม่ใช่ P&L; fills ต้องจับคู่ก่อนวิเคราะห์ completed trades · ลึก I02/I03/I04 |
| 20. Psychology / journal / education | กระบวนการทบทวนและทำตามแผน | self-reported tags, pre-trade note, review prompts | มี import/history skill; ห้ามวินิจฉัย FOMO/revenge จาก fills อย่างเดียว · ลึก I15 |

กลุ่มอื่นที่ยังไม่ได้ลงลึกพอ: options Greeks/volatility surface, pairs-trading/cointegration, seasonality แบบหลายปี, on-chain wallet attribution และ arbitrage execution หากจะใช้กับผลิตภัณฑ์ต้องรีเสิชและตรวจ data contract เพิ่ม ไม่รวมเป็นฟีเจอร์พร้อมทำจากรอบนี้

## 4. เทียบกับโค้ด SNAAP: อะไรต่อยอดได้และอะไรต้องเพิ่มฐาน

| จุดในระบบปัจจุบัน | ใช้ต่อยอด | ข้อจำกัดที่ตรวจพบ |
| --- | --- | --- |
| `src/domain/engine.ts` — COMPARE/GROUP/HOLD/stages/cancel/exit | break-retest และ conditional plans | สูงสุด 6 leaf comparisons รวมทั้งแผน; ไม่ใช่ทุก narrative จะใส่ได้ |
| `advanceSingle()` และ Lifecycle | progress tracker, expired/cancelled history | stage เดินตามแท่งปิด; อย่าสมมติหลายเหตุการณ์ภายในแท่งจาก OHLC |
| `src/domain/preview.ts`, `dist/studio.js` | evidence timeline และ scenario preview | UI เหตุผลมีอยู่แล้ว; เพิ่มความชัด ไม่สร้างเครื่องคำนวณอีกชุด |
| `src/ai/harness.ts` | แปลงภาษาคน/ภาพเป็นร่างที่ตรวจ schema | ยังไม่พบ URL-reader tool สำหรับ Ideas; การอ่าน URL ในงานวิจัยนี้เป็นเครื่องมือของ Codex ไม่ใช่ความสามารถที่ SNAAP มีแล้ว |
| `src/presets.ts`, `dist/preset-catalog.js` | ขยาย playbook library | ปัจจุบันมี trend/cross/momentum/rebound/bands/supertrend; ต้องตรวจ semantics เมื่อเพิ่ม family ใหม่ |
| `src/setup-shares.ts`, setup-files/codes | share/remix แผน | มีโค้ดแชร์/import อยู่แล้ว; provenance/lineage/source-claim เพิ่มต่างหาก ไม่เสนอสร้าง sharing จากศูนย์ |
| `src/context.ts`, `src/ai/skills/trade-journal.md` | plan-vs-history review | summary เป็น fills ไม่ใช่ completed positions; ไม่มีหลักฐานเจตนาหรืออารมณ์จาก fills ล้วน |
| `src/markets.ts`, `src/realtime.ts` | เพิ่ม metadata และ context sources | freshness และ capability ต้องแก้ก่อนหลาย feed; stock/CFD/options ยังไม่ใช่ตลาดที่รองรับ |

## 5. Backlog ที่แนะนำหลังขยาย scope

ลำดับนี้เป็นข้อเสนอจากความเข้ากันกับโค้ดและประโยชน์ต่อผู้ใช้ ยังไม่ใช่ข้อสรุปจาก user research หรือ A/B test

| ลำดับ | ฟีเจอร์ | ผลลัพธ์ที่ผู้ใช้ได้รับ | เกณฑ์รับงานสำคัญ |
| --- | --- | --- | --- |
| P0 | Freshness & source identity | รู้ว่าแผนใช้ตลาด/แท่งล่าสุดถูกชุดหรือไม่ | แยกช้า/ตามทันรายคู่/TF; ไม่แทน instrument เงียบ ๆ |
| P1 | Idea → structured draft | วางข้อความ/ภาพ แล้วเห็น trigger/confirmation/invalidation ที่แก้ไขได้ | ทุกค่าระบุ source หรือ user choice; คำกำกวมคง unresolved |
| P1 | Scenario card & waiting timeline | เห็นแผนหลัก แผนสำรอง และสาเหตุที่ยังไม่แจ้งเตือน | อ่านจาก state จริง; LONG/SHORT แยกเงื่อนไข; ไม่เพิ่มคำมั่นใจเอง |
| P1 | Playbook presets | เริ่มจาก break-retest, pullback, range, momentum | label ทดลอง; count <= 6 comparisons หรือระบุว่าต้องเปลี่ยน schema |
| P1 | Risk-plan + expiry | เห็นระดับยกเลิก เป้า และอายุแผน | ตรึงค่าอ้างอิง; ไม่เรียก reference ว่า fill; absolute expiry ต้องเพิ่มจาก stage timeout |
| P2 | Multi-TF / regime context | เข้าใจกรอบที่ขัดกันและสภาพตลาด | closed/as-of และ UNKNOWN; คะแนนไม่เรียก probability |
| P2 | Outcome & execution research | ตรวจว่าหลัง alert เกิดอะไรขึ้นและ simulation สมมติอะไร | separate outcome/fill; ต้นทุนและ ambiguous bar ชัด |
| P2 | Provenance-aware share/remix | รู้แผนต้นฉบับ เวอร์ชัน และสิ่งที่แก้ | import สร้าง draft ของผู้ใช้; ไม่สืบทอดปลายทางแจ้งเตือน/สิทธิ์จากต้นทาง |
| P2 | Relative-strength dashboard | เห็นเหรียญอ่อนกว่า benchmark แม้ราคา USD เพิ่ม | synchronized datasets, missing/universe policy; เป็น cross-instrument feature ใหม่ |
| P3 | SMC/divergence/pattern events | เฝ้ารอ pattern ที่นิยามแน่นอน | confirmedAt, tolerance, state lifecycle, causal tests |
| P3 | Funding/OI/news context | เห็นบริบทที่ OHLCV ไม่มี | data contract/provider coverage; ไม่ปลอมค่าจากแท่งราคา |
| P3 | ML shadow experiment | ทดสอบว่าพยากรณ์ช่วยเหนือ baseline หรือไม่ | chronology/calibration/version/expiry และผลนอกชุดฝึก |

ถ้าทำเพียงชุดแรก: **freshness + idea draft + break-retest timeline + risk/expiry** ให้ผู้ใช้เปลี่ยนสิ่งที่อ่านเป็นแผนที่ตรวจได้ เป็นจุดต่างที่ใช้ฐาน SNAAP ได้มากกว่าการเพิ่มกราฟอินดิเคเตอร์อีกจำนวนมาก

## 6. ข้อเสนอรูปแบบข้อมูลสำหรับ Idea → Draft

นี่เป็น proposed contract ไม่ใช่ API ที่มีอยู่:

```text
IdeaSource
  canonicalUrl, author, publishedAt, updatedAt, capturedAt
  sourceKind: text | image | link
  sourceInstrument, sourceTimeframe
  sourceSummary, permittedExcerpt, attribution

ScenarioDraft
  sourceId, parentDraftId, specRevision
  side, supportedInstrument, evaluationTimeframe
  context[], trigger, confirmations[], invalidation, expiresAt
  referenceLevels[], plannedTargets[], assumptions[], unresolved[]

FieldEvidence
  fieldPath
  origin: author_claim | user_input | engine_computed | assistant_proposal
  sourceLocator, observedAt, explanation
```

เริ่มจากข้อความ/ภาพที่ผู้ใช้ส่งซึ่ง harness รองรับ ก่อนเพิ่ม URL fetcher; URL fetcher ต้องมี SSRF protection, redirect/size/time limits และอ่านเฉพาะแหล่งที่เข้าถึงได้ตามปกติ ไม่ bypass protected script หรือ login wall เนื้อหาโพสต์เป็น untrusted data ไม่ใช่คำสั่งให้ agent ส่งข้อความหรือเปลี่ยนกฎ

เก็บ attribution และสรุปที่จำเป็น ไม่ทำ mirror บทความทั้งหมด การเผยแพร่ไฟล์/โค้ดต้นฉบับต่อหรือ automated bulk ingestion ต้องตรวจสิทธิ์และเงื่อนไขแยกก่อนทำจริง

### ตัวอย่างการแปลงแบบแสดงช่องว่าง

ต้นแบบจาก I01: เบรก → รีเทสต์ → ยืนยัน → เข้า

1. ให้ผู้ใช้ระบุระดับ L, tolerance, จำนวนแท่งรอ และนิยามยืนยัน
2. draft ตัวอย่าง: close 15m ตัดเหนือ L (1 comparison)
3. stage 1: low <= L+tolerance และ close >= L (2 comparisons)
4. stage 2: RSI(14) > ระดับที่ผู้ใช้เลือก (1 comparison)
5. cancel: close < ระดับยกเลิกที่ผู้ใช้เลือก (1 comparison)
6. exit: ENTRY_RETURN >= เป้าที่ผู้ใช้เลือก (1 comparison)

รวม 6 comparisons ตามขีดจำกัดปัจจุบัน เป็น **ตัวอย่างนิยามที่เราเสนอ** ไม่ใช่สูตรจากผู้เขียน I01 และไม่ใช่ preset ที่ทดสอบกำไรแล้ว ถ้าต้องเพิ่ม trend filter 1h หรือแผน Short อิสระ ต้องปรับขอบเขตกับผู้ใช้หรือออกแบบ schema revision ไม่ตัดเงื่อนไขทิ้งเงียบ ๆ

ลำดับ stage นี้ต้องเกิดตามแท่งที่ engine ประเมิน ไม่อ้างว่าเห็น breakout และ retest ภายในแท่งเดียวกันจาก OHLC การเปลี่ยน timeframe จะเปลี่ยนความหมายของ withinBars; แสดงเวลาโดยประมาณประกอบ

## 7. วิธีคัดกรองไอเดียเพื่อพัฒนาต่อ

ไม่ให้ยอด boost หรือป้าย Editors’ picks เป็นคะแนนความแม่นยำ ใช้ rubric ต่อไปนี้เป็นป้ายข้อมูล ไม่รวมเป็นเปอร์เซ็นต์โอกาสชนะ:

- **ชัดเจน:** instrument/TF/trigger/invalidation/horizon ครบหรือไม่
- **คำนวณได้:** แปลงเป็นกฎได้หรือยังต้องใช้ดุลพินิจ
- **ข้อมูลพร้อม:** SNAAP มี feed และหน่วยที่ต้องใช้หรือไม่
- **รู้ทันเวลา:** ข้อมูล/จุด pivot รู้จริงเมื่อไร
- **ทดสอบได้:** มี baseline, costs, coverage และ outcome definition หรือไม่
- **ประโยชน์เพิ่ม:** ลดขั้นตอนผู้ใช้หรือเพิ่มข้อมูลที่ระบบยังไม่มีจริงหรือไม่

การประเมิน author performance ต้องเก็บ forecast ก่อนผลเกิด รวมโพสต์ยกเลิก/แพ้/หมดเวลา และ revision history ไม่เลือกดูเฉพาะตัวอย่างชนะ การอ่านโพสต์ย้อนหลังในงานนี้ไม่พอสร้าง leaderboard ความแม่นยำ

## 8. ชุดทดสอบที่ควรใช้เมื่อเริ่ม implementation

1. URL/ภาพที่ไม่ระบุ venue → ไม่ผูกกับ Binance โดยอัตโนมัติ
2. ป้าย Long แต่เนื้อหามี bear scenario → แยกเป็น 2 hypothesis
3. เขียนว่า “รอยืนยัน” แต่ไม่มีนิยาม → unresolved ไม่สร้าง threshold เอง
4. Long plan แต่ SL อยู่เหนือ reference → flag ความขัดแย้ง ไม่ย้ายฝั่งเงียบ ๆ
5. TF 2m/5h/3D → แจ้ง unsupported ไม่ปัดเป็น TF ใกล้เคียง
6. narrative 9 conditions → แสดง limit 6 และข้อที่ยังไม่ได้แปลง
7. pattern ที่ทราบภายหลัง → confirmedAt เท่านั้นจึงใช้ trigger ได้
8. โพสต์แก้หลังราคาแตะเป้า → เก็บ captured version และไม่ยกเป็น prospective win
9. คำว่า 60% confidence → คงเป็น author claim หากไม่มีวิธีคำนวณ
10. fills ไม่มี signal link → ไม่สรุปว่าผู้ใช้ผิดแผนหรือ revenge trade
11. แท่งล่าสุดช้า → context และ monitor แสดงเวลาตรงกัน
12. imported share → draft ของเจ้าของใหม่, permission/destination ไม่ขยายตามข้อมูลภายนอก

## 9. Catalogue ของ 18 หน้าที่อ่านรายละเอียด

ชื่อใช้เพื่อระบุแหล่ง เนื้อหาในตารางเป็นข้อสรุปเพื่อออกแบบผลิตภัณฑ์ ไม่ใช่คำแนะนำซื้อขายตามราคาในโพสต์

| ID | แหล่ง | สิ่งที่นำมาพิจารณา |
| --- | --- | --- |
| I01 | [How to Confirm a Retest: The Break & Retest Process][I01] | sequence และความหมาย confirmation |
| I02 | [Check volatility before reusing yesterday’s trade plan][I02] | volatility หลายช่วงและ sizing context |
| I03 | [Win Rate, Risk-Reward, and Expectancy: A Practical Guide][I03] | อย่าวัดผลงานด้วย win rate อย่างเดียว |
| I04 | [AAPL Calls or Puts? This Box Decides the Trade][I04] | สอง scenario + no-trade + session |
| I05 | [RIOT: Meltdown or meltup?][I05] | alternative counts แม้ป้าย Long |
| I06 | [How Far Is Far? From Price Distance to Standardized RSI][I06] | หน่วย normalized distance; สูตรเฉพาะต้อง audit เพิ่ม |
| I07 | [Your moving average didn’t change settings. So why did it move?][I07] | period/TF semantics |
| I08 | [PYUSD - PayPal Stablecoin Clues][I08] | intermarket hypothesis และความสัมพันธ์ที่ยังไม่ได้วัด |
| I09 | [Your Portfolio Can Bleed While Bitcoin Looks perfect][I09] | benchmark-relative strength |
| I10 | [Part 4 Elliott Waves: Professional Guide to the Triangle Pattern][I10] | annotations, invalidation, retrospective claims |
| I11 | [Cycle Fundamentals II: Translating cycles into price projections][I11] | projections เป็นสมมติฐานและมี invalidation |
| I12 | [How to Use Fixed Range Volume Profile on TradingView][I12] | profile anchors และ semantic validation |
| I13 | [Open Interest - Deciphering Bitcoin’s Market Sentiment][I13] | feed เฉพาะอนุพันธ์ และหน่วย ratio |
| I14 | [BTC/USD — Daily Chart][I14] | closed-bar breakout / alternate path |
| I15 | [Trading Psychology Explained: Fear, Greed, FOMO & Revenge Tradin][I15] | review workflow โดยไม่วินิจฉัยผู้ใช้ |
| I16 | [FOGO/USDT:Accumulation Range Breakout With Bullish Divergence][I16] | divergence + range + targets; tag ไม่พอจำแนก |
| I17 | [$STX is going for Double Top, BEARISH][I17] | pattern ยังรอยืนยันและ measured projection |
| I18 | [2300 Down Today.. Now what to do?][I18] | harmonic/volume/divergence ที่ยังต้องนิยามก่อนรัน |

## 10. หลักฐานและสถานะส่งมอบ

งานนี้เพิ่มเอกสารสองฉบับและข้อเสนอเท่านั้น ไม่ได้เพิ่มฟีเจอร์ ไม่ได้ส่งคำสั่งซื้อขาย ไม่ได้ใช้ข้อมูลส่วนตัวของผู้ใช้เพื่อวิจัยชุมชน

อ้างอิงโค้ดและเอกสารทางการประกอบ แต่ไม่มีการยืนยันผลกำไร และไม่ได้ทดสอบโมเดลจริง ชุดทดสอบ freshness เดิมเริ่มรันไม่ได้เพราะ checkout ไม่มี `tsx`; รายงานจึงแยก source inspection จากผล test ที่รันใหม่

หัวข้อที่ยังต้องศึกษาต่อถูกระบุในข้อ 3 ไม่ถือว่าคำขอ “ทั้งหมด” หมายถึงอนุญาตให้สร้าง recurring monitor หรือ bulk scrape อัตโนมัติ งานนี้เป็นการสำรวจในรอบปัจจุบันเท่านั้น

[I01]: https://www.tradingview.com/chart/XAUUSD/ctZ2Cprr-How-to-Confirm-a-Retest-The-Break-Retest-Process/
[I02]: https://www.tradingview.com/chart/SPY/e1Tg7Ww0-Check-volatility-before-reusing-yesterday-s-trade-plan/
[I03]: https://www.tradingview.com/chart/ES1!/Ax6kl92Q-Win-Rate-Risk%2DReward-and-Expectancy-A-Practical-Guide/
[I04]: https://www.tradingview.com/chart/AAPL/2PzYnv13-AAPL-Calls-or-Puts-This-Box-Decides-the-Trade/
[I05]: https://www.tradingview.com/chart/RIOT/HYQD5PwU-RIOT-Meltdown-or-meltup/
[I06]: https://www.tradingview.com/chart/GC1!/AySE7b8j-How-Far-Is-Far-From-Price-Distance-to-Standardized-RSI/
[I07]: https://www.tradingview.com/chart/SPY/bjQDEcvR-Your-moving-average-didn-t-change-settings-So-why-did-it-move/
[I08]: https://www.tradingview.com/chart/PYUSD.D/wICKV2r7-PYUSD-PayPal-Stablecoin-Clues/
[I09]: https://www.tradingview.com/chart/ETHUSDT/hcW3g41B-Your-Portfolio-Can-Bleed-While-Bitcoin-Looks-perfect/
[I10]: https://www.tradingview.com/chart/GOLD/Fnj26mF8-Part-4-Elliott-Waves-Professional-Guide-to-the-Triangle-Pattern/
[I11]: https://www.tradingview.com/chart/IVV/XJbOYwMC-Cycle-Fundamentals-II-Translating-cycles-into-price-projections/
[I12]: https://www.tradingview.com/chart/BTCUSDT/3uky7Z7W-How-to-Use-Fixed-Range-Volume-Profile-on-TradingView/
[I13]: https://www.tradingview.com/chart/BTCUSDT/movbkGF5-Open-Interest-Deciphering-Bitcoin-s-Market-Sentiment/
[I14]: https://www.tradingview.com/chart/BTCUSD/uN462oiD-BTC-USD-Daily-Chart/
[I15]: https://www.tradingview.com/chart/XAUUSD/pbdfTnEL-Trading-Psychology-Explained-Fear-Greed-FOMO-Revenge-Tradin/
[I16]: https://www.tradingview.com/chart/FOGOUSDT/1McRBT2Z-FOGO-USDT-Accumulation-Range-Breakout-With-Bullish-Divergence/
[I17]: https://www.tradingview.com/chart/STXUSDT.P/PtugK6hi-STX-is-going-for-Double-Top-BEARISH/
[I18]: https://www.tradingview.com/chart/KSE100/1f3FqqKC-2300-Down-Today-Now-what-to-do/
[D1]: https://www.tradingview.com/support/solutions/43000502040-volume-profile-indicators-basic-concepts/
[D2]: https://bybit-exchange.github.io/docs/v5/market/long-short-ratio
[D3]: https://bybit-exchange.github.io/docs/v5/market/open-interest
[D4]: https://bybit-exchange.github.io/docs/v5/market/history-fund-rate
[D5]: https://www.tradingview.com/support/solutions/43000583769-engulfing-bearish/
[D6]: https://www.tradingview.com/ideas/search/WYCKOFF/

เอกสารตรวจประกอบ: [Volume Profile][D1], [Long/short ratio][D2], [Open Interest][D3], [Funding history][D4], [Candlestick definition][D5], [ตัวอย่าง Wyckoff ที่ค้นพบ][D6]
