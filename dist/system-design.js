'use strict';
const scenarios = {
  healthy: ['เงื่อนไขตรงตามกฎ', 'เปิดใช้งาน', 'พร้อมทั้ง 2 กระดาน', 'ผู้ให้บริการรับแล้ว', 'บันทึกสัญญาณพร้อมค่าที่ผ่านเงื่อนไขในเว็บ และส่งไปยังช่องทางที่เลือก', 'ดูเหตุผลและสถานะการส่งย้อนหลังได้ การตอบรับจาก API ไม่ยืนยันว่าผู้ใช้เปิดอ่านแล้ว'],
  market: ['ติดตามต่อเฉพาะข้อมูลที่พร้อม', 'เปิดใช้งาน', 'Binance พร้อม · Bybit ขาด', 'พร้อมส่ง', 'พักการตรวจฝั่ง Bybit ระหว่างเชื่อมต่อใหม่ ฝั่ง Binance ทำงานต่อ ไม่ตีความว่าข้อมูลที่ขาดคือเงื่อนไขไม่ผ่าน', 'ระบบเติมข้อมูลให้ครบก่อนกลับมาประเมิน ไม่ส่งสัญญาณเก่าจำนวนมากย้อนหลังโดยอัตโนมัติ'],
  delivery: ['สัญญาณยังอยู่ในเว็บ', 'เปิดใช้งาน', 'พร้อมทั้ง 2 กระดาน', 'Telegram ส่งไม่สำเร็จ', 'เก็บสัญญาณในกล่องแจ้งเตือน แสดงสาเหตุและลองส่งใหม่เฉพาะข้อผิดพลาดที่แก้ได้ด้วยการลองซ้ำ', 'หากบล็อกบอตหรือการเชื่อมต่อหมดอายุ ให้เชื่อมต่อใหม่ ถ้าสัญญาณเก่าเกินกำหนดจะไม่ส่งล่าช้าโดยไม่บอก'],
  unknown: ['ยังยืนยันผลการส่งไม่ได้', 'เปิดใช้งาน', 'พร้อมทั้ง 2 กระดาน', 'ยังยืนยันไม่ได้', 'คำขอหมดเวลา แต่ผู้ให้บริการอาจรับข้อความไปแล้ว จึงไม่แสดงว่า “ส่งไม่สำเร็จ” หรือส่งซ้ำทันทีทุกกรณี', 'ใช้กลไกป้องกันส่งซ้ำของช่องทางเมื่อมี และเก็บความไม่แน่นอนในประวัติการส่ง'],
  local: ['การติดตามหยุดเมื่อเครื่องที่รันระบบหยุด', 'สถานะล่าสุด: เปิดใช้งาน', 'ไม่ได้รับข้อมูลใหม่', 'ส่งไม่ได้', 'เมื่อเปิดกลับมา แสดงช่วงที่ระบบหยุดและเติมข้อมูลก่อนเริ่มติดตามต่อ การปิดแค่แท็บไม่ควรหยุด worker ที่ยังทำงานอยู่', 'ถ้าต้องการติดตามตลอดเวลา ต้องย้าย backend ไปเครื่องที่เปิดต่อเนื่อง นี่เป็นข้อเสนอ ยังไม่มีการเผยแพร่บริการ']
};
const fields = ['scenario-title', 'rule-state', 'market-state', 'delivery-state', 'outcome', 'action'];
function showScenario(value) { scenarios[value].forEach((text, index) => { document.getElementById(fields[index]).textContent = text; }); }
document.getElementById('scenario').addEventListener('change', event => showScenario(event.target.value));
showScenario('healthy');
const themeButton = document.getElementById('theme');
function setTheme(dark) { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; themeButton.textContent = dark ? 'โหมดสว่าง' : 'โหมดมืด'; themeButton.setAttribute('aria-pressed', String(dark)); }
setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
themeButton.addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
