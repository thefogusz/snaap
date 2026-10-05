// Shared entry units: AND is flattened, OR and HOLD retain their meaning.
export function entryUnits(condition) {
  if (condition.kind === "GROUP" && condition.op === "AND")
    return condition.children.flatMap(entryUnits);
  return [condition];
}
export function flexibilityCounts(entry, percent = 100) {
  const total = entryUnits(entry).length;
  return { total, needed: Math.ceil((total * percent) / 100) };
}
