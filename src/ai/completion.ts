/** A claim of a completed draft change requires a successful tool result this turn. */
export function claimsDraftChange(text: string) {
  return /ร่างที่(?:แก้|ปรับ)|ส่งร่าง[^\n]{0,40}แล้ว|(?:แก้|ปรับ|ลบ|เพิ่ม)[^\n]{0,24}(?:ร่าง|exit|entry|เงื่อนไข)[^\n]{0,24}แล้ว|ร่าง[^\n]{0,24}ผ่าน[^\n]{0,24}(?:ตรวจ|validate)/i.test(
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
export function toolSpec(argumentsText: string) {
  const parsed = JSON.parse(argumentsText);
  // Some compatible providers emit the complete spec without the tool's wrapper.
  const spec =
    parsed?.spec ?? (parsed?.schemaVersion === 2 ? parsed : undefined);
  if (spec?.market === "Perpetual Futures" && Array.isArray(spec.pairs))
    spec.pairs = spec.pairs.map((pair: unknown) =>
      typeof pair === "string" && /^[A-Z0-9._-]+\/USDT:USDT$/.test(pair)
        ? pair.slice(0, -5)
        : pair,
    );
  return spec;
}
export function instrumentSearch(query: string) {
  return query
    .toUpperCase()
    .replace(
      /\b(?:PERPETUAL|FUTURES|SPOT|SWAP|BINANCE|BYBIT|OKX|BITGET|MEXC)\b/g,
      "",
    )
    .trim()
    .replace(/:USDT$/, "")
    .replace(/[^A-Z0-9]/g, "");
}
