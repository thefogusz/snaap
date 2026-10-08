export function pricing(mode: "standard" | "deep") {
  const prefix = mode === "standard" ? "AI_STANDARD" : "AI_DEEP";
  const input = Number(process.env[prefix + "_INPUT_USD_PER_MILLION"]),
    output = Number(process.env[prefix + "_OUTPUT_USD_PER_MILLION"]);
  if (![input, output].every((x) => Number.isFinite(x) && x > 0))
    throw new Error("AI_COST_CONFIGURATION_REQUIRED");
  // Cached input is optional; without a valid discounted rate it is costed as normal input.
  const cached = Number(process.env[prefix + "_CACHED_INPUT_USD_PER_MILLION"]);
  return {
    input,
    output,
    cachedInput: Number.isFinite(cached) && cached > 0 && cached <= input ? cached : input,
  };
}
export function usageCost(
  rate: ReturnType<typeof pricing>,
  tokens: { input: number; cachedInput: number; output: number },
) {
  return (
    ((tokens.input - tokens.cachedInput) * rate.input +
      tokens.cachedInput * rate.cachedInput +
      tokens.output * rate.output) /
    1e6
  );
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
