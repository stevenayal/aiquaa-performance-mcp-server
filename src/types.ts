export const TEST_TYPES = [
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
] as const;
export type PerformanceTestType = (typeof TEST_TYPES)[number];
export type Confidence = "high" | "medium" | "low";
export type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE" | "NOT_EXECUTED";
export type CoverageStatus =
  "covered" | "partially_covered" | "uncovered" | "outdated" | "unsafe" | "blocked";
export type ResponseFormat = "json" | "markdown" | "files" | "patch";

export interface SourceReference {
  kind: "requirement" | "repository" | "openapi" | "user" | "estimated";
  reference: string;
}
export interface ResponseTimeThresholds {
  averageMs?: number | undefined;
  p90Ms?: number | undefined;
  p95Ms?: number | undefined;
  p99Ms?: number | undefined;
  maxMs?: number | undefined;
}
export interface PerformanceRequirement {
  id: string;
  operationIds: string[];
  testType: PerformanceTestType;
  concurrentUsers?: number | undefined;
  arrivalRate?: number | undefined;
  durationSeconds?: number | undefined;
  rampUpSeconds?: number | undefined;
  loops?: number | undefined;
  targetThroughput?: number | undefined;
  maxErrorRate?: number | undefined;
  responseTimeThresholds: ResponseTimeThresholds;
  source: SourceReference;
  confidence: Confidence;
}
export interface LoadModel {
  kind: "closed" | "open";
  testType: PerformanceTestType;
  rationale: string;
  threads?: number | undefined;
  loops?: number | undefined;
  arrivalRate?: number | undefined;
  durationSeconds?: number | undefined;
  rampUpSeconds: number;
  thinkTimeMs: number;
  aggressive: boolean;
  assumptions: string[];
}
export interface ThresholdDefinition {
  scope: string;
  maxErrorRate?: number | undefined;
  averageMs?: number | undefined;
  p90Ms?: number | undefined;
  p95Ms?: number | undefined;
  p99Ms?: number | undefined;
  maxMs?: number | undefined;
}
export interface OperationMetric {
  label: string;
  samples: number;
  successes: number;
  failures: number;
  errorRate: number;
  throughput: number;
  averageMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  bytes: number;
  verdict: Verdict;
  endpoint?: string | undefined;
  method?: string | undefined;
}
export interface JtlSummary extends OperationMetric {
  operations: OperationMetric[];
  errors: Record<string, number>;
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  inconclusiveReasons: string[];
}
export interface GeneratedFile {
  path: string;
  content: string;
  encoding: "utf8";
}
export interface PerformanceAnalysis {
  observed: string[];
  declared: string[];
  estimated: string[];
  unknown: string[];
  endpoints: string[];
  criticalFlows: string[];
  risks: string[];
  authentication: string[];
  requiredData: string[];
  existingPlans: string[];
  existingThresholds: string[];
  existingCi: string[];
  confidence: Confidence;
}
export interface PerformanceCoverage {
  score: number;
  status: CoverageStatus;
  covered: string[];
  gaps: string[];
  warnings: string[];
}
export interface PerformanceChangeSet {
  analysis: PerformanceAnalysis;
  decision: "create" | "extend" | "modify" | "keep" | "block";
  testModel: LoadModel;
  files: GeneratedFile[];
  patches: Array<{ path: string; patch: string }>;
  coverage: PerformanceCoverage;
  thresholds: ThresholdDefinition[];
  assumptions: string[];
  warnings: string[];
  executionRisk: "low" | "medium" | "high" | "critical";
  commands: string[];
}
