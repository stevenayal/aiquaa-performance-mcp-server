import type { z } from "zod";
import { ChangesInputSchema } from "../schemas/tools.js";
export function perfCambios(input: z.infer<typeof ChangesInputSchema>) {
  const existing = new Set(input.existing_files);
  const missing = input.required_files.filter((f) => !existing.has(f));
  const coverageAfterEstimated = Math.min(
    100,
    Math.round(input.coverage_before + (100 - input.coverage_before) * (missing.length ? 0.7 : 0)),
  );
  return {
    strategy: input.existing_files.some((f) => f.endsWith(".jmx"))
      ? missing.length
        ? "extend"
        : "keep"
      : "create",
    filesToCreate: missing,
    filesToModify: input.existing_files.filter((f) =>
      /\.jmx$|threshold|pipeline|workflow/i.test(f),
    ),
    filesToKeep: input.existing_files.filter((f) => !/\.jmx$|threshold|pipeline|workflow/i.test(f)),
    coverageBefore: input.coverage_before,
    coverageAfterEstimated,
    executionRisk: missing.some((f) => f.endsWith(".jmx")) ? "medium" : "low",
    assumptions: ["La cobertura posterior es una estimación hasta validar los artefactos."],
    warnings: [],
  };
}
