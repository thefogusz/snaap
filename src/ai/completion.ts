/** A claim of a completed draft change requires a successful tool result this turn. */
export function claimsDraftChange(text: string) {
  return /ร่างที่(?:แก้|ปรับ)|ส่งร่าง[^\n]{0,40}แล้ว|(?:แก้|ปรับ|ลบ|เพิ่ม)[^\n]{0,24}(?:ร่าง|เซ(?:็)?ตอ(?:ัพ|ัป)|exit|entry|เงื่อนไข)[^\n]{0,24}(?:แล้ว|เรียบร้อย)|ร่าง[^\n]{0,24}ผ่าน[^\n]{0,24}(?:ตรวจ|validate)|\b(?:I(?:'ve| have)?|we(?:'ve| have)?)\s+(?:successfully\s+)?(?:updated|changed|edited|created|removed|added)[^\n]{0,60}\b(?:draft|setup|strategy|condition|entry|exit)\b/i.test(
    text,
  );
}
export function requestsDraftChange(text: string) {
  if (
    /ไม่(?:ต้อง|ให้)\s*(?:แก้|ปรับ|เปลี่ยน|สร้าง)|อย่า\s*(?:แก้|ปรับ|เปลี่ยน|สร้าง)|do not (?:edit|change)|don't (?:edit|change)/i.test(
      text,
    )
  )
    return false;
  return /สร้าง|ออกแบบ|เปลี่ยน|ลบ|เพิ่ม|แก้|ปรับ|ส่งร่าง|\b(?:create|edit|change|remove|delete|add)\b/i.test(
    text,
  );
}
export function toolSpec(argumentsText: string, previous?: { market: string; exchange: string[]; pairs: string[]; targets?: unknown[] }) {
  const parsed = JSON.parse(argumentsText);
  // Some compatible providers emit the complete spec without the tool's wrapper.
  const spec =
    parsed?.spec ?? (parsed?.schemaVersion === 2 ? parsed : undefined);
  if (spec?.market === "Perpetual Futures") {
    const canonical = (pair: unknown) =>
      typeof pair === "string" && /^[A-Z0-9._-]+\/USDT:USDT$/.test(pair)
        ? pair.slice(0, -5)
        : pair;
    if (Array.isArray(spec.pairs)) spec.pairs = spec.pairs.map(canonical);
    if (Array.isArray(spec.targets)) spec.targets = spec.targets.map((target: any) =>
      target && typeof target === 'object' ? { ...target, pair: canonical(target.pair) } : target);
  }
  const sameMembers = (next: unknown, prior: string[]) => Array.isArray(next) &&
    next.length === prior.length && prior.every(item => next.includes(item));
  if (previous?.targets && spec?.targets === undefined && spec?.market === previous.market &&
    sameMembers(spec.exchange, previous.exchange) && sameMembers(spec.pairs, previous.pairs))
    spec.targets = structuredClone(previous.targets);
  return spec;
}
export function instrumentSearch(query: string) {
  return query
    .toUpperCase()
    .replace(
      /\b(?:PERPETUAL|FUTURES|SPOT|SWAP|BINANCE|BYBIT|OKX|BITGET|MEXC|GATE)\b/g,
      "",
    )
    .trim()
    .replace(/:USDT$/, "")
    .replace(/[^A-Z0-9]/g, "");
}
