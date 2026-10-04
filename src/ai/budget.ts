export function pricing(mode: "standard" | "deep") {
  const prefix = mode === "standard" ? "AI_STANDARD" : "AI_DEEP";
  const input = Number(process.env[prefix + "_INPUT_USD_PER_MILLION"]),
    output = Number(process.env[prefix + "_OUTPUT_USD_PER_MILLION"]);
  const cap = Number(
    process.env[prefix + "_MAX_USD"] ?? (mode === "standard" ? 0.03 : 0.2),
  );
  if (![input, output, cap].every((x) => Number.isFinite(x) && x > 0))
    throw new Error("AI_COST_CONFIGURATION_REQUIRED");
  return { input, output, cap };
}
export function outputLimit(mode: "standard" | "deep") {
  const value = Number(
    process.env[
      mode === "standard"
        ? "AI_STANDARD_MAX_OUTPUT_TOKENS"
        : "AI_DEEP_MAX_OUTPUT_TOKENS"
    ] ?? 6000,
  );
  if (!Number.isInteger(value) || value < 2000 || value > 12000)
    throw new Error("AI_OUTPUT_CONFIGURATION_REQUIRED");
  return value;
}
/** Text/output estimate only. Image tokens are recorded from provider usage, not reserved here. */
export function boundCost(
  instructions: string,
  messages: unknown,
  rate: ReturnType<typeof pricing>,
  maxOutputTokens = 2000,
) {
  const redacted = JSON.stringify(messages, (_key, value) =>
    typeof value === "string" && value.startsWith("data:image/")
      ? "[image]"
      : value,
  );
  return (
    ((Buffer.byteLength(instructions + redacted) + 1024) *
      rate.input +
      maxOutputTokens * rate.output) /
    1e6
  );
}
