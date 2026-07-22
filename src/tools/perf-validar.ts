import type { z } from "zod";
import { ValidateInputSchema } from "../schemas/tools.js";
import { validateJmx } from "../jmeter/validator/index.js";
export function perfValidar(input: z.infer<typeof ValidateInputSchema>) {
  return validateJmx(
    input.jmx,
    input.files.map((f) => f.path),
  );
}
