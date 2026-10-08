// Used by the editor, evaluator and notification delivery.
export function mirrorCondition(condition) {
  if (condition.kind === 'GROUP') return {...condition, children: condition.children.map(mirrorCondition)};
  if (condition.kind === 'HOLD') return {...condition, condition: mirrorCondition(condition.condition)};
  // ENTRY_RETURN is already positive for favorable movement on either side.
  if ([condition.left, condition.right].some(o => o.kind === 'ENTRY_RETURN')) return structuredClone(condition);
  return {...structuredClone(condition), op: ({'>':'<','>=':'<=','<':'>','<=':'>=',CROSS_ABOVE:'CROSS_BELOW',CROSS_BELOW:'CROSS_ABOVE'})[condition.op]};
}
export function mirrorBranch(spec) {
  return {entry:mirrorCondition(spec.entry), stages:spec.stages.map(s=>({...s,condition:mirrorCondition(s.condition)})), cooldownBars:spec.cooldownBars,
    ...(spec.exit?{exit:mirrorCondition(spec.exit)}:{}), ...(spec.cancel?{cancel:mirrorCondition(spec.cancel)}:{})};
}
function assignBranch(spec,branch) {
  delete spec.exit; delete spec.cancel;
  Object.assign(spec,branch);
}
export function selectDirections(input, selected) {
  const spec=structuredClone(input),previous=spec.side;
  // Materialize old Short templates before exposing a direct Short editor.
  if(previous==='SHORT'&&spec.mirrorShort)assignBranch(spec,mirrorBranch(spec));
  const side=selected.length===2?'BOTH':selected[0];
  if(previous==='BOTH'&&side==='SHORT')assignBranch(spec,spec.mirrorShort?mirrorBranch(spec):spec.short);
  if(previous==='SHORT'&&side==='BOTH')assignBranch(spec,mirrorBranch(spec));
  spec.side=side;
  delete spec.short; delete spec.mirrorShort;
  if(side==='BOTH')spec.mirrorShort=true;
  return spec;
}
export function setShortMirroring(input,enabled) {
  const spec=structuredClone(input);
  if(spec.side!=='BOTH')return spec;
  if(enabled){spec.mirrorShort=true;delete spec.short;}
  else {spec.short=mirrorBranch(spec);delete spec.mirrorShort;}
  return spec;
}
export function directionLabel(side, market) {
  if (market === 'Spot' || side === 'SPOT') return (globalThis.SnaapI18n?.text("Spot (ซื้อ)") ?? "Spot (ซื้อ)");
  if (!market && !['LONG','SHORT','BOTH'].includes(side)) return (globalThis.SnaapI18n?.text("ยังไม่ระบุตลาด / ฝั่ง") ?? "ยังไม่ระบุตลาด / ฝั่ง");
  return {LONG:(globalThis.SnaapI18n?.text("Long (ซื้อ) · Futures") ?? "Long (ซื้อ) · Futures"), SHORT:(globalThis.SnaapI18n?.text("Short (ขาย) · Futures") ?? "Short (ขาย) · Futures"), BOTH:'Long + Short · Futures'}[side] ?? (globalThis.SnaapI18n?.text("Futures · ยังไม่ระบุฝั่ง") ?? "Futures · ยังไม่ระบุฝั่ง");
}
export function signalDirection(event, setupMarket, setupSide) {
  // The saved revision, not today's edited setup, provides the legacy fallback.
  return directionLabel(event.side ?? setupSide, event.market ?? setupMarket);
}
