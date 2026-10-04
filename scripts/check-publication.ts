import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

// Inspect Git's index, so this checks exactly the files that will be committed.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const forbiddenPath =
  /^(?:\.local|\.openai|\.playwright-cli|node_modules|coverage|qa)\/|^\.env(?!\.example$)|\.(?:pem|key|p12|pfx|log)$/i;
const credentialPatterns = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/,
  /AIza[A-Za-z0-9_-]{30,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const privateValues: string[] = [];
try {
  const environment = await readFile(".env", "utf8");
  for (const line of environment.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (
      !match ||
      !/(?:SECRET|TOKEN|API_KEY|ENCRYPTION_KEY|DATABASE_URL)$/.test(match[1]!)
    )
      continue;
    const value = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
    if (value.length >= 12) privateValues.push(value);
  }
} catch (error: unknown) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const findings: string[] = [];
for (const file of files) {
  if (forbiddenPath.test(file)) {
    findings.push(`${file}: runtime or private file staged`);
    continue;
  }
  const bytes = execFileSync("git", ["show", `:${file}`], {
    maxBuffer: 10 * 1024 * 1024,
  });
  if (bytes.includes(0)) continue;
  const content = bytes.toString("utf8");
  if (
    credentialPatterns.some((pattern) => pattern.test(content)) ||
    privateValues.some((value) => content.includes(value))
  )
    findings.push(`${file}: possible credential; inspect locally`);
}
if (findings.length) {
  // Report paths only. Never print the matching credential or file contents.
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${files.length} staged files checked; no configured secrets or forbidden runtime files found`,
  );
