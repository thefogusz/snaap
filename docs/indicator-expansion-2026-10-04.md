# ขยายอินดิเคเตอร์ SNAAP — 4 ตุลาคม 2026

## ขอบเขตที่ส่งมอบ

จากเดิม 31 ตัวเลือก เพิ่ม 96 เส้น/ผลลัพธ์ รวม 127 ตัวเลือก built-in (ไม่รวม CUSTOM) ไม่ใช่ 127 ตระกูลอินดิเคเตอร์: หลายตระกูลมีหลายเส้น เช่น KDJ K/D/J, Ichimoku Tenkan/Kijun/Cloud A/B

รายชื่อจริงอยู่ใน `dist/indicator-catalog.js` ใช้ร่วมกันโดยตัวคำนวณ ตัวตรวจสเปก UI คู่มือและคำสั่ง Harness เพื่อป้องกันชื่อ/พารามิเตอร์ไม่ตรงกัน กราฟและการแจ้งเตือนใช้ `value()` ตัวเดียวกัน

## สิ่งที่ค้นพบจากข้อมูลทางการ

- [Binance TradingView](https://www.binance.com/en-GB/support/faq/how-to-use-tradingview-on-binance-website-8419126024404348a1c6e4039fbed3fe): มีกราฟ TradingView และการเพิ่มอินดิเคเตอร์มาตรฐาน
- [Bybit Trading Chart](https://www.bybit.com/en/help-center/article/Bybit-Trading-Chart-FAQ): แยกแหล่งราคา/กราฟและการตั้งค่าของกราฟ
- [OKX chart settings](https://www.okx.com/it/help/candlestick-faqs-and-settings): มีทั้งอินดิเคเตอร์กราฟเดิมและการเลือกกราฟ TradingView
- [Bitget Signal Bot](https://www.bitget.com/support/articles/12560603823397): รับสัญญาณ TradingView เป็นอีกช่องทางหนึ่ง ไม่ได้แปลว่ารัน Pine ใน SNAAP ได้
- [MEXC Original / TradingView](https://www.mexc.com/en-GB/learn/article/how-to-customize-k-line-chart-colors-and-technical-indicators/1): มีสองรูปแบบกราฟ; [MACD/BOLL/KDJ alerts](https://www.mexc.com/announcements/article/mexc-futures-market-alerts-feature-introduces-3-new-types-of-indicator-alerts-17827791516418) ยืนยันชุดสำคัญที่ควรมี

เอกสารเหล่านี้ไม่ใช่รายการเครื่องมือทั้งหมดที่ตรวจครบทุกบัญชี/ภูมิภาค/แอป จึงไม่ติดป้ายว่าเหมือนทุกกระดาน 100%

## Repo ที่พิจารณา

| Repo | ผลการพิจารณา |
| --- | --- |
| [TA-Lib](https://github.com/TA-Lib/ta-lib) | แหล่งอ้างอิงมาตรฐาน BSD; wrapper `talib-web@0.1.3` ที่ทดลองโหลดไฟล์ WASM ใน Node 25 ไม่สำเร็จ และพบข้อควรตรวจเรื่องขอบเขตอาร์เรย์ จึงถอด dependency ที่ทดลองออก |
| [technicalindicators](https://github.com/anandanand84/technicalindicators) | MIT; ใช้ 3.1.0 เป็น dev dependency สำหรับการเทียบอิสระ ไม่ใช้ convenience StochRSI ที่ปัด RSI เหลือ 2 ตำแหน่งในการเทียบ full precision |
| [trading-signals](https://github.com/bennycode/trading-signals) | พิจารณาแนวทาง stateful/streaming แต่ไม่ใช้เพิ่ม dependency ซ้ำในรอบนี้ |
| [@ixjb94/indicators](https://github.com/ixjb94/indicators) | MIT, pure TypeScript/JS, ไม่มี native build; pin 1.2.6 ใช้เฉพาะเมธอดที่มี implementation ไม่แสดง stub `ikhts`, `mama`, `pc` |

คงตัวคำนวณเดิมไว้เพื่อไม่เปลี่ยนความหมายของเซตอัปเดิม ใช้ไลบรารีผ่าน adapter; เขียน VWAP session, Supertrend, KDJ, StochRSI, Ichimoku alignment และ Coppock เพิ่มตามสูตรที่ระบุ

## ความหมาย/ข้อควรเทียบ

- [Supertrend](https://www.tradingview.com/support/solutions/43000634738-supertrend/): ATR แบบ Wilder; SNAAP direction +1 ขาขึ้น / −1 ขาลง ซึ่งต้องระวัง sign convention เมื่อย้ายสูตร Pine
- [Ichimoku](https://www.tradingview.com/support/solutions/43000589152-ichimoku-cloud/): แสดง Tenkan, Kijun และเมฆที่เวลาเดียวกับแท่งตรวจ โดยนำ Span A/B จากอดีตตาม displacement ไม่ใช้ราคาจากอนาคต ไม่มี Chikou ที่ย้อนหลังแล้วนำข้อมูลอนาคตมาตัดสิน
- Session VWAP รีเซ็ตตามวัน UTC โดยใช้เวลาเปิดแท่งจากเวลาปิดลบความยาวกรอบเวลา; Rolling VWAP ไม่รีเซ็ตตามวัน
- KDJ เริ่ม K/D ที่ 50 แล้ว smooth แบบเวียนกลับ; Stochastic K/D ใช้ SMA แยกต่างหาก จึงไม่ตั้งชื่อให้ดูเหมือนกัน
- OBV, ADL, NVI/PVI เริ่มจากขอบเขตแท่งที่โหลด จุดเริ่มต้นอาจต่างจากกราฟกระดาน
- Historical volatility ของไลบรารีใช้ราก 252 ไม่อ้างว่าเป็นความผันผวนรายปีสำหรับกรอบคริปโตทุกช่วง
- ทำให้ค่าไม่สิ้นสุดเป็น UNKNOWN และรีเซ็ตชุดคำนวณเมื่อแท่งขาด ไม่เติม 0 เพื่อสร้างสัญญาณ
- cache เก็บอนุกรมที่คำนวณแล้วตามชุดแท่ง/พารามิเตอร์ เพื่อไม่เรียกคำนวณทั้งชุดซ้ำทุกแท่ง กราฟยังใช้เฉพาะค่าที่เวลาประเมิน
- จำนวนแท่งตั้งต้นเพิ่มตามพารามิเตอร์หลายชั้น; หากกระดานไม่มีประวัติพอ ค่าเริ่มต้นยังเป็น UNKNOWN

## การตรวจที่ทำแล้ว

- 96 ตัวเลือกใหม่: ค่าตั้งต้นคืนผล finite, ประวัติสั้นไม่ throw, ผลที่แท่งอดีตไม่เปลี่ยนเมื่อเพิ่มแท่งอนาคต, ข้อมูลขาดเทียบเท่าการเริ่มชุดใหม่
- สูตรมือ: OBV, VWAP rolling/session, Ichimoku displacement
- เทียบอิสระกับ technicalindicators: ADX, +DI, −DI, SAR, OBV, Stochastic D, StochRSI K/D และ CCI แบบ HLC3
- TypeScript ผ่าน; test suite 185/185 ผ่าน ณ ตอนขยายชุดนี้ รวม JSON schema ของ Harness และสูตรมือ Supertrend / VWAP ที่ขอบวัน UTC
- ไม่ได้ตรวจตัวเลขทั้ง 127 ผลลัพธ์กับกราฟสดของทั้ง 5 กระดานทุกตลาด/ทุกพารามิเตอร์ การทดสอบไลบรารีไม่ใช่หลักฐานสำหรับคำรับรองนี้

## ขอบเขตที่ต้องใช้ข้อมูลหรือช่องทางเพิ่ม

- Pine arbitrary/protected/invite-only: ไฟล์ JSON v1 เป็นสูตรจำกัด ไม่ใช่ Pine runtime ทางเลือกคือรับ TradingView webhook พร้อมการตรวจลายเซ็น/เวลาสัญญาณ/สิทธิ์ ก่อนอ้างว่ารองรับสคริปต์นั้น
- [Volume Profile](https://www.tradingview.com/support/solutions/43000502040-volume-profile-indicators-basic-concepts/): ต้องใช้ข้อมูลกรอบย่อย/การกระจายวอลุ่มตามระดับราคาและนิยามช่วง profile ไม่สร้าง POC/VAH/VAL ปลอมจากวอลุ่มรวมของแท่งเดียว
- Funding/OI/order book/delta/mark/index price: ต้องต่อแหล่งข้อมูลเฉพาะและจัดเวลาให้ตรงกับ evaluator ก่อนเปิดใช้ ไม่แทนด้วย last-trade OHLCV
- Hilbert/MAMA และ candlestick-pattern scanner เป็นชุดเพิ่มเติม ไม่ได้เพิ่มเมธอด stub หรือ pattern ที่ยังไม่มีตัวคำนวณ

ดังนั้นชุดนี้ขยายการใช้งานมาตรฐานอย่างมาก แต่ยังไม่ใช่การรันอินดิเคเตอร์ทุกชนิดบนทุกแพลตฟอร์มโดยไม่มีข้อจำกัด
