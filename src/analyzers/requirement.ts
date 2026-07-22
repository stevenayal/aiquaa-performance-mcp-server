import type { PerformanceRequirement, PerformanceTestType } from "../types.js";

function numberFor(text: string, pattern: RegExp): number | undefined {
  const value = text.match(pattern)?.[1]?.replace(",", ".");
  return value === undefined ? undefined : Number(value);
}
export function parseRequirement(
  text: string,
  id: string,
  operationIds: string[],
  sourceReference: string,
): PerformanceRequirement {
  const lower = text.toLowerCase();
  const types: PerformanceTestType[] = [
    "smoke",
    "baseline",
    "load",
    "stress",
    "spike",
    "endurance",
    "soak",
    "capacity",
    "breakpoint",
    "scalability",
    "volume",
    "aiquaa_stress",
  ];
  const testType = types.find((type) => lower.includes(type)) ?? "load";
  const concurrentUsers = numberFor(lower, /(\d+(?:[.,]\d+)?)\s*(?:usuarios|users|concurrent)/i);
  const arrivalRate = numberFor(lower, /(\d+(?:[.,]\d+)?)\s*(?:rps|req\/s|requests? por segundo)/i);
  const targetThroughput = numberFor(
    lower,
    /(?:throughput|rendimiento)\s*(?:de|:|=)?\s*(\d+(?:[.,]\d+)?)/i,
  );
  const durationMinutes = numberFor(lower, /(\d+(?:[.,]\d+)?)\s*(?:minutos?|minutes?)/i);
  const durationSeconds =
    durationMinutes === undefined
      ? numberFor(lower, /(\d+(?:[.,]\d+)?)\s*(?:segundos?|seconds?)/i)
      : durationMinutes * 60;
  const rampUpSeconds = numberFor(
    lower,
    /ramp[- ]?up\s*(?:de|:|=)?\s*(\d+(?:[.,]\d+)?)\s*(?:s|segundos?)?/i,
  );
  const maxErrorRate = numberFor(
    lower,
    /(?:error rate|tasa de error)\s*(?:menor (?:a|que)|<|de|:|=)?\s*(\d+(?:[.,]\d+)?)\s*%?/i,
  );
  const p95Ms = numberFor(
    lower,
    /p95\s*(?:menor (?:a|que)|<|de|:|=)?\s*(\d+(?:[.,]\d+)?)\s*(?:ms|milisegundos?)/i,
  );
  const p99Ms = numberFor(
    lower,
    /p99\s*(?:menor (?:a|que)|<|de|:|=)?\s*(\d+(?:[.,]\d+)?)\s*(?:ms|milisegundos?)/i,
  );
  const known = [
    concurrentUsers,
    arrivalRate,
    targetThroughput,
    durationSeconds,
    maxErrorRate,
    p95Ms,
    p99Ms,
  ].filter((v) => v !== undefined).length;
  return {
    id,
    operationIds,
    testType,
    ...(concurrentUsers === undefined ? {} : { concurrentUsers }),
    ...(arrivalRate === undefined ? {} : { arrivalRate }),
    ...(targetThroughput === undefined ? {} : { targetThroughput }),
    ...(durationSeconds === undefined ? {} : { durationSeconds: Math.round(durationSeconds) }),
    ...(rampUpSeconds === undefined ? {} : { rampUpSeconds: Math.round(rampUpSeconds) }),
    ...(maxErrorRate === undefined ? {} : { maxErrorRate }),
    responseTimeThresholds: {
      ...(p95Ms === undefined ? {} : { p95Ms }),
      ...(p99Ms === undefined ? {} : { p99Ms }),
    },
    source: { kind: "requirement", reference: sourceReference },
    confidence: known >= 4 ? "high" : known >= 2 ? "medium" : "low",
  };
}
