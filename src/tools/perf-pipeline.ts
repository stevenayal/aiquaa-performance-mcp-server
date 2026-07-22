import type { z } from "zod";
import { PipelineInputSchema } from "../schemas/tools.js";
import { generatePipeline } from "../pipelines/generator.js";
export function perfPipeline(input: z.infer<typeof PipelineInputSchema>) {
  return generatePipeline(
    input.target,
    input.api_name,
    input.plan_path,
    input.dataset_path,
    input.thresholds_path,
  );
}
