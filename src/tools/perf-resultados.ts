import type { z } from "zod";
import { ResultsInputSchema } from "../schemas/tools.js";
import { analyzeJtl } from "../results/jtl.js";
export function perfResultados(input: z.infer<typeof ResultsInputSchema>) {
  return analyzeJtl(input.jtl, input.thresholds, input.environment_stable);
}
