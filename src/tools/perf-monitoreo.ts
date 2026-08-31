import type { z } from "zod";
import { MonitoringCaptureInputSchema } from "../schemas/tools.js";
import { captureMonitoringEvidence, type MonitoringCaptureOutcome } from "../monitoring/capture.js";

export async function perfMonitoreo(
  input: z.infer<typeof MonitoringCaptureInputSchema>,
): Promise<MonitoringCaptureOutcome> {
  return captureMonitoringEvidence({
    dashboardUrl: input.dashboard_url,
    label: input.label,
    outputPath: input.output_path,
    waitSeconds: input.wait_seconds,
    width: input.width,
    height: input.height,
    fullPage: input.full_page,
    timeoutSeconds: input.timeout_seconds,
  });
}
