(() => {
  const guides = {
    name: [(globalThis.SnaapI18n?.text("ชื่อเซ็ตอัพ") ?? "ชื่อเซ็ตอัพ"),(globalThis.SnaapI18n?.text("ตั้งชื่อให้จำได้ว่าเฝ้าคู่ไหนและรอจังหวะอะไร เช่น BTC ย่อในขาขึ้น") ?? "ตั้งชื่อให้จำได้ว่าเฝ้าคู่ไหนและรอจังหวะอะไร เช่น BTC ย่อในขาขึ้น"),(globalThis.SnaapI18n?.text("ชื่อช่วยแยกเซ็ตอัพ ไม่เปลี่ยนเงื่อนไขสัญญาณ") ?? "ชื่อช่วยแยกเซ็ตอัพ ไม่เปลี่ยนเงื่อนไขสัญญาณ"),'none'],
    exchange: [(globalThis.SnaapI18n?.text("เลือกกระดาน") ?? "เลือกกระดาน"),(globalThis.SnaapI18n?.text("ใช้ราคาและคู่เทรดจากกระดานนี้เท่านั้น ราคาเหรียญเดียวกันอาจต่างกันในแต่ละกระดาน") ?? "ใช้ราคาและคู่เทรดจากกระดานนี้เท่านั้น ราคาเหรียญเดียวกันอาจต่างกันในแต่ละกระดาน"),(globalThis.SnaapI18n?.text("เปลี่ยนกระดานแล้วตรวจคู่เทรดอีกครั้ง") ?? "เปลี่ยนกระดานแล้วตรวจคู่เทรดอีกครั้ง"),'source'],
    market: ['Spot / Futures',(globalThis.SnaapI18n?.text("Spot ใช้เงื่อนไขฝั่งซื้อ ส่วน Perpetual Futures ตั้ง Long หรือ Short ได้") ?? "Spot ใช้เงื่อนไขฝั่งซื้อ ส่วน Perpetual Futures ตั้ง Long หรือ Short ได้"),(globalThis.SnaapI18n?.text("Futures ตอนนี้รองรับสัญญา USDT · ระบบสร้างสัญญาณ ไม่ส่งออเดอร์") ?? "Futures ตอนนี้รองรับสัญญา USDT · ระบบสร้างสัญญาณ ไม่ส่งออเดอร์"),'source'],
    pair: [(globalThis.SnaapI18n?.text("คู่เทรด") ?? "คู่เทรด"),(globalThis.SnaapI18n?.text("เลือกสินทรัพย์และสกุลที่ใช้เทียบราคา เช่น BTC/USDT คือราคา BTC ในหน่วย USDT") ?? "เลือกสินทรัพย์และสกุลที่ใช้เทียบราคา เช่น BTC/USDT คือราคา BTC ในหน่วย USDT"),(globalThis.SnaapI18n?.text("รายการตรงกับกระดานและตลาดที่เลือก") ?? "รายการตรงกับกระดานและตลาดที่เลือก"),'source'],
    timeframe: [(globalThis.SnaapI18n?.text("รอบตรวจแท่งปิด") ?? "รอบตรวจแท่งปิด"),(globalThis.SnaapI18n?.text("ระบบประเมินเมื่อแท่งของรอบนี้ปิด เช่น 5m ตรวจทุกแท่ง 5 นาที ไม่ใช่ทุกครั้งที่ราคาขยับ") ?? "ระบบประเมินเมื่อแท่งของรอบนี้ปิด เช่น 5m ตรวจทุกแท่ง 5 นาที ไม่ใช่ทุกครั้งที่ราคาขยับ"),(globalThis.SnaapI18n?.text("กรอบเวลาของอินดิเคเตอร์แต่ละตัวเลือกต่างกันได้") ?? "กรอบเวลาของอินดิเคเตอร์แต่ละตัวเลือกต่างกันได้"),'time'],
    operandFrame: [(globalThis.SnaapI18n?.text("กรอบเวลาของค่านี้") ?? "กรอบเวลาของค่านี้"),(globalThis.SnaapI18n?.text("ใช้แท่งจากกรอบเวลานี้คำนวณค่าฝั่งนี้ เช่น EMA 200 บน 1h ใช้แท่งชั่วโมง") ?? "ใช้แท่งจากกรอบเวลานี้คำนวณค่าฝั่งนี้ เช่น EMA 200 บน 1h ใช้แท่งชั่วโมง"),(globalThis.SnaapI18n?.text("อ่านเฉพาะแท่งที่ปิดแล้ว · ต่างจากรอบตรวจเซ็ตอัพ") ?? "อ่านเฉพาะแท่งที่ปิดแล้ว · ต่างจากรอบตรวจเซ็ตอัพ"),'time'],
    kind: [(globalThis.SnaapI18n?.text("ชนิดค่า") ?? "ชนิดค่า"),(globalThis.SnaapI18n?.text("เลือกว่าจะตรวจราคา อินดิเคเตอร์ ตัวเลขคงที่ หรือผลตอบแทนจากจุดเริ่มสัญญาณ") ?? "เลือกว่าจะตรวจราคา อินดิเคเตอร์ ตัวเลขคงที่ หรือผลตอบแทนจากจุดเริ่มสัญญาณ"),(globalThis.SnaapI18n?.text("ค่าทั้งสองฝั่งควรมีหน่วยเดียวกัน เช่น RSI เทียบ 30") ?? "ค่าทั้งสองฝั่งควรมีหน่วยเดียวกัน เช่น RSI เทียบ 30"),'compare'],
    field: [(globalThis.SnaapI18n?.text("แหล่งราคา") ?? "แหล่งราคา"),(globalThis.SnaapI18n?.text("เปิด = ราคาแรก · สูง/ต่ำ = ขอบไส้เทียน · ปิด = ราคาสุดท้าย · วอลุ่ม = ปริมาณซื้อขายของแท่ง") ?? "เปิด = ราคาแรก · สูง/ต่ำ = ขอบไส้เทียน · ปิด = ราคาสุดท้าย · วอลุ่ม = ปริมาณซื้อขายของแท่ง"),(globalThis.SnaapI18n?.text("ราคาปิดจะนิ่งเมื่อแท่งปิดแล้ว") ?? "ราคาปิดจะนิ่งเมื่อแท่งปิดแล้ว"),'candle'],
    source: [(globalThis.SnaapI18n?.text("แหล่งค่าของอินดิเคเตอร์") ?? "แหล่งค่าของอินดิเคเตอร์"),(globalThis.SnaapI18n?.text("เลือกข้อมูลในแท่งที่นำไปคำนวณ เช่น close ใช้ราคาปิด ส่วน hl2 เฉลี่ยสูงกับต่ำ") ?? "เลือกข้อมูลในแท่งที่นำไปคำนวณ เช่น close ใช้ราคาปิด ส่วน hl2 เฉลี่ยสูงกับต่ำ"),(globalThis.SnaapI18n?.text("hlc3 เฉลี่ยสูง/ต่ำ/ปิด · ohlc4 เฉลี่ยเปิด/สูง/ต่ำ/ปิด") ?? "hlc3 เฉลี่ยสูง/ต่ำ/ปิด · ohlc4 เฉลี่ยเปิด/สูง/ต่ำ/ปิด"),'candle'],
    period: [(globalThis.SnaapI18n?.text("ระยะอินดิเคเตอร์") ?? "ระยะอินดิเคเตอร์"),(globalThis.SnaapI18n?.text("จำนวนแท่งย้อนหลังที่ใช้คำนวณอินดิเคเตอร์ เปลี่ยนระยะแล้วช่วงข้อมูลและผลลัพธ์จะเปลี่ยน") ?? "จำนวนแท่งย้อนหลังที่ใช้คำนวณอินดิเคเตอร์ เปลี่ยนระยะแล้วช่วงข้อมูลและผลลัพธ์จะเปลี่ยน"),(globalThis.SnaapI18n?.text("200 แท่งบน 15m ใช้ข้อมูล 50 ชั่วโมง · EMA ยังต้องมีช่วงเตรียมข้อมูล") ?? "200 แท่งบน 15m ใช้ข้อมูล 50 ชั่วโมง · EMA ยังต้องมีช่วงเตรียมข้อมูล"),'period'],
    value: [(globalThis.SnaapI18n?.text("ค่าที่เปรียบเทียบ") ?? "ค่าที่เปรียบเทียบ"),(globalThis.SnaapI18n?.text("ตัวเลขเกณฑ์ เช่น RSI ต่ำกว่า 30 หรือราคาปิดมากกว่า 100") ?? "ตัวเลขเกณฑ์ เช่น RSI ต่ำกว่า 30 หรือราคาปิดมากกว่า 100"),(globalThis.SnaapI18n?.text("ตรวจหน่วยให้ตรงกัน: ราคา, RSI, วอลุ่ม หรือเปอร์เซ็นต์") ?? "ตรวจหน่วยให้ตรงกัน: ราคา, RSI, วอลุ่ม หรือเปอร์เซ็นต์"),'compare'],
    deviation: [(globalThis.SnaapI18n?.text("ความกว้าง Bollinger Bands") ?? "ความกว้าง Bollinger Bands"),(globalThis.SnaapI18n?.text("จำนวนส่วนเบี่ยงเบนมาตรฐานที่ใช้กางแถบจากเส้นกลาง เพิ่มค่านี้แล้วแถบกว้างขึ้น") ?? "จำนวนส่วนเบี่ยงเบนมาตรฐานที่ใช้กางแถบจากเส้นกลาง เพิ่มค่านี้แล้วแถบกว้างขึ้น"),(globalThis.SnaapI18n?.text("แถบกว้างไม่ได้แปลว่าราคาต้องกลับตัว") ?? "แถบกว้างไม่ได้แปลว่าราคาต้องกลับตัว"),'period'],
    slow: ['MACD slow',(globalThis.SnaapI18n?.text("จำนวนแท่งของ EMA ฝั่งช้า MACD เปรียบเทียบเส้นเร็วกับเส้นช้า") ?? "จำนวนแท่งของ EMA ฝั่งช้า MACD เปรียบเทียบเส้นเร็วกับเส้นช้า"),(globalThis.SnaapI18n?.text("ควรยาวกว่าระยะของฝั่งเร็ว") ?? "ควรยาวกว่าระยะของฝั่งเร็ว"),'period'],
    signal: ['MACD signal',(globalThis.SnaapI18n?.text("จำนวนแท่งที่ใช้ทำเส้นเฉลี่ยของ MACD เพื่อเป็นเส้นเทียบสัญญาณ") ?? "จำนวนแท่งที่ใช้ทำเส้นเฉลี่ยของ MACD เพื่อเป็นเส้นเทียบสัญญาณ"),(globalThis.SnaapI18n?.text("ค่ามากทำให้เส้นตอบสนองช้าลง") ?? "ค่ามากทำให้เส้นตอบสนองช้าลง"),'period'],
    bars: [(globalThis.SnaapI18n?.text("ต่อเนื่องหลายแท่ง") ?? "ต่อเนื่องหลายแท่ง"),(globalThis.SnaapI18n?.text("เงื่อนไขต้องจริงติดกันตามจำนวนแท่งที่กำหนด ถ้าขาดช่วงจะไม่ผ่าน") ?? "เงื่อนไขต้องจริงติดกันตามจำนวนแท่งที่กำหนด ถ้าขาดช่วงจะไม่ผ่าน"),(globalThis.SnaapI18n?.text("เช่น เหนือ EMA ต่อเนื่อง 3 แท่งปิด") ?? "เช่น เหนือ EMA ต่อเนื่อง 3 แท่งปิด"),'hold'],
    withinBars: [(globalThis.SnaapI18n?.text("รอยืนยันภายในกี่แท่ง") ?? "รอยืนยันภายในกี่แท่ง"),(globalThis.SnaapI18n?.text("หลังเงื่อนไขก่อนหน้าผ่าน ต้องเจอเงื่อนไขขั้นนี้ภายในจำนวนแท่งที่กำหนด") ?? "หลังเงื่อนไขก่อนหน้าผ่าน ต้องเจอเงื่อนไขขั้นนี้ภายในจำนวนแท่งที่กำหนด"),(globalThis.SnaapI18n?.text("นับตามรอบตรวจเซ็ตอัพ · หมดเวลาจะยกเลิกการรอ") ?? "นับตามรอบตรวจเซ็ตอัพ · หมดเวลาจะยกเลิกการรอ"),'hold'],
    cooldownBars: [(globalThis.SnaapI18n?.text("พักหลังสัญญาณ") ?? "พักหลังสัญญาณ"),(globalThis.SnaapI18n?.text("เว้นจำนวนแท่งหลังสัญญาณเริ่มหรือสัญญาณออก ก่อนหาโอกาสรอบใหม่") ?? "เว้นจำนวนแท่งหลังสัญญาณเริ่มหรือสัญญาณออก ก่อนหาโอกาสรอบใหม่"),(globalThis.SnaapI18n?.text("0 = ไม่เพิ่มช่วงพัก · เงื่อนไขเริ่มต้องเป็นเท็จก่อนจึงเริ่มซ้ำได้") ?? "0 = ไม่เพิ่มช่วงพัก · เงื่อนไขเริ่มต้องเป็นเท็จก่อนจึงเริ่มซ้ำได้"),'cooldown'],
    group: ['AND / OR',(globalThis.SnaapI18n?.text("AND ต้องผ่านทุกข้อพร้อมกัน ส่วน OR ผ่านอย่างน้อยหนึ่งข้อก็พอ") ?? "AND ต้องผ่านทุกข้อพร้อมกัน ส่วน OR ผ่านอย่างน้อยหนึ่งข้อก็พอ"),(globalThis.SnaapI18n?.text("ใส่กลุ่มซ้อนได้เพื่อแยกเงื่อนไขหลักกับทางเลือก") ?? "ใส่กลุ่มซ้อนได้เพื่อแยกเงื่อนไขหลักกับทางเลือก"),'hold'],
    direction: ['Long / Short',(globalThis.SnaapI18n?.text("Long รอการเคลื่อนไหวขึ้น ส่วน Short รอการเคลื่อนไหวลง ตั้งเงื่อนไขให้ตรงกับฝั่งที่เลือก") ?? "Long รอการเคลื่อนไหวขึ้น ส่วน Short รอการเคลื่อนไหวลง ตั้งเงื่อนไขให้ตรงกับฝั่งที่เลือก"),(globalThis.SnaapI18n?.text("สัญญาณจำลองไม่ใช่สถานะออเดอร์จริง") ?? "สัญญาณจำลองไม่ใช่สถานะออเดอร์จริง"),'compare'],
    entry: [(globalThis.SnaapI18n?.text("เงื่อนไขเริ่มต้น") ?? "เงื่อนไขเริ่มต้น"),(globalThis.SnaapI18n?.text("จุดเริ่มรอบสัญญาณ ต้องผ่านข้อนี้ก่อนจึงเข้าสู่ขั้นรอยืนยันถ้ามี") ?? "จุดเริ่มรอบสัญญาณ ต้องผ่านข้อนี้ก่อนจึงเข้าสู่ขั้นรอยืนยันถ้ามี"),(globalThis.SnaapI18n?.text("ระบบตรวจจากข้อมูลแท่งปิด") ?? "ระบบตรวจจากข้อมูลแท่งปิด"),'cross'],
    exit: [(globalThis.SnaapI18n?.text("สัญญาณออก") ?? "สัญญาณออก"),(globalThis.SnaapI18n?.text("เงื่อนไขที่ใช้จบรอบสัญญาณหลังเริ่มแล้ว เช่น ราคาหลุดเส้นที่กำหนด") ?? "เงื่อนไขที่ใช้จบรอบสัญญาณหลังเริ่มแล้ว เช่น ราคาหลุดเส้นที่กำหนด"),(globalThis.SnaapI18n?.text("เป็นวงจรสัญญาณ ไม่ได้ขายหรือปิดออเดอร์ให้") ?? "เป็นวงจรสัญญาณ ไม่ได้ขายหรือปิดออเดอร์ให้"),'below'],
    cancel: [(globalThis.SnaapI18n?.text("เงื่อนไขยกเลิก") ?? "เงื่อนไขยกเลิก"),(globalThis.SnaapI18n?.text("ใช้ยกเลิกรอบที่กำลังรอหรือกำลังทำงาน เมื่อสถานการณ์ไม่ตรงกับแผนแล้ว") ?? "ใช้ยกเลิกรอบที่กำลังรอหรือกำลังทำงาน เมื่อสถานการณ์ไม่ตรงกับแผนแล้ว"),(globalThis.SnaapI18n?.text("ใช้ได้ทั้งช่วงรอยืนยันและหลังเริ่มสัญญาณ") ?? "ใช้ได้ทั้งช่วงรอยืนยันและหลังเริ่มสัญญาณ"),'below'],
    destinations: [(globalThis.SnaapI18n?.text("ปลายทางแจ้งเตือน") ?? "ปลายทางแจ้งเตือน"),(globalThis.SnaapI18n?.text("เลือกรับสัญญาณผ่านช่องทางที่เชื่อมต่อไว้ กล่องแจ้งเตือนในเว็บมีเสมอ") ?? "เลือกรับสัญญาณผ่านช่องทางที่เชื่อมต่อไว้ กล่องแจ้งเตือนในเว็บมีเสมอ"),(globalThis.SnaapI18n?.text("การส่งอาจมีเวลาประมวลผลหลังแท่งปิด") ?? "การส่งอาจมีเวลาประมวลผลหลังแท่งปิด"),'none'],
    mirror: [(globalThis.SnaapI18n?.text("สลับเงื่อนไขให้ Short") ?? "สลับเงื่อนไขให้ Short"),(globalThis.SnaapI18n?.text("กลับมากกว่าเป็นน้อยกว่า และตัดขึ้นเป็นตัดลง เพื่อสร้างเงื่อนไขอีกฝั่ง") ?? "กลับมากกว่าเป็นน้อยกว่า และตัดขึ้นเป็นตัดลง เพื่อสร้างเงื่อนไขอีกฝั่ง"),(globalThis.SnaapI18n?.text("ตัวเลขเดิมยังคงอยู่ เช่น RSI 30 ไม่เปลี่ยนเป็น 70 ต้องตรวจว่าเหมาะกับแผนไหม") ?? "ตัวเลขเดิมยังคงอยู่ เช่น RSI 30 ไม่เปลี่ยนเป็น 70 ต้องตรวจว่าเหมาะกับแผนไหม"),'crossDown'],
    import: [(globalThis.SnaapI18n?.text("นำเข้าอินดิเคเตอร์") ?? "นำเข้าอินดิเคเตอร์"),(globalThis.SnaapI18n?.text("นำเข้าสูตรรูปแบบ SNAAP JSON ที่รองรับ หรือดูแนวทางแปลงอินดิเคเตอร์ TradingView") ?? "นำเข้าสูตรรูปแบบ SNAAP JSON ที่รองรับ หรือดูแนวทางแปลงอินดิเคเตอร์ TradingView"),(globalThis.SnaapI18n?.text("ไม่สามารถรัน Pine Script ทุกชนิดโดยตรง") ?? "ไม่สามารถรัน Pine Script ทุกชนิดโดยตรง"),'period'],
  };
  const operators = {
    '>':[(globalThis.SnaapI18n?.text("มากกว่า (>)") ?? "มากกว่า (>)"),(globalThis.SnaapI18n?.text("ค่าฝั่งซ้ายต้องสูงกว่าฝั่งขวาบนแท่งที่ตรวจ") ?? "ค่าฝั่งซ้ายต้องสูงกว่าฝั่งขวาบนแท่งที่ตรวจ"),(globalThis.SnaapI18n?.text("ถ้าอยู่เหนือเส้นอยู่แล้วก็ผ่าน ไม่จำเป็นต้องเพิ่งตัดขึ้น") ?? "ถ้าอยู่เหนือเส้นอยู่แล้วก็ผ่าน ไม่จำเป็นต้องเพิ่งตัดขึ้น"),'above'],
    '>=':[(globalThis.SnaapI18n?.text("มากกว่าหรือเท่ากับ (≥)") ?? "มากกว่าหรือเท่ากับ (≥)"),(globalThis.SnaapI18n?.text("ฝั่งซ้ายสูงกว่าหรือเท่าฝั่งขวาก็ผ่าน") ?? "ฝั่งซ้ายสูงกว่าหรือเท่าฝั่งขวาก็ผ่าน"),(globalThis.SnaapI18n?.text("ค่าเท่ากันผ่านด้วย ต่างจากเครื่องหมาย >") ?? "ค่าเท่ากันผ่านด้วย ต่างจากเครื่องหมาย >"),'above'],
    '<':[(globalThis.SnaapI18n?.text("น้อยกว่า (<)") ?? "น้อยกว่า (<)"),(globalThis.SnaapI18n?.text("ค่าฝั่งซ้ายต้องต่ำกว่าฝั่งขวาบนแท่งที่ตรวจ") ?? "ค่าฝั่งซ้ายต้องต่ำกว่าฝั่งขวาบนแท่งที่ตรวจ"),(globalThis.SnaapI18n?.text("ถ้าอยู่ใต้เส้นอยู่แล้วก็ผ่าน ไม่จำเป็นต้องเพิ่งตัดลง") ?? "ถ้าอยู่ใต้เส้นอยู่แล้วก็ผ่าน ไม่จำเป็นต้องเพิ่งตัดลง"),'below'],
    '<=':[(globalThis.SnaapI18n?.text("น้อยกว่าหรือเท่ากับ (≤)") ?? "น้อยกว่าหรือเท่ากับ (≤)"),(globalThis.SnaapI18n?.text("ฝั่งซ้ายต่ำกว่าหรือเท่าฝั่งขวาก็ผ่าน") ?? "ฝั่งซ้ายต่ำกว่าหรือเท่าฝั่งขวาก็ผ่าน"),(globalThis.SnaapI18n?.text("ค่าเท่ากันผ่านด้วย ต่างจากเครื่องหมาย <") ?? "ค่าเท่ากันผ่านด้วย ต่างจากเครื่องหมาย <"),'below'],
    CROSS_ABOVE:[(globalThis.SnaapI18n?.text("ตัดขึ้น") ?? "ตัดขึ้น"),(globalThis.SnaapI18n?.text("แท่งก่อนหน้า: ซ้าย ≤ ขวา → แท่งล่าสุด: ซ้าย > ขวา") ?? "แท่งก่อนหน้า: ซ้าย ≤ ขวา → แท่งล่าสุด: ซ้าย > ขวา"),(globalThis.SnaapI18n?.text("ตรวจจังหวะข้ามขึ้นเท่านั้น อยู่เหนือเส้นต่อเฉย ๆ ไม่ผ่านข้อนี้") ?? "ตรวจจังหวะข้ามขึ้นเท่านั้น อยู่เหนือเส้นต่อเฉย ๆ ไม่ผ่านข้อนี้"),'cross'],
    CROSS_BELOW:[(globalThis.SnaapI18n?.text("ตัดลง") ?? "ตัดลง"),(globalThis.SnaapI18n?.text("แท่งก่อนหน้า: ซ้าย ≥ ขวา → แท่งล่าสุด: ซ้าย < ขวา") ?? "แท่งก่อนหน้า: ซ้าย ≥ ขวา → แท่งล่าสุด: ซ้าย < ขวา"),(globalThis.SnaapI18n?.text("ตรวจจังหวะข้ามลงเท่านั้น อยู่ใต้เส้นต่อเฉย ๆ ไม่ผ่านข้อนี้") ?? "ตรวจจังหวะข้ามลงเท่านั้น อยู่ใต้เส้นต่อเฉย ๆ ไม่ผ่านข้อนี้"),'crossDown'],
    AND:guides.group, OR:guides.group,
  };
  const indicator = {
    EMA:(globalThis.SnaapI18n?.text("เส้นเฉลี่ยราคา ให้น้ำหนักกับข้อมูลล่าสุดมากกว่า") ?? "เส้นเฉลี่ยราคา ให้น้ำหนักกับข้อมูลล่าสุดมากกว่า"), SMA:(globalThis.SnaapI18n?.text("ค่าเฉลี่ยราคา ให้น้ำหนักแต่ละแท่งเท่ากัน") ?? "ค่าเฉลี่ยราคา ให้น้ำหนักแต่ละแท่งเท่ากัน"), RSI:(globalThis.SnaapI18n?.text("ค่าความแรงของการขึ้นลง อยู่ในช่วง 0–100 ไม่ใช่หน่วยราคา") ?? "ค่าความแรงของการขึ้นลง อยู่ในช่วง 0–100 ไม่ใช่หน่วยราคา"), ATR:(globalThis.SnaapI18n?.text("ขนาดการแกว่งโดยเฉลี่ย อยู่ในหน่วยราคา ไม่บอกทิศทาง") ?? "ขนาดการแกว่งโดยเฉลี่ย อยู่ในหน่วยราคา ไม่บอกทิศทาง"), VOLUME_RATIO:(globalThis.SnaapI18n?.text("วอลุ่มเทียบค่าเฉลี่ย เช่น 2 หมายถึงสองเท่าของช่วงอ้างอิง") ?? "วอลุ่มเทียบค่าเฉลี่ย เช่น 2 หมายถึงสองเท่าของช่วงอ้างอิง"), MACD:(globalThis.SnaapI18n?.text("ส่วนต่างของเส้นเฉลี่ยเร็วกับช้า ใช้ดูแรงและทิศทาง") ?? "ส่วนต่างของเส้นเฉลี่ยเร็วกับช้า ใช้ดูแรงและทิศทาง"), MACD_SIGNAL:(globalThis.SnaapI18n?.text("เส้นเฉลี่ยของ MACD ใช้เทียบกับค่า MACD") ?? "เส้นเฉลี่ยของ MACD ใช้เทียบกับค่า MACD"), MACD_HIST:(globalThis.SnaapI18n?.text("MACD ลบเส้น Signal ค่าบวกและลบบอกว่าอยู่คนละฝั่ง") ?? "MACD ลบเส้น Signal ค่าบวกและลบบอกว่าอยู่คนละฝั่ง"), CUSTOM:(globalThis.SnaapI18n?.text("สูตรนำเข้าที่ระบบรองรับ ตรวจความหมายและหน่วยจากสูตรนั้น") ?? "สูตรนำเข้าที่ระบบรองรับ ตรวจความหมายและหน่วยจากสูตรนั้น"),
  };
  Object.assign(indicator, {WMA:(globalThis.SnaapI18n?.text("ค่าเฉลี่ยราคา ให้น้ำหนักมากขึ้นกับแท่งล่าสุดตามลำดับ") ?? "ค่าเฉลี่ยราคา ให้น้ำหนักมากขึ้นกับแท่งล่าสุดตามลำดับ"),RMA:(globalThis.SnaapI18n?.text("ค่าเฉลี่ยแบบ Wilder ใช้ทำเส้นให้เรียบ") ?? "ค่าเฉลี่ยแบบ Wilder ใช้ทำเส้นให้เรียบ"),VWMA:(globalThis.SnaapI18n?.text("ค่าเฉลี่ยราคาให้น้ำหนักตามวอลุ่มของแต่ละแท่ง") ?? "ค่าเฉลี่ยราคาให้น้ำหนักตามวอลุ่มของแต่ละแท่ง"),ROC:(globalThis.SnaapI18n?.text("เปอร์เซ็นต์การเปลี่ยนราคาเทียบจำนวนแท่งย้อนหลัง") ?? "เปอร์เซ็นต์การเปลี่ยนราคาเทียบจำนวนแท่งย้อนหลัง"),MOM:(globalThis.SnaapI18n?.text("ส่วนต่างราคาเทียบจำนวนแท่งย้อนหลัง หน่วยเดียวกับราคา") ?? "ส่วนต่างราคาเทียบจำนวนแท่งย้อนหลัง หน่วยเดียวกับราคา"),STDDEV:(globalThis.SnaapI18n?.text("ส่วนเบี่ยงเบนมาตรฐานของราคา ใช้วัดการกระจาย") ?? "ส่วนเบี่ยงเบนมาตรฐานของราคา ใช้วัดการกระจาย"),VARIANCE:(globalThis.SnaapI18n?.text("ความแปรปรวนของราคา เป็นกำลังสองของส่วนเบี่ยงเบนมาตรฐาน") ?? "ความแปรปรวนของราคา เป็นกำลังสองของส่วนเบี่ยงเบนมาตรฐาน"),HIGHEST:(globalThis.SnaapI18n?.text("ค่าสูงสุดของแหล่งค่าที่เลือกในช่วงย้อนหลัง") ?? "ค่าสูงสุดของแหล่งค่าที่เลือกในช่วงย้อนหลัง"),LOWEST:(globalThis.SnaapI18n?.text("ค่าต่ำสุดของแหล่งค่าที่เลือกในช่วงย้อนหลัง") ?? "ค่าต่ำสุดของแหล่งค่าที่เลือกในช่วงย้อนหลัง"),DONCHIAN_UPPER:(globalThis.SnaapI18n?.text("ขอบบนจากราคาสูงสุดในช่วงย้อนหลัง") ?? "ขอบบนจากราคาสูงสุดในช่วงย้อนหลัง"),DONCHIAN_LOWER:(globalThis.SnaapI18n?.text("ขอบล่างจากราคาต่ำสุดในช่วงย้อนหลัง") ?? "ขอบล่างจากราคาต่ำสุดในช่วงย้อนหลัง"),DONCHIAN_MID:(globalThis.SnaapI18n?.text("จุดกึ่งกลางระหว่างขอบบนและล่าง Donchian") ?? "จุดกึ่งกลางระหว่างขอบบนและล่าง Donchian"),STOCH_K:(globalThis.SnaapI18n?.text("ตำแหน่งราคาปิดเทียบช่วงสูง–ต่ำ อยู่ในช่วง 0–100") ?? "ตำแหน่งราคาปิดเทียบช่วงสูง–ต่ำ อยู่ในช่วง 0–100"),WILLIAMS_R:(globalThis.SnaapI18n?.text("ตำแหน่งราคาปิดเทียบช่วงสูง–ต่ำ อยู่ในช่วง −100 ถึง 0") ?? "ตำแหน่งราคาปิดเทียบช่วงสูง–ต่ำ อยู่ในช่วง −100 ถึง 0"),CCI:(globalThis.SnaapI18n?.text("ราคาห่างจากค่าเฉลี่ยมากเพียงใด หลังปรับด้วยความแกว่ง") ?? "ราคาห่างจากค่าเฉลี่ยมากเพียงใด หลังปรับด้วยความแกว่ง"),MFI:(globalThis.SnaapI18n?.text("แรงซื้อขายจากทั้งราคาและวอลุ่ม อยู่ในช่วง 0–100") ?? "แรงซื้อขายจากทั้งราคาและวอลุ่ม อยู่ในช่วง 0–100"),CMF:(globalThis.SnaapI18n?.text("วัดแรงไหลเข้าออกโดยใช้ตำแหน่งราคาปิดและวอลุ่ม") ?? "วัดแรงไหลเข้าออกโดยใช้ตำแหน่งราคาปิดและวอลุ่ม"),BB_UPPER:(globalThis.SnaapI18n?.text("ขอบบน Bollinger: เส้นกลางบวกความแกว่งตามตัวคูณ") ?? "ขอบบน Bollinger: เส้นกลางบวกความแกว่งตามตัวคูณ"),BB_LOWER:(globalThis.SnaapI18n?.text("ขอบล่าง Bollinger: เส้นกลางลบความแกว่งตามตัวคูณ") ?? "ขอบล่าง Bollinger: เส้นกลางลบความแกว่งตามตัวคูณ"),BB_MIDDLE:(globalThis.SnaapI18n?.text("เส้นค่าเฉลี่ยกลางของ Bollinger Bands") ?? "เส้นค่าเฉลี่ยกลางของ Bollinger Bands"),BB_WIDTH:(globalThis.SnaapI18n?.text("ความกว้าง Bollinger เทียบเส้นกลาง แสดงความแกว่ง") ?? "ความกว้าง Bollinger เทียบเส้นกลาง แสดงความแกว่ง"),BB_PERCENT:(globalThis.SnaapI18n?.text("ตำแหน่งราคาในแถบ Bollinger: 0 ที่ขอบล่าง 1 ที่ขอบบน") ?? "ตำแหน่งราคาในแถบ Bollinger: 0 ที่ขอบล่าง 1 ที่ขอบบน"),TR:(globalThis.SnaapI18n?.text("True Range: ช่วงแกว่งที่รวมช่องว่างจากราคาปิดแท่งก่อน") ?? "True Range: ช่วงแกว่งที่รวมช่องว่างจากราคาปิดแท่งก่อน")});
  let active = null, tip = null, hideTimer, showTimer;
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function content(button) {
    const control = button._guideControl;
    if(button.dataset.guide==='op')return operators[control?.value] || guides.group;
    if(button.dataset.guide==='indicator') {
      const name=control?.value || (globalThis.SnaapI18n?.text("อินดิเคเตอร์") ?? "อินดิเคเตอร์");
      const extended=window.SnaapIndicatorCatalog?.indicatorByName[name];
      if(extended)return [extended.label,extended.description,`${(globalThis.SnaapI18n?.text("หน่วย: ") ?? "หน่วย: ")}${extended.unit}${(globalThis.SnaapI18n?.text(" · ใช้แท่งปิดจากกระดานที่เลือก") ?? " · ใช้แท่งปิดจากกระดานที่เลือก")}`,null];
      return [name,indicator[name] || `${(globalThis.SnaapI18n?.text("ดูความหมาย สูตร และหน่วยของ ") ?? "ดูความหมาย สูตร และหน่วยของ ")}${name}${(globalThis.SnaapI18n?.text(" ได้จากลิงก์ “สูตร หน่วย และข้อมูลที่ต้องใช้” ใต้การตั้งค่า") ?? " ได้จากลิงก์ “สูตร หน่วย และข้อมูลที่ต้องใช้” ใต้การตั้งค่า")}`, (globalThis.SnaapI18n?.text("ตรวจหน่วยของอินดิเคเตอร์ให้ตรงกับค่าที่นำมาเทียบ") ?? "ตรวจหน่วยของอินดิเคเตอร์ให้ตรงกับค่าที่นำมาเทียบ"), ['RSI','STOCH_K','WILLIAMS_R','MFI','CCI'].includes(name)?'oscillator':'period'];
    }
    return guides[button.dataset.guide];
  }
  function close() {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    active?.removeAttribute('aria-describedby'); tip?.remove(); tip=null; active=null;
  }
  function position() {
    if(!active?.isConnected){close();return;}
    const rect=active.getBoundingClientRect(), w=tip.offsetWidth, h=tip.offsetHeight;
    const left=Math.max(12,Math.min(rect.left-12,innerWidth-w-12));
    const top=rect.bottom+h+12<=innerHeight ? rect.bottom+8 : Math.max(12,rect.top-h-8);
    tip.style.left=`${left}px`; tip.style.top=`${top}px`;
  }
  function open(button) {
    clearTimeout(hideTimer);clearTimeout(showTimer);
    if(active===button)return;
    close();active=button;
    const [title,description,note,mode]=content(button);
    tip=document.createElement('div');tip.id='snaap-setting-guide';tip.className='setting-guide';tip.setAttribute('role','tooltip');
    tip.innerHTML=`${(globalThis.SnaapI18n?.text("<div class=\"guide-eyebrow\">รู้จักการตั้งค่านี้</div><strong>") ?? "<div class=\"guide-eyebrow\">รู้จักการตั้งค่านี้</div><strong>")}${escape(title)}</strong><p>${escape(description)}</p>${window.SnaapGuideScenes.render(button.dataset.guide, button._guideControl)}<p class="guide-note">${escape(note)}</p>`;
    document.body.append(tip);button.setAttribute('aria-describedby',tip.id);position();
    tip.onpointerenter=()=>clearTimeout(hideTimer);
    tip.onpointerleave=()=>hideTimer=setTimeout(close,180);
  }
  function add(target,key,control) {
    if(!target||target.dataset.guideEnhanced)return;
    target.dataset.guideEnhanced='true';
    const button=document.createElement('button');button.type='button';button.className='setting-guide-trigger';button.dataset.guide=key;button._guideControl=control;
    const title=key==='op'?(globalThis.SnaapI18n?.text("การเปรียบเทียบ") ?? "การเปรียบเทียบ"):key==='indicator'?(globalThis.SnaapI18n?.text("อินดิเคเตอร์") ?? "อินดิเคเตอร์"):guides[key][0];
    button.setAttribute('aria-label',`${(globalThis.SnaapI18n?.text("คำแนะนำ: ") ?? "คำแนะนำ: ")}${title}`);button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 5.8v5.2M10 13.8v.4"/></svg>';
    if(control && !control.hasAttribute('aria-label')) {
      const originalName=[...target.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();
      if(originalName)control.setAttribute('aria-label',originalName);
    }
    if(target.tagName==='LEGEND' && !target.parentElement.hasAttribute('aria-label'))target.parentElement.setAttribute('aria-label',target.textContent.trim());
    if(target.tagName==='LABEL' && control) {
      // Keep label clicks associated with the field, not the first help button.
      control.id ||= `guide-control-${crypto.randomUUID()}`;
      target.htmlFor=control.id;
      const caption=document.createElement('span');caption.className='guide-label';
      const textNodes=[...target.childNodes].filter(node=>node.nodeType===3 && node.textContent.trim());
      target.prepend(caption);textNodes.forEach(node=>caption.append(node));caption.append(button);
    } else target.append(button);
    button.onpointerenter=e=>{if(e.pointerType!=='touch'){clearTimeout(hideTimer);showTimer=setTimeout(()=>open(button),220);}};
    button.onpointerleave=()=>{clearTimeout(showTimer);hideTimer=setTimeout(close,180);};
    button.onfocus=()=>open(button);button.onblur=()=>hideTimer=setTimeout(close,180);
    button.onclick=e=>{e.preventDefault();e.stopPropagation();open(button);};
  }
  function scan() {
    if(active&&!active.isConnected)close();
    const panel=document.querySelector('.design-panel');if(!panel)return;
    panel.querySelectorAll('label').forEach(label=>{
      const control=label.querySelector('select[data-path],input[data-path],select[data-opkind]');if(!control)return;
      const path=control.dataset.path||'', suffix=path.split('.').at(-1);
      const key=control.hasAttribute('data-opkind')?'kind':suffix==='op'?'op':suffix==='name'?(path==='name'?'name':'indicator'):suffix==='timeframe'?(path==='timeframe'?'timeframe':'operandFrame'):suffix;
      if(guides[key]||key==='op'||key==='indicator')add(label,key,control);
    });
    add(panel.querySelector('.exchange-fieldset legend'),'exchange');
    add(panel.querySelector('.pair-control > span'),'pair');
    add(panel.querySelector('.destination-choices legend'),'destinations');
    panel.querySelectorAll('.setup-section h3').forEach(title=>add(title,title.textContent.includes(globalThis.SnaapI18n?.text("รอยืนยัน") ?? "รอยืนยัน")?'withinBars':title.textContent.includes(globalThis.SnaapI18n?.text("ออก") ?? "ออก")?'exit':'entry'));
    panel.querySelectorAll('.optional-heading h4').forEach(title=>add(title,title.textContent.includes(globalThis.SnaapI18n?.text("ยกเลิก") ?? "ยกเลิก")?'cancel':'exit'));
    panel.querySelectorAll('.condition-group').forEach(group=>add(group,'group',group.querySelector('select[data-path$=".op"]')));
    for(const [selector,key] of [['[data-import-indicator]','import'],['[data-group]','group'],['[data-hold]','bars']])panel.querySelectorAll(selector).forEach(button=>{
      if(button.parentElement.classList.contains('guide-action'))return;
      const wrapper=document.createElement('span');wrapper.className='guide-action';button.before(wrapper);wrapper.append(button);add(wrapper,key);
    });
    add(panel.querySelector('.direction-mirror-row'),'mirror');
    add(panel.querySelector('.setup-direction legend'),'direction');
  }
  document.addEventListener('setup-rendered',()=>{close();requestAnimationFrame(scan);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  document.addEventListener('pointerdown',e=>{if(active&&!e.target.closest('.setting-guide-trigger,.setting-guide'))close();});
  document.addEventListener('scroll',()=>{if(tip)position();},true);
  window.addEventListener('resize',()=>{if(tip)position();});
  scan();
})();
