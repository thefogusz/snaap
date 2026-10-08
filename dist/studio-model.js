export function conditionRows(spec) {
  const rows = [];
  function walk(condition, path, section, side) {
    if (!condition) return [];
    const row = { condition, path, section, side, frames: [] };
    rows.push(row);
    let frames;
    if (condition.kind === "GROUP")
      frames = condition.children.flatMap((c, i) =>
        walk(c, `${path}.children.${i}`, section, side),
      );
    else if (condition.kind === "HOLD")
      frames = walk(condition.condition, `${path}.condition`, section, side);
    else
      frames = [condition.left, condition.right].flatMap((o) => o.timeframe ? [o.timeframe] : []);
    // Reuse child frames while keeping rows in parent-first display order.
    row.frames = [...new Set(frames)];
    return row.frames;
  }
  const branch = (b, prefix, side) => {
    walk(b.entry, `${prefix}entry`, (globalThis.SnaapI18n?.text("เข้า") ?? "เข้า"), side);
    (b.stages ?? []).forEach((s, i) =>
      walk(
        s.condition,
        `${prefix}stages.${i}.condition`,
        `${(globalThis.SnaapI18n?.text("รอยืนยัน ") ?? "รอยืนยัน ")}${i + 1}`,
        side,
      ),
    );
    walk(b.exit, `${prefix}exit`, (globalThis.SnaapI18n?.text("ออก") ?? "ออก"), side);
    walk(b.cancel, `${prefix}cancel`, (globalThis.SnaapI18n?.text("ยกเลิก") ?? "ยกเลิก"), side);
  };
  branch(
    spec,
    "",
    spec.side === "SPOT" || spec.market === "Spot"
      ? "Spot"
      : spec.side === "SHORT"
        ? "Short"
        : "Long",
  );
  if (spec.short) branch(spec.short, "short.", "Short");
  return rows;
}
export function indicatorUses(spec) {
  const uses = new Map();
  for (const row of conditionRows(spec).filter(
    (r) => r.condition.kind === "COMPARE",
  )) {
    for (const part of ["left", "right"]) {
      const operand = row.condition[part];
      if (operand.kind !== "INDICATOR") continue;
      const key = indicatorKey(operand);
      if (!uses.has(key)) uses.set(key, { operand, paths: [], conditions: [] });
      uses.get(key).paths.push(`${row.path}.${part}`);
      uses.get(key).conditions.push(row.path);
    }
  }
  return [...uses.values()];
}
export function indicatorKey(operand) {
  const stable = (v) =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, stable(v[k])]),
          )
        : v;
  return JSON.stringify(stable(operand));
}
export function evidenceAtPath(bar, path, spec) {
  if (!bar) return;
  const short = path.startsWith("short.");
  const branch =
    bar.branches?.find(
      (b) =>
        b.side ===
        (short || spec.side === "SHORT"
          ? "SHORT"
          : spec.market === "Spot"
            ? "SPOT"
            : "LONG"),
    ) ?? bar;
  const tokens = (short ? path.slice(6) : path).split(".");
  let evidence;
  if (tokens[0] === "stages") {
    evidence = branch.stages?.[Number(tokens[1])];
    tokens.splice(0, 3);
  } else evidence = branch[tokens.shift()];
  while (tokens.length && evidence) {
    const token = tokens.shift();
    if (token === "children")
      evidence = evidence.children?.[Number(tokens.shift())];
    else if (token === "condition") evidence = evidence.children?.[0];
    else return;
  }
  return evidence;
}
