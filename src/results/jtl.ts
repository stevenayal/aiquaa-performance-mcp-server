import type { JtlSummary, OperationMetric, ThresholdDefinition, Verdict } from "../types.js";

interface Sample {
  timestamp: number;
  elapsed: number;
  label: string;
  success: boolean;
  code: string;
  message: string;
  bytes: number;
}
export interface TimelineBucket {
  tSeconds: number;
  count: number;
  errorCount: number;
  avgMs: number;
}

/** Buckets raw samples by elapsed time for a transactions/response-time-over-time chart. */
export function buildTimeline(content: string, maxBuckets = 12): TimelineBucket[] {
  const rows = parseCsv(content.trim());
  if (rows.length < 2) return [];
  const headers = rows[0] ?? [];
  const samples = rows
    .slice(1)
    .map((row) => parseSample(headers, row))
    .filter((v): v is Sample => v !== undefined)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!samples.length) return [];
  const t0 = samples[0]?.timestamp ?? 0;
  const t1 = samples.at(-1)?.timestamp ?? t0;
  const durationSeconds = Math.max(1, (t1 - t0) / 1000);
  const bucketSeconds = Math.max(1, Math.ceil(durationSeconds / maxBuckets));
  const buckets = new Map<number, { count: number; totalMs: number; errors: number }>();
  for (const sample of samples) {
    const index = Math.floor((sample.timestamp - t0) / 1000 / bucketSeconds);
    const entry = buckets.get(index) ?? { count: 0, totalMs: 0, errors: 0 };
    entry.count += 1;
    entry.totalMs += sample.elapsed;
    if (!sample.success) entry.errors += 1;
    buckets.set(index, entry);
  }
  const lastIndex = Math.max(...buckets.keys());
  return Array.from({ length: lastIndex + 1 }, (_, index) => {
    const entry = buckets.get(index);
    return {
      tSeconds: index * bucketSeconds,
      count: entry?.count ?? 0,
      errorCount: entry?.errors ?? 0,
      avgMs: entry && entry.count ? Math.round(entry.totalMs / entry.count) : 0,
    };
  });
}

export function analyzeJtl(
  content: string,
  thresholds: ThresholdDefinition[] = [],
  environmentStable = true,
): JtlSummary {
  const rows = parseCsv(content.trim());
  if (rows.length < 2) return summary([], "all", thresholds, ["Faltan muestras."]);
  const headers = rows[0] ?? [];
  const samples = rows
    .slice(1)
    .map((row) => parseSample(headers, row))
    .filter((v): v is Sample => v !== undefined);
  const inconclusive = !environmentStable ? ["El ambiente fue declarado inestable."] : [];
  if (samples.length === 0) inconclusive.push("Faltan muestras válidas.");
  const labels = [...new Set(samples.map((s) => s.label))];
  const operations = labels.map((label) =>
    summary(
      samples.filter((s) => s.label === label),
      label,
      thresholds,
      inconclusive,
    ),
  );
  const all = summary(samples, "all", thresholds, inconclusive);
  all.operations = operations;
  all.errors = errorDistribution(samples);
  all.inconclusiveReasons = inconclusive;
  return all;
}
function summary(
  samples: Sample[],
  label: string,
  thresholds: ThresholdDefinition[],
  inconclusive: string[],
): JtlSummary {
  const elapsed = samples.map((s) => s.elapsed).sort((a, b) => a - b);
  const successes = samples.filter((s) => s.success).length;
  const failures = samples.length - successes;
  const seconds =
    samples.length > 1
      ? Math.max(0.001, ((samples.at(-1)?.timestamp ?? 0) - (samples[0]?.timestamp ?? 0)) / 1000)
      : 0;
  const metric: OperationMetric = {
    label,
    samples: samples.length,
    successes,
    failures,
    errorRate: samples.length ? (failures / samples.length) * 100 : 0,
    throughput: seconds ? samples.length / seconds : 0,
    averageMs: mean(elapsed),
    medianMs: percentile(elapsed, 50),
    minMs: elapsed[0] ?? 0,
    maxMs: elapsed.at(-1) ?? 0,
    p90Ms: percentile(elapsed, 90),
    p95Ms: percentile(elapsed, 95),
    p99Ms: percentile(elapsed, 99),
    bytes: samples.reduce((sum, s) => sum + s.bytes, 0),
    verdict: "NOT_EXECUTED",
  };
  metric.verdict = verdict(
    metric,
    thresholds.find((t) => t.scope === label) ?? thresholds.find((t) => t.scope === "global"),
    inconclusive,
  );
  return {
    ...metric,
    operations: [],
    errors: {},
    ...(samples[0] ? { startedAt: new Date(samples[0].timestamp).toISOString() } : {}),
    ...(samples.at(-1) ? { endedAt: new Date(samples.at(-1)?.timestamp ?? 0).toISOString() } : {}),
    inconclusiveReasons: inconclusive,
  };
}
function verdict(
  metric: OperationMetric,
  threshold: ThresholdDefinition | undefined,
  inconclusive: string[],
): Verdict {
  if (metric.samples === 0) return "NOT_EXECUTED";
  if (inconclusive.length || !threshold) return "INCONCLUSIVE";
  const fail =
    (threshold.maxErrorRate !== undefined && metric.errorRate > threshold.maxErrorRate) ||
    (threshold.averageMs !== undefined && metric.averageMs > threshold.averageMs) ||
    (threshold.p90Ms !== undefined && metric.p90Ms > threshold.p90Ms) ||
    (threshold.p95Ms !== undefined && metric.p95Ms > threshold.p95Ms) ||
    (threshold.p99Ms !== undefined && metric.p99Ms > threshold.p99Ms) ||
    (threshold.maxMs !== undefined && metric.maxMs > threshold.maxMs);
  return fail ? "FAIL" : "PASS";
}
function parseSample(headers: string[], row: string[]): Sample | undefined {
  const get = (...names: string[]): string | undefined => {
    const index = headers.findIndex((h) => names.includes(h.trim()));
    return index >= 0 ? row[index] : undefined;
  };
  const timestamp = Number(get("timeStamp", "timestamp"));
  const elapsed = Number(get("elapsed"));
  if (!Number.isFinite(timestamp) || !Number.isFinite(elapsed)) return undefined;
  return {
    timestamp,
    elapsed,
    label: get("label") ?? "unknown",
    success: (get("success") ?? "false").toLowerCase() === "true",
    code: get("responseCode", "code") ?? "",
    message: get("responseMessage", "message") ?? "",
    bytes: Number(get("bytes")) || 0,
  };
}
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char ?? "";
  }
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, rank)] ?? 0;
}
function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function errorDistribution(samples: Sample[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sample of samples.filter((s) => !s.success)) {
    const key = `${sample.code} ${sample.message}`.trim() || "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
