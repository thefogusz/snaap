# หลักฐานและการเลือกเทคโนโลยี

ตรวจเอกสารวันที่ 3 ตุลาคม 2026 ลิงก์จากคอมมูเป็นรายงานเฉพาะกรณี ไม่ใช่ผลทดสอบ snaap หรือข้อสรุปว่าปัญหายังเกิดในทุกเวอร์ชัน วันนี้ยังไม่ได้ติดตั้ง/benchmark repo ใด

## ข้อเสนอเลือกใช้

| Repo / วิธี | นำมาใช้กับ snaap | ข้อจำกัดที่ต้องตรวจ |
|---|---|---|
| [CCXT](https://github.com/ccxt/ccxt) · MIT | catalogue, REST backfill, history adapters | unified API ไม่เท่ากับ capabilities เท่ากันทุกกระดาน; pin version/fixtures รายกระดาน |
| [pg-boss](https://github.com/timgit/pg-boss) · MIT | คิว import/delivery บน PostgreSQL ที่ใช้อยู่แล้ว | ทดสอบ lease/crash/retry/load; ไม่รับรอง exactly-once ที่ปลายทาง |
| [TA-Lib](https://github.com/ta-lib/ta-lib) · BSD-3-Clause core | numerical reference สำหรับ EMA/RSI/SMA และ golden fixtures | seed/smoothing/flat-series conventions ต้องเทียบชัด; wrapper license แยกจาก core |
| [Lightweight Charts](https://github.com/tradingview/lightweight-charts) · Apache-2.0 + NOTICE | กราฟเล็กในรายละเอียดสัญญาณ/ประวัติ | เป็น renderer ไม่ได้ให้ market data; เก็บ attribution notice และ link ตาม repo |
| [Freqtrade](https://github.com/freqtrade/freqtrade) · GPL-3.0 | ศึกษา lookahead/recursive checks, workflow research | ไม่ fork มาเป็นแกน snaap และไม่ได้ copy โค้ด; trading execution ไม่ตรงขอบเขต |
| Native exchange WS | realtime path และ final candle semantics | ต้องดูแล reconnect, rate budget, decoder, version แต่ละกระดาน |
| BullMQ | ทางเลือกหากพิสูจน์ว่า DB queue ไม่พอ | ยังไม่เพิ่ม Redis ตอนนี้; งาน CPU หนักต้องแยก worker ไม่บล็อก heartbeat |

License ที่ระบุเป็นสิ่งที่ repo ประกาศ ไม่ใช่การรับรองการใช้งานทางกฎหมายแบบครอบคลุม dependency ทุกตัว ก่อนนำโค้ดเข้าจริงให้บันทึก exact commit/package version, LICENSE/NOTICE, dependency tree และผลทดสอบใน lockfile/SBOM

## Evidence ledger

### R01 — Binance stream lifecycle

[เอกสารทางการ](https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md)

เอกสารระบุอายุ connection 24 ชั่วโมง และข้อจำกัด stream/ข้อความ control จึงออกแบบ reconnect rotation และ shared subscriptions อย่าถือว่าการเปิด socket ครั้งแรกสำเร็จเพียงพอสำหรับงาน 24/7 ข้อกำหนดนี้เป็นของ Spot; futures ต้องตรวจเอกสารแยก

### R02 — Bybit finality และ channel

[Kline](https://bybit-exchange.github.io/docs/v5/websocket/public/kline), [Connect](https://bybit-exchange.github.io/docs/v5/ws/connect)

`confirm=true` ระบุแท่งปิด และ public spot/linear ใช้ endpoint คนละชุด จึง map finality/market identity ใน adapter ไม่เดาจากชื่อคู่

### R03 — OKX units

[OKX API](https://www.okx.com/docs-v5/en/)

เอกสาร candle อธิบาย `confirm` และหน่วย volume ที่ต่างระหว่าง spot กับ derivatives จึงต้อง normalize units ก่อนใช้ volume ratio และแสดง price source/contract ใน evidence

### R04 — Bitget candle stream

[Candlestick Channel](https://www.bitget.com/api-doc/classic/contract/websocket/public/Candlesticks-Channel)

ตัวอย่างระบุ snapshot/update และข้อมูล volume หลายหน่วย การออกแบบ snaap จึงไม่สมมติว่ามี boolean finality รูปแบบเดียวกับ Bybit และกำหนดให้ตรวจ REST/next bucket behavior ใน acceptance tests

### R05 — PostgreSQL queue

[pg-boss repo](https://github.com/timgit/pg-boss), [Introduction](https://pgboss.io/introduction)

ผู้พัฒนาอธิบาย queue บน PostgreSQL และ atomic transactions เหมาะกับการลดจำนวนระบบที่ต้องดูแลในระยะแรก ข้อเสนอใช้กับ snaap เป็น engineering judgement ไม่ใช่ benchmark ว่าเร็วกว่า Redis

### R06 — Missing candles, incomplete current candle, exchange differences

[CCXT Manual](https://github.com/ccxt/ccxt/wiki/manual)

Manual เตือนว่าช่วง candle อาจขาดและ current candle ยังไม่สมบูรณ์ จึงต้องเก็บ quality/finality และไม่เติมข้อมูลเทียมโดยไม่บอก ข้อมูล history/private method ต้องตรวจ capability ทีละกระดาน

### R07 — Lookahead และ recursive warmup

[Freqtrade lookahead analysis](https://docs.freqtrade.io/en/stable/lookahead-analysis/), [recursive analysis](https://docs.freqtrade.io/en/latest/recursive-analysis/)

นำวิธีคิดเรื่องการไม่มองอนาคตและความต่างของ indicator เมื่อใช้ช่วงเริ่มต้นไม่เท่ากันมาเป็น release tests ของ snaap ใช้กฎ/evaluator เดียวกับ live replay และตรวจ convergence ก่อน certify สูตร

### R08 — MEXC adapter migration

[Spot introduction](https://www.mexc.io/api-docs/spot-v3/introduction), [Futures introduction](https://www.mexc.io/api-docs/futures/integration-guide), [ประกาศเปลี่ยน WebSocket](https://www.mexc.com/en-NG/announcements/article/mexc-v3-websocket-service-replacement-announcement-17827791522393)

ประกาศระบุการเปลี่ยน Spot WebSocket เป็น Protobuf ต้องตรวจ endpoint/schema ปัจจุบันก่อน implement ไม่ใช้ตัวอย่าง JSON เก่าตาม blog และไม่เอา repo bypass private API มาใช้กับ snaap การมี docs ไม่ยืนยันว่า key/ภูมิภาคของผู้ใช้เข้าถึง private method ได้

### R09 — LINE delivery semantics

[Retry failed API requests](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/), [Receiving messages](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [LINE Notify termination](https://notify-bot.line.me/)

LINE แนะนำ retry key เพื่อหลีกเลี่ยง request ซ้ำ แต่แยกจากการรับประกันข้อความถึงผู้ใช้ จึงแสดง ACCEPTED ไม่ใช่ READ และใช้ Messaging API แทน LINE Notify ที่ยุติแล้ว

### R10 — Telegram limits

[Bots FAQ](https://core.telegram.org/bots/faq), [Bot API](https://core.telegram.org/bots/api)

มีข้อจำกัดการส่งข้อความและสถานะ error จึงออกแบบ per-recipient/global queue budgets, Retry-After และ token ฝั่ง server ค่าจำกัดจริงต้องอ่านตอน implementation ไม่ฝังว่า unlimited หรือฟรีทุกปริมาณ

### R11 — TA-Lib และ charting

[TA-Lib core](https://github.com/ta-lib/ta-lib), [Lightweight Charts repo](https://github.com/tradingview/lightweight-charts)

TA-Lib เป็นแหล่งอ้างอิงด้านตัวเลข ส่วน chart repo ให้ renderer พร้อมเงื่อนไข attribution ไม่ใช่สิทธิ์ข้อมูลราคา ใช้กราฟเฉพาะหน้า evidence เพื่อไม่ทำหน้าแรกให้เหมือน trading terminal

### R12 — Structured output ยังผิดความหมายได้

[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

เอกสารระบุว่ายังมี mistakes ได้ จึงไม่ใช้ JSON ที่ parse ผ่านเป็นหลักฐานว่ากฎตรงใจผู้ใช้ ต้องมี semantic validation, unsupported/needs clarification response และ confirmation preview ที่ผูกกับ hash

### R13 — Data controls

[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

retention แตกต่างตาม endpoint/configuration และ abuse-monitoring policy จึงไม่ใช้ข้อความ “ข้อมูลไม่ออกจากเครื่อง” เมื่อมี external AI และไม่สัญญาว่า store=false ล้างข้อมูลทุกระบบได้

## บทเรียนจากคอมมูที่นำมาใช้

### R14 — Indicator ไม่ตรงกับอีกแพลตฟอร์ม

[Freqtrade issue #9181: Stochastic RSI](https://github.com/freqtrade/freqtrade/issues/9181)

ผู้รายงานพบค่าที่ไม่ตรงกับอีกแพลตฟอร์ม เป็นกรณีเฉพาะ indicator/version ไม่ใช่หลักฐานว่า Freqtrade คำนวณผิดทั้งหมด สิ่งที่นำมาใช้คือเก็บ algorithm version, input window, source และค่า raw เพื่อเทียบซ้ำได้ ไม่บอกผู้ใช้ว่าเลขต้องตรง TradingView ทุกกรณี

### R15 — Worker stalled

[BullMQ discussion #633](https://github.com/taskforcesh/bullmq/discussions/633)

discussion พูดถึง stalled jobs และ worker/CPU ไม่ได้พิสูจน์ว่า pg-boss จะไม่มีปัญหานี้ ข้อเสนอ snaap คือแยกงาน import/analysis ที่หนักจากรับราคาและส่งข้อความ พร้อมทดสอบ crash/retry และเก็บ duplicate protection ที่ระดับข้อมูล

### R16 — เหตุการณ์หายและ cooldown scope

[รายงานผู้ใช้เรื่อง signal capture](https://www.reddit.com/r/quantfinance/comments/1wp9ezt/built_a_tradingviewtopython_quant_research/), [TradingView webhook documentation](https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/)

ผลค้นคอมมูเล่าปัญหา event capture/cooldown เป็น hypothesis สำหรับออกแบบ regression tests ไม่ใช่ข้อเท็จจริงที่ยืนยันระบบของเขาแล้ว ใช้หลักเก็บเหตุการณ์ก่อน suppression, scope cooldown ตาม rule/instrument/direction, และ durable inbox

เอกสาร TradingView ยืนยันข้อกำหนด webhook ของตน; หากทำ inbound bridge ในอนาคตต้องรับและบันทึกเร็วแล้วค่อยทำงานหนัก ไม่ผูกการใช้งานหลักของ snaap กับ webhook จากแพลตฟอร์มอื่น

### R17 — เหตุผลที่เลือกประสบการณ์แชตก่อน

มาจากข้อกำหนดผู้ใช้ในโปรเจกต์นี้ ไม่ได้อ้างว่า community consensus: ผู้ใช้มีสูตรอยู่แล้ว ไม่อยากตั้งฟอร์มทีละช่อง และไม่ต้องการหน้าตาเว็บเทรดซับซ้อน จึงรักษา “คุยกับ snaap” เป็นหน้าแรก และแสดงกราฟ/สูตรลึกเฉพาะเมื่อขอรายละเอียด

## สิ่งที่ไม่เลือกตอนนี้

- repo ที่โฆษณา win rate โดยไม่มีการทดสอบอิสระ: ไม่ใช้เป็นสูตรเริ่มต้นที่อ้างผลตอบแทน
- โค้ดเลี่ยงข้อจำกัด private API, copy session cookies หรือ unofficial bypass: ไม่ใช้
- เรียก LLM ทุก price update: เพิ่มต้นทุน/latency และทำให้ตรวจซ้ำยาก
- ปั้น vector database เพื่อจำ preference ไม่กี่ช่อง: เริ่ม typed records+provenance ก่อน
- บังคับใช้ full trading terminal หรือ framework ซื้อขายทั้งชุด: ไม่ตรงงาน alert assistant
- แยก microservices/Kafka/Redis ทุกโมดูลตั้งแต่แรก: เพิ่มภาระก่อนมี workload ยืนยัน

## สิ่งที่ยังไม่ยืนยัน

ความเร็วจริงจากเครื่อง/เครือข่ายผู้ใช้, rate budgets สำหรับ workload ที่เลือก, access ของแต่ละภูมิภาค, ความครบของ private history, ค่าใช้จ่าย cloud/LINE/AI, และ license ของ dependency tree หลังเลือกเวอร์ชัน ต้องทำ integration spike และ benchmark ก่อนถือเป็น fact ของ snaap
