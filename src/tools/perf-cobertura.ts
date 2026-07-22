import type { z } from "zod";
import { CoverageInputSchema } from "../schemas/tools.js";
import { parseJmx } from "../jmeter/parser/index.js";
import type { PerformanceCoverage } from "../types.js";
export function perfCobertura(input: z.infer<typeof CoverageInputSchema>): PerformanceCoverage {
  const plan = parseJmx(input.jmx);
  const checks: Array<[string, boolean]> = [
    [
      "endpoints",
      input.requirement.operationIds.every((id) => plan.samplers.some((s) => s.includes(id))),
    ],
    ["usuarios/carga", /ThreadGroup\.num_threads|ArrivalsThreadGroup/.test(input.jmx)],
    ["ramp-up", /ThreadGroup\.ramp_time|rampUp/.test(input.jmx)],
    ["thresholds", input.thresholds.length > 0],
    [
      "datasets",
      !input.requirement.operationIds.length ||
        Boolean(input.dataset_content) ||
        plan.csvDataSets > 0,
    ],
    [
      "autenticación/correlación",
      !/auth|login|token/i.test(input.requirement.operationIds.join(" ")) ||
        plan.extractors.length > 0,
    ],
    ["resultados", plan.listeners.some((v) => /writer/i.test(v))],
    ["CI", Boolean(input.ci_content)],
  ];
  const covered = checks.filter(([, yes]) => yes).map(([name]) => name);
  const gaps = checks.filter(([, yes]) => !yes).map(([name]) => name);
  const score = Math.round((covered.length / checks.length) * 100);
  const unsafe = /View Results Tree|Graph Results|BeanShell/i.test(input.jmx);
  const status = !plan.valid
    ? "blocked"
    : unsafe
      ? "unsafe"
      : score === 100
        ? "covered"
        : score > 40
          ? "partially_covered"
          : "uncovered";
  return {
    score,
    status,
    covered,
    gaps,
    warnings: [...plan.errors, ...(unsafe ? ["Componentes inseguros/pesados detectados."] : [])],
  };
}
