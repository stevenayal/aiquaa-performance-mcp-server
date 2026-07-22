import type { z } from "zod";
import { AnalyzeInputSchema } from "../schemas/tools.js";
import type { PerformanceAnalysis } from "../types.js";
import { analyzeRepository } from "../analyzers/repository.js";
import { parseJmx } from "../jmeter/parser/index.js";

export async function perfAnalizar(
  input: z.infer<typeof AnalyzeInputSchema>,
): Promise<PerformanceAnalysis> {
  const base: PerformanceAnalysis = {
    observed: [],
    declared: [],
    estimated: [],
    unknown: [],
    endpoints: [],
    criticalFlows: [],
    risks: [],
    authentication: [],
    requiredData: [],
    existingPlans: [],
    existingThresholds: [],
    existingCi: [],
    confidence: "low",
  };
  if (input.repository_path) Object.assign(base, await analyzeRepository(input.repository_path));
  if (input.requirement_text) base.declared.push(input.requirement_text);
  if (input.openapi) {
    const text = typeof input.openapi === "string" ? input.openapi : JSON.stringify(input.openapi);
    base.endpoints.push(
      ...[...text.matchAll(/(?:"|\s)(\/[\w{}./-]+)(?:"|:)\s*[,\n{]/g)]
        .map((m) => m[1] ?? "")
        .filter(Boolean),
    );
    base.observed.push("Contrato OpenAPI proporcionado.");
  }
  for (const artifact of input.artifacts) {
    if (artifact.path.endsWith(".jmx")) {
      const parsed = parseJmx(artifact.content);
      base.existingPlans.push(artifact.path);
      base.observed.push(`${artifact.path}: ${parsed.samplers.length} samplers.`);
      base.risks.push(...parsed.errors);
    }
    if (/threshold/i.test(artifact.path)) base.existingThresholds.push(artifact.path);
    if (/workflow|pipeline/i.test(artifact.path)) base.existingCi.push(artifact.path);
  }
  base.endpoints = [...new Set(base.endpoints)];
  base.confidence =
    base.observed.length && base.declared.length ? "high" : base.observed.length ? "medium" : "low";
  if (!base.endpoints.length) base.unknown.push("Endpoints objetivo.");
  if (!base.declared.length) base.unknown.push("Requisito de carga y thresholds.");
  return base;
}
