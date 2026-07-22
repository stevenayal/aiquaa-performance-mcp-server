import type { LoadModel, PerformanceRequirement, PerformanceTestType } from "../types.js";

const PRESETS: Partial<Record<PerformanceTestType, LoadModel>> = {
  smoke: {
    kind: "closed",
    testType: "smoke",
    rationale: "Verifica que el plan y la correlación funcionan.",
    threads: 1,
    loops: 1,
    rampUpSeconds: 1,
    thinkTimeMs: 0,
    aggressive: false,
    assumptions: [],
  },
  baseline: {
    kind: "closed",
    testType: "baseline",
    rationale: "Produce una referencia inicial con carga pequeña y estable.",
    threads: 5,
    durationSeconds: 60,
    rampUpSeconds: 10,
    thinkTimeMs: 0,
    aggressive: false,
    assumptions: [],
  },
  aiquaa_stress: {
    kind: "closed",
    testType: "aiquaa_stress",
    rationale:
      "Preset de compatibilidad; aplica presión instantánea y no representa capacidad declarada.",
    threads: 1000,
    loops: 30,
    rampUpSeconds: 0,
    thinkTimeMs: 0,
    aggressive: true,
    assumptions: ["30.000 iteraciones aproximadas; ejecución requiere confirmación explícita."],
  },
};

export function presetModel(type: PerformanceTestType): LoadModel {
  const preset = PRESETS[type];
  if (preset) return structuredClone(preset);
  return {
    kind: "closed",
    testType: type,
    rationale: "No hay carga suficiente declarada; propuesta conservadora que debe validarse.",
    threads: 1,
    loops: 1,
    rampUpSeconds: 1,
    thinkTimeMs: 0,
    aggressive: false,
    assumptions: ["La carga es una propuesta, no una capacidad validada."],
  };
}

export function deriveLoadModel(requirement: PerformanceRequirement): LoadModel {
  if (requirement.arrivalRate !== undefined || requirement.targetThroughput !== undefined) {
    const arrivalRate = requirement.arrivalRate ?? requirement.targetThroughput;
    return {
      kind: "open",
      testType: requirement.testType,
      rationale:
        "El requisito expresa una tasa de llegada/throughput independiente del tiempo de respuesta.",
      ...(arrivalRate === undefined ? {} : { arrivalRate }),
      ...(requirement.durationSeconds === undefined
        ? {}
        : { durationSeconds: requirement.durationSeconds }),
      rampUpSeconds: requirement.rampUpSeconds ?? 30,
      thinkTimeMs: 0,
      aggressive: requirement.testType === "stress" || requirement.testType === "breakpoint",
      assumptions: [],
    };
  }
  if (requirement.concurrentUsers !== undefined) {
    return {
      kind: "closed",
      testType: requirement.testType,
      rationale: "El requisito expresa usuarios concurrentes que esperan cada respuesta.",
      threads: requirement.concurrentUsers,
      ...(requirement.loops === undefined ? {} : { loops: requirement.loops }),
      ...(requirement.durationSeconds === undefined
        ? {}
        : { durationSeconds: requirement.durationSeconds }),
      rampUpSeconds: requirement.rampUpSeconds ?? Math.min(120, requirement.concurrentUsers),
      thinkTimeMs: 0,
      aggressive: requirement.testType === "stress" || requirement.testType === "breakpoint",
      assumptions: [],
    };
  }
  const fallback = presetModel(requirement.testType);
  fallback.assumptions.push("El requisito no declara concurrencia ni tasa de llegada.");
  return fallback;
}
