import type { JtlSummary, ThresholdDefinition } from "../types.js";
import { analyzeJtl } from "../results/jtl.js";

export interface Comparison {
  verdict: "improvement" | "degradation" | "no_significant_change" | "not_comparable";
  reasons: string[];
  p95ChangePercent?: number;
  errorRateChangePoints?: number;
  baseline: JtlSummary;
  candidate: JtlSummary;
}
export function compareJtl(
  baselineContent: string,
  candidateContent: string,
  thresholds: ThresholdDefinition[],
  baselineContext: Record<string, unknown>,
  candidateContext: Record<string, unknown>,
  limit: number,
): Comparison {
  const baseline = analyzeJtl(baselineContent, thresholds);
  const candidate = analyzeJtl(candidateContent, thresholds);
  const reasons: string[] = [];
  for (const key of [
    "load",
    "duration",
    "dataset",
    "environment",
    "infrastructure",
    "version",
    "warmUp",
  ])
    if (
      baselineContext[key] !== undefined &&
      candidateContext[key] !== undefined &&
      JSON.stringify(baselineContext[key]) !== JSON.stringify(candidateContext[key])
    )
      reasons.push(`Contexto distinto: ${key}.`);
  if (!baseline.samples || !candidate.samples) reasons.push("Una ejecución no tiene muestras.");
  if (reasons.length) return { verdict: "not_comparable", reasons, baseline, candidate };
  const p95ChangePercent = baseline.p95Ms
    ? ((candidate.p95Ms - baseline.p95Ms) / baseline.p95Ms) * 100
    : 0;
  const errorRateChangePoints = candidate.errorRate - baseline.errorRate;
  const verdict =
    p95ChangePercent > limit || errorRateChangePoints > 0.5
      ? "degradation"
      : p95ChangePercent < -limit && errorRateChangePoints <= 0
        ? "improvement"
        : "no_significant_change";
  return {
    verdict,
    reasons: [
      `P95 cambió ${p95ChangePercent.toFixed(2)}%.`,
      `Error rate cambió ${errorRateChangePoints.toFixed(2)} puntos.`,
    ],
    p95ChangePercent,
    errorRateChangePoints,
    baseline,
    candidate,
  };
}
