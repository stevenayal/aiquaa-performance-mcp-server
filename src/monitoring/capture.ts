import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile } from "node:fs/promises";
import { run } from "../codegraph/client.js";
import { evaluateMonitoringTarget, safeRelativePath, type SafetyDecision } from "../security/policy.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export interface MonitoringCaptureInput {
  dashboardUrl: string;
  label: string;
  outputPath: string;
  waitSeconds: number;
  width: number;
  height: number;
  fullPage: boolean;
  timeoutSeconds: number;
}
export type MonitoringCaptureOutcome =
  | { captured: false; safety: SafetyDecision }
  | {
      captured: true;
      path: string;
      encoding: "base64";
      content: string;
      sourceUrl: string;
      label: string;
      capturedAt: string;
      widthPx: number;
      heightPx: number;
      fullPage: boolean;
      safety: SafetyDecision;
    };
interface PythonCaptureResult {
  path: string;
  url: string;
  capturedAtUtc: string;
  widthPx: number;
  heightPx: number;
  fullPage: boolean;
}

export async function captureMonitoringEvidence(
  input: MonitoringCaptureInput,
): Promise<MonitoringCaptureOutcome> {
  const safety = evaluateMonitoringTarget(input.dashboardUrl);
  if (!safety.allowed) return { captured: false, safety };
  const output = path.resolve(safeRelativePath(input.outputPath));
  await mkdir(path.dirname(output), { recursive: true });
  const script = path.join(moduleDir, "python", "capture_dashboard.py");
  const pythonBin = process.env.PERF_MONITORING_PYTHON_BIN?.trim() || "python3";
  const args = [
    script,
    "--url",
    input.dashboardUrl,
    "--output",
    output,
    "--wait-seconds",
    String(input.waitSeconds),
    "--width",
    String(input.width),
    "--height",
    String(input.height),
    "--timeout-seconds",
    String(input.timeoutSeconds),
    ...(input.fullPage ? ["--full-page"] : []),
  ];
  const timeoutMs = (input.timeoutSeconds + input.waitSeconds + 30) * 1000;
  const stdout = await run(pythonBin, args, process.cwd(), timeoutMs);
  const meta = JSON.parse(stdout) as PythonCaptureResult;
  const png = await readFile(output);
  return {
    captured: true,
    path: output,
    encoding: "base64",
    content: png.toString("base64"),
    sourceUrl: input.dashboardUrl,
    label: input.label,
    capturedAt: meta.capturedAtUtc,
    widthPx: meta.widthPx,
    heightPx: meta.heightPx,
    fullPage: meta.fullPage,
    safety,
  };
}
