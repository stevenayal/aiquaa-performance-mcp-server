import type { OperationMetric, ThresholdDefinition, Verdict } from "../types.js";
export function evaluateThreshold(
  metric: OperationMetric,
  threshold?: ThresholdDefinition,
): Verdict {
  if (!metric.samples) return "NOT_EXECUTED";
  if (!threshold) return "INCONCLUSIVE";
  return (threshold.maxErrorRate !== undefined && metric.errorRate > threshold.maxErrorRate) ||
    (threshold.p95Ms !== undefined && metric.p95Ms > threshold.p95Ms) ||
    (threshold.p99Ms !== undefined && metric.p99Ms > threshold.p99Ms)
    ? "FAIL"
    : "PASS";
}
