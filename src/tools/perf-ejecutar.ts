import type { z } from "zod";
import { ExecuteInputSchema } from "../schemas/tools.js";
import { evaluateExecution } from "../security/policy.js";
import { runJMeter } from "../jmeter/runner/index.js";
import type { LoadModel } from "../types.js";

export async function perfEjecutar(input: z.infer<typeof ExecuteInputSchema>) {
  const model: LoadModel = {
    kind: input.arrival_rate === undefined ? "closed" : "open",
    testType: input.mode === "smoke" ? "smoke" : "load",
    rationale: "Configuración explícita de ejecución.",
    threads: input.threads,
    durationSeconds: input.duration_seconds,
    rampUpSeconds: input.ramp_up_seconds,
    ...(input.arrival_rate === undefined ? {} : { arrivalRate: input.arrival_rate }),
    thinkTimeMs: 0,
    aggressive: input.threads > 100 || input.duration_seconds > 3600,
    assumptions: [],
  };
  if (input.mode === "validation_only")
    return {
      executed: false,
      mode: input.mode,
      verdict: "NOT_EXECUTED",
      command: ["jmeter", "-n", "-t", input.plan_path, "-l", input.output_path],
      safety: evaluateExecution(input.target_url, model, {
        authorized: false,
        destructive: input.destructive,
        aggressiveConfirmed: input.aggressive_confirmed,
      }),
    };
  const safety = evaluateExecution(input.target_url, model, {
    authorized: input.authorized,
    destructive: input.destructive,
    aggressiveConfirmed: input.aggressive_confirmed,
  });
  if (!safety.allowed)
    return { executed: false, mode: input.mode, verdict: "NOT_EXECUTED", safety };
  const output = await runJMeter(
    input.plan_path,
    input.output_path,
    {
      threads: String(input.threads),
      duration: String(input.duration_seconds),
      rampUp: String(input.ramp_up_seconds),
      targetUrl: input.target_url,
      ...(input.arrival_rate === undefined ? {} : { arrivalRate: String(input.arrival_rate) }),
    },
    Math.min((input.duration_seconds + 120) * 1000, 7_200_000),
  );
  return {
    executed: true,
    mode: input.mode,
    output_path: input.output_path,
    safety,
    log: output.slice(-10_000),
  };
}
