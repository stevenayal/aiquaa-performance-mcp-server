import { z } from "zod";
import {
  EndpointSchema,
  RequirementSchema,
  ResponseFormatSchema,
  TestTypeSchema,
  ThresholdSchema,
} from "./common.js";

const artifacts = z
  .array(z.object({ path: z.string().min(1), content: z.string() }).strict())
  .default([]);
export const AnalyzeInputSchema = z
  .object({
    requirement_text: z.string().max(100_000).optional(),
    repository_path: z.string().optional(),
    openapi: z.union([z.string(), z.record(z.unknown())]).optional(),
    artifacts,
    response_format: ResponseFormatSchema,
  })
  .strict();
export const RequirementsInputSchema = z
  .object({
    requirement_text: z.string().min(3).max(100_000),
    requirement_id: z.string().default("UNSPECIFIED"),
    operation_ids: z.array(z.string()).default([]),
    source_reference: z.string().default("user input"),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const ScenarioInputObjectSchema = z
  .object({
    requirement: RequirementSchema.optional(),
    preset: TestTypeSchema.optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const ScenarioInputSchema = ScenarioInputObjectSchema.refine(
  (v) => Boolean(v.requirement || v.preset),
  "Proporcione requirement o preset.",
);
export const CoverageInputSchema = z
  .object({
    requirement: RequirementSchema,
    jmx: z.string().min(10),
    thresholds: z.array(ThresholdSchema).default([]),
    dataset_content: z.string().optional(),
    ci_content: z.string().optional(),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const GenerateInputSchema = z
  .object({
    mode: z.enum(["create", "extend", "modify"]),
    api_name: z.string().min(1),
    base_url: z.string().url(),
    endpoints: z.array(EndpointSchema).min(1),
    load_model: z
      .object({
        kind: z.enum(["closed", "open"]),
        testType: TestTypeSchema,
        rationale: z.string(),
        threads: z.number().int().positive().optional(),
        loops: z.number().int().positive().optional(),
        arrivalRate: z.number().positive().optional(),
        durationSeconds: z.number().int().positive().optional(),
        rampUpSeconds: z.number().int().min(0),
        thinkTimeMs: z.number().int().min(0),
        aggressive: z.boolean(),
        assumptions: z.array(z.string()),
      })
      .strict(),
    existing_jmx: z.string().optional(),
    csv_columns: z.array(z.string()).default([]),
    thresholds: z.array(ThresholdSchema).default([]),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const ValidateInputSchema = z
  .object({ jmx: z.string().min(10), files: artifacts, response_format: ResponseFormatSchema })
  .strict();
export const ExecuteInputSchema = z
  .object({
    plan_path: z.string().min(1),
    target_url: z.string().url(),
    environment: z.string().min(1),
    mode: z.enum(["validation_only", "smoke", "full"]).default("validation_only"),
    threads: z.number().int().positive().default(1),
    duration_seconds: z.number().int().positive().default(60),
    ramp_up_seconds: z.number().int().min(0).default(1),
    arrival_rate: z.number().positive().optional(),
    authorized: z.boolean().default(false),
    destructive: z.boolean().default(false),
    aggressive_confirmed: z.boolean().default(false),
    output_path: z.string().default("test-results/performance/results.jtl"),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const ResultsInputSchema = z
  .object({
    jtl: z.string().min(1),
    thresholds: z.array(ThresholdSchema).default([]),
    environment_stable: z.boolean().default(true),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const CompareInputSchema = z
  .object({
    baseline_jtl: z.string().min(1),
    candidate_jtl: z.string().min(1),
    thresholds: z.array(ThresholdSchema).default([]),
    baseline_context: z.record(z.unknown()).default({}),
    candidate_context: z.record(z.unknown()).default({}),
    max_p95_change_percent: z.number().positive().default(10),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const PipelineInputSchema = z
  .object({
    target: z.enum(["github_actions", "azure_pipelines"]),
    api_name: z.string().min(1),
    plan_path: z.string().min(1),
    dataset_path: z.string().optional(),
    thresholds_path: z.string().default("tests/performance/thresholds/thresholds.json"),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const MonitoringEvidenceSchema = z
  .object({
    label: z.string().min(1),
    source_url: z.string().url(),
    captured_at: z.string(),
    image_base64: z.string().min(1),
  })
  .strict();
export const ReportInputSchema = z
  .object({
    jtl: z.string().min(1),
    baseline_jtl: z.string().optional(),
    thresholds: z.array(ThresholdSchema).default([]),
    environment_stable: z.boolean().default(true),
    api_name: z.string().min(1).default("API"),
    test_type: TestTypeSchema.optional(),
    threads: z.number().int().positive().optional(),
    loops: z.number().int().optional(),
    api_version: z.string().optional(),
    repo_url: z.string().optional(),
    author: z.string().optional(),
    output_path: z.string().default("test-results/performance/INFORME_PERF.pdf"),
    monitoring_evidence: z.array(MonitoringEvidenceSchema).default([]),
  })
  .strict();
export const MonitoringCaptureInputSchema = z
  .object({
    dashboard_url: z.string().url(),
    label: z.string().min(1).default("Evidencia de monitoreo"),
    output_path: z.string().default("test-results/performance/evidence/EVIDENCIA_MONITOREO.png"),
    wait_seconds: z.number().min(0).max(120).default(5),
    width: z.number().int().positive().max(3840).default(1440),
    height: z.number().int().positive().max(2160).default(900),
    full_page: z.boolean().default(true),
    timeout_seconds: z.number().int().positive().max(180).default(30),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const TelemetryInputSchema = z
  .object({ format: z.enum(["json", "markdown", "pdf"]).default("json") })
  .strict();
export const ChangesInputSchema = z
  .object({
    analysis: z.record(z.unknown()),
    existing_files: z.array(z.string()).default([]),
    required_files: z.array(z.string()).default([]),
    coverage_before: z.number().min(0).max(100),
    response_format: ResponseFormatSchema,
  })
  .strict();
export const PullRequestInputSchema = z
  .object({
    owner: z.string().min(1),
    repo: z.string().min(1),
    base: z.string().default("main"),
    requirement_or_flow: z.string().min(1),
    title_flow: z.string().min(1),
    files: artifacts,
    body: z.string().min(1),
    dry_run: z.boolean().default(true),
    response_format: ResponseFormatSchema,
  })
  .strict();
