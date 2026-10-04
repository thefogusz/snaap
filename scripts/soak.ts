import { writeFile, mkdir } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
const hours = Number(process.env.SOAK_HOURS ?? 48);
if (!Number.isFinite(hours) || hours <= 0 || hours > 48)
  throw new Error("SOAK_HOURS must be 0–48");
const start = Date.now(),
  until = start + hours * 3600000;
let checks = 0,
  failures = 0;
await mkdir(".local/reports", { recursive: true });
while (Date.now() < until) {
  try {
    const r = await fetch("http://127.0.0.1:4173/api/v1/health", {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok || !((await r.json()) as any).database) failures++;
  } catch {
    failures++;
  }
  checks++;
  await writeFile(
    ".local/reports/soak.json",
    JSON.stringify({
      start: new Date(start).toISOString(),
      asOf: new Date().toISOString(),
      checks,
      failures,
      complete: false,
      scope:
        "HTTP and database availability only; external providers need separate soak",
    }),
  );
  await setTimeout(60000);
}
await writeFile(
  ".local/reports/soak.json",
  JSON.stringify({
    start: new Date(start).toISOString(),
    end: new Date().toISOString(),
    checks,
    failures,
    complete: true,
    hours,
  }),
);
if (failures) process.exitCode = 1;
