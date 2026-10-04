/** Trade IDs are scoped to exchange/account/pair. Identical anonymous fills may be legitimate. */
export function mergeTrades<
  T extends { exchange: string; pair: string; id?: string; market?: string },
>(existing: T[], incoming: T[]) {
  const key = (row: T) =>
    row.id
      ? `${row.exchange}:${row.market ?? "Spot"}:${row.pair}:${row.id}`
      : null;
  const known = new Set(existing.map(key).filter(Boolean));
  let ambiguous = 0;
  const rows = incoming.filter((row) => {
    const id = key(row);
    if (!id) {
      ambiguous++;
      return true;
    }
    if (known.has(id)) return false;
    known.add(id);
    return true;
  });
  return { rows, duplicates: incoming.length - rows.length, ambiguous };
}
