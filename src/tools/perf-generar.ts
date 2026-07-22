import type { z } from "zod";
import { GenerateInputSchema } from "../schemas/tools.js";
import { generatePerformanceFiles } from "../jmeter/generator/index.js";
export function perfGenerar(input: z.infer<typeof GenerateInputSchema>) {
  return generatePerformanceFiles({
    mode: input.mode,
    apiName: input.api_name,
    baseUrl: input.base_url,
    endpoints: input.endpoints,
    model: input.load_model,
    ...(input.existing_jmx === undefined ? {} : { existingJmx: input.existing_jmx }),
    csvColumns: input.csv_columns,
    thresholds: input.thresholds,
  });
}
