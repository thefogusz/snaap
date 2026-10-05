import { z } from "zod";
import { strategySchema } from "./engine.js";
import { riskPlanSchema } from "./outcomes.js";
const fileSchema = z
  .object({
    format: z.literal("snaap.trade-setups"),
    version: z.literal(1),
    setups: z.array(strategySchema).min(1).max(50),
    riskPlans: z.array(riskPlanSchema.nullable()).max(50).optional(),
  })
  .strict()
  .refine(
    (f) => !f.riskPlans || f.riskPlans.length === f.setups.length,
    "riskPlans ต้องตรงกับจำนวนเซตอัป",
  );
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
