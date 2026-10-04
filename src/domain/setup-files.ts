import { z } from "zod";
import { strategySchema } from "./engine.js";
const fileSchema = z
  .object({
    format: z.literal("snaap.trade-setups"),
    version: z.literal(1),
    setups: z.array(strategySchema).min(1).max(50),
  })
  .strict();
export function setupFile(input: unknown) {
  const file = fileSchema.parse(
    input && typeof input === "object" && "schemaVersion" in input
      ? { format: "snaap.trade-setups", version: 1, setups: [input] }
      : input,
  );
  return {
    ...file,
    setups: file.setups.map((spec) => ({ ...spec, destinations: [] })),
  };
}
