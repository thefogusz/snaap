export function conditionRows(spec) {
  const rows = [];
  function walk(condition, path, section, side) {
    if (!condition) return;
    const frames = new Set();
    function collect(c) {
      if (c.kind === "GROUP") c.children.forEach(collect);
      else if (c.kind === "HOLD") collect(c.condition);
      else
        [c.left, c.right].forEach((o) => {
          if (o.timeframe) frames.add(o.timeframe);
        });
    }
    collect(condition);
    rows.push({ condition, path, section, side, frames: [...frames] });
    if (condition.kind === "GROUP")
      condition.children.forEach((c, i) =>
        walk(c, `${path}.children.${i}`, section, side),
      );
    else if (condition.kind === "HOLD")
      walk(condition.condition, `${path}.condition`, section, side);
  }
  const branch = (b, prefix, side) => {
    walk(b.entry, `${prefix}entry`, "เข้า", side);
    (b.stages ?? []).forEach((s, i) =>
      walk(
        s.condition,
        `${prefix}stages.${i}.condition`,
        `รอยืนยัน ${i + 1}`,
        side,
      ),
    );
    walk(b.exit, `${prefix}exit`, "ออก", side);
    walk(b.cancel, `${prefix}cancel`, "ยกเลิก", side);
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
