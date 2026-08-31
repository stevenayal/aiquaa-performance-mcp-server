import type { z } from "zod";
import type { TelemetryInputSchema } from "../schemas/tools.js";
import { getTokenLedger } from "../telemetry/tokens.js";
import { buildTokenReportPdf } from "../reporting/tokens-pdf.js";

export interface TelemetryReport {
  ledger: ReturnType<typeof getTokenLedger>;
  pdf?: { encoding: "base64"; content: string };
}

export async function perfTelemetria(
  input: z.infer<typeof TelemetryInputSchema>,
): Promise<TelemetryReport> {
  const ledger = getTokenLedger();
  if (input.format !== "pdf") return { ledger };
  const pdf = await buildTokenReportPdf(ledger);
  return { ledger, pdf: { encoding: "base64", content: pdf.toString("base64") } };
}
