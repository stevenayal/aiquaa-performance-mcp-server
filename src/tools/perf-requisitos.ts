import type { z } from "zod";
import { RequirementsInputSchema } from "../schemas/tools.js";
import { parseRequirement } from "../analyzers/requirement.js";
export function perfRequisitos(input: z.infer<typeof RequirementsInputSchema>) {
  return parseRequirement(
    input.requirement_text,
    input.requirement_id,
    input.operation_ids,
    input.source_reference,
  );
}
