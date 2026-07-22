import type { z } from "zod";
import { CompareInputSchema } from "../schemas/tools.js";
import { compareJtl } from "../comparison/compare.js";
export function perfComparar(input: z.infer<typeof CompareInputSchema>) {
  return compareJtl(
    input.baseline_jtl,
    input.candidate_jtl,
    input.thresholds,
    input.baseline_context,
    input.candidate_context,
    input.max_p95_change_percent,
  );
}
