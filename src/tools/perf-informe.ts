import type { z } from "zod";
import { ReportInputSchema } from "../schemas/tools.js";
import { analyzeJtl, buildTimeline } from "../results/jtl.js";
import { compareJtl } from "../comparison/compare.js";
import { buildPdfReport } from "../reporting/pdf.js";
import type { JtlSummary } from "../types.js";
import type { Comparison } from "../comparison/compare.js";

export interface PerformanceReport {
  path: string;
  encoding: "base64";
  content: string;
  summary: JtlSummary;
  comparison?: Comparison;
}

export async function perfInforme(
  input: z.infer<typeof ReportInputSchema>,
): Promise<PerformanceReport> {
  const summary = analyzeJtl(input.jtl, input.thresholds, input.environment_stable);
  const comparison = input.baseline_jtl
    ? compareJtl(input.baseline_jtl, input.jtl, input.thresholds, {}, {}, 10)
    : undefined;
  const timeline = buildTimeline(input.jtl);
  const pdf = await buildPdfReport({
    summary,
    comparison,
    timeline,
    thresholds: input.thresholds,
    apiName: input.api_name,
    testType: input.test_type,
    threads: input.threads,
    loops: input.loops,
    apiVersion: input.api_version,
    repoUrl: input.repo_url,
    author: input.author,
  });
  return {
    path: input.output_path,
    encoding: "base64",
    content: pdf.toString("base64"),
    summary,
    ...(comparison ? { comparison } : {}),
  };
}
