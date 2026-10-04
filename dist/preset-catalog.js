// Deterministic starting templates, not optimized trading recommendations.
export const presets = [
 {id:'trend',title:'ตามเทรนด์',tag:'เริ่มง่าย',frame:'1h',description:'รอราคาตัด EMA 20 ในทิศทางของ EMA 200',note:'เหมาะกับตลาดมีแนวโน้ม · ตลาดแกว่งอาจเกิดสัญญาณหลอก',chart:'trend'},
 {id:'cross',title:'เส้นเฉลี่ยตัดกัน',tag:'Swing',frame:'4h',description:'EMA 20 ตัด EMA 50 จับการเปลี่ยนแนวโน้ม',note:'สัญญาณมาช้ากว่าราคา · ระวังเส้นตัดสลับในตลาดไร้ทิศทาง',chart:'cross'},
 {id:'momentum',title:'โมเมนตัมระยะสั้น',tag:'5m',frame:'5m',description:'RSI ตัด 50 พร้อมราคาอยู่ฝั่งเดียวกับ EMA 50',note:'รอบสั้นมีสัญญาณรบกวนสูง · ตรวจค่าธรรมเนียมก่อนนำไปใช้',chart:'momentum'},
 {id:'rebound',title:'รอจังหวะกลับตัว',tag:'RSI',frame:'15m',description:'RSI กลับผ่าน 30 หรือ 70 หลังอยู่ในโซนสุดขั้ว',note:'RSI อาจค้างในโซนสุดขั้วได้ · ไม่ใช่การยืนยันจุดต่ำสุดหรือสูงสุด',chart:'rebound'},
 {id:'bands',title:'ทะลุกรอบความผันผวน',tag:'Bollinger',frame:'1h',description:'ราคาตัดกรอบ Bollinger 20 / 2 พร้อมวอลุ่มเพิ่ม',note:'กรอบขยายไม่รับรองว่าจะไปต่อ · ระวังการทะลุแล้วกลับเข้ากรอบ',chart:'bands'},
 {id:'supertrend',title:'ตาม Supertrend',tag:'ATR',frame:'1h',description:'ทิศทาง Supertrend 10 / 3 เปลี่ยนเป็นขาขึ้นหรือขาลง',note:'เส้นห่างตามความผันผวน · ตลาดแกว่งแคบอาจสลับทิศบ่อย',chart:'supertrend'},
];
// Audience describes intended usage, never a promised holding time or signal rate.
const profiles={
 trend:{horizon:'เริ่มต้น',level:'มือใหม่',audience:'คนเริ่มต้นที่อยากตามเทรนด์ ไม่ไล่ราคา',pace:'ดูกราฟเป็นช่วง ๆ · รอทิศทางชัด',caution:'ตลาดแกว่งอาจเข้า–ออกบ่อย',leverageNote:'การรอแท่งปิดอาจช้าเกินไปสำหรับตำแหน่งที่ใช้ leverage สูง'},
 cross:{horizon:'ถือเป็นรอบ',level:'เริ่มต้นได้',audience:'คนถือเป็นรอบ ไม่อยากเฝ้ากราฟทั้งวัน',pace:'รอเทรนด์ใหญ่ · ไม่เน้นเข้าออกถี่',caution:'เส้นตัดกันหลังราคาเริ่มเปลี่ยนทิศแล้ว',leverageNote:'สูตรรอแท่งปิด ไม่ใช่ตัวป้องกันการถูก liquidate ระหว่างแท่ง'},
 momentum:{horizon:'เล่นสั้น',level:'มีประสบการณ์',audience:'คนเล่นสั้นในวัน และมีเวลาเฝ้าตลาด',pace:'จับจังหวะเร็ว · ต้องเฝ้าตลาด',caution:'สัญญาณรบกวนและค่าธรรมเนียมมีผลมาก',leverageNote:'แม้ใช้รอบสั้นก็ไม่รับประกันว่าจะเตือนทันก่อน liquidation เมื่อใช้ leverage สูง'},
 rebound:{horizon:'เล่นสั้น',level:'มีประสบการณ์',audience:'คนรอจังหวะเด้งหรือย่อ ไม่ไล่ตามราคา',pace:'เล่นจังหวะกลับตัว · ต้องติดตามใกล้ชิด',caution:'เป็นการสวนจังหวะราคา อาจผิดทางต่อได้',leverageNote:'การสวนจังหวะราคาพร้อม leverage สูงอาจขาดทุนเร็ว สัญญาณออกไม่ใช่ Stop loss ที่กระดาน'},
 bands:{horizon:'เล่นสั้น',level:'มีประสบการณ์',audience:'คนรอราคาทะลุกรอบ แล้วตามแรงซื้อขาย',pace:'รอช่วงตลาดคึกคัก · ไม่เน้นตลาดนิ่ง',caution:'อาจทะลุกรอบแล้วกลับเข้ามาทันที',leverageNote:'การทะลุกรอบอาจกลับทิศระหว่างแท่ง จึงไม่ควรใช้การแจ้งเตือนแทน Stop loss เมื่อใช้ leverage'},
 supertrend:{horizon:'ถือเป็นรอบ',level:'เริ่มต้นได้',audience:'คนอยากตามทิศทางด้วยเส้นเดียว',pace:'รอเปลี่ยนเทรนด์ · ปรับตามความผันผวน',caution:'ช่วงตลาดไร้ทิศทางอาจสลับฝั่งบ่อย',leverageNote:'เส้น Supertrend อาจอยู่ไกลจากราคาตามความผันผวน ไม่ได้อิงราคา liquidation ของคุณ'},
};
for(const p of presets)Object.assign(p,profiles[p.id]);
export function buildPreset(id,config){
 const p=presets.find(p=>p.id===id);if(!p)throw new Error('Unknown preset');
 const t=config.timeframe??p.frame;
 const i=(name,period,extra={})=>({kind:'INDICATOR',name,period,timeframe:t,...extra});
 const price={kind:'PRICE',field:'close',timeframe:t};
 const n=value=>({kind:'CONSTANT',value});
 const c=(left,op,right)=>({kind:'COMPARE',left,op,right});
 const and=(...children)=>({kind:'GROUP',op:'AND',children});
 const branch=short=>{
  const up=short?'CROSS_BELOW':'CROSS_ABOVE',down=short?'CROSS_ABOVE':'CROSS_BELOW',gt=short?'<':'>';
  let entry,exit;
  if(id==='trend'){entry=and(c(price,up,i('EMA',20)),c(price,gt,i('EMA',200)));exit=c(price,down,i('EMA',20));}
  if(id==='cross'){entry=c(i('EMA',20),up,i('EMA',50));exit=c(i('EMA',20),down,i('EMA',50));}
  if(id==='momentum'){entry=and(c(i('RSI',14),up,n(50)),c(price,gt,i('EMA',50)));exit=c(i('RSI',14),down,n(50));}
  if(id==='rebound'){entry=c(i('RSI',14),short?'CROSS_BELOW':'CROSS_ABOVE',n(short?70:30));exit=c(i('RSI',14),short?'CROSS_BELOW':'CROSS_ABOVE',n(50));}
  if(id==='bands'){entry=and(c(price,up,i(short?'BB_LOWER':'BB_UPPER',20,{deviation:2})),c(i('VOLUME_RATIO',20),'>',n(1.5)));exit=c(price,down,i('BB_MIDDLE',20));}
  if(id==='supertrend'){const st=i('SUPERTREND_DIRECTION',10,{params:{factor:3}});entry=c(st,up,n(0));exit=c(st,down,n(0));}
  return {entry,exit,stages:[],cooldownBars:3};
 };
 const side=config.market==='Spot'?'SPOT':config.side;
 const pairs=[...(config.pairs??[config.pair])];
 const spec={schemaVersion:2,name:`${p.title} · ${pairs.length===1?pairs[0]:pairs.length+' คู่'} · ${side}`,exchange:[config.exchange],market:config.market,side,pairs,timeframe:t,...branch(side==='SHORT'),destinations:[]};
 if(side==='BOTH')spec.short=branch(true);
 return spec;
}
export function describePreset(spec){
 const operand=o=>o.kind==='CONSTANT'?String(o.value):o.kind==='PRICE'?`ราคาปิด (${o.timeframe})`:`${o.name} ${o.period}${o.params?.factor?' / '+o.params.factor:''} (${o.timeframe})`;
 const condition=c=>c.kind==='GROUP'?c.children.map(condition).join(' และ '):`${operand(c.left)} ${{CROSS_ABOVE:'ตัดขึ้นเหนือ',CROSS_BELOW:'ตัดลงใต้','>':'มากกว่า','<':'น้อยกว่า'}[c.op]??c.op} ${operand(c.right)}`;
 const lines=[`${spec.exchange[0]} · ${spec.pairs.join(', ')} · ${spec.market} · ${spec.side} · ${spec.timeframe}`,`เข้า${spec.side==='BOTH'?' Long':''}: ${condition(spec.entry)}`,`ออก${spec.side==='BOTH'?' Long':''}: ${condition(spec.exit)}`];
 if(spec.short)lines.push(`เข้า Short: ${condition(spec.short.entry)}`,`ออก Short: ${condition(spec.short.exit)}`);
 lines.push('พัก 3 แท่งหลังจบวงจร · ตรวจแท่งปิด · เป็นสัญญาณ ไม่ส่งออเดอร์');
 return lines.join('\n');
}
