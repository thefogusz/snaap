import { z } from "zod";
import { strategySchema } from "./engine.js";
const fileSchema = z
  .object({
    format: z.literal("snaap.trade-setups"),
    version: z.literal(1),
    setups: z.array(strategySchema).min(1).max(50),
    // Accept older files, but discard retired price-tracking settings.
    riskPlans: z.array(z.unknown()).max(50).optional(),
  })
  .strict()
  .refine(
    (f) => !f.riskPlans || f.riskPlans.length === f.setups.length,
    "riskPlans ต้องตรงกับจำนวนเซ็ตอัพ",
  );
export function setupFile(input: unknown) {
  const file = fileSchema.parse(
    input && typeof input === "object" && "schemaVersion" in input
      ? { format: "snaap.trade-setups", version: 1, setups: [input] }
      : input,
  );
  return {
    format: file.format,
    version: file.version,
    setups: file.setups.map((spec) => ({ ...spec, destinations: [] })),
  };
}
