import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  AnalyzeInputSchema,
  ChangesInputSchema,
  CompareInputSchema,
  CoverageInputSchema,
  ExecuteInputSchema,
  GenerateInputSchema,
  PipelineInputSchema,
  PullRequestInputSchema,
  RequirementsInputSchema,
  ResultsInputSchema,
  ScenarioInputObjectSchema,
  ScenarioInputSchema,
  ValidateInputSchema,
} from "../schemas/tools.js";
import type { ResponseFormat } from "../types.js";
import { perfAnalizar } from "./perf-analizar.js";
import { perfRequisitos } from "./perf-requisitos.js";
import { perfEscenario } from "./perf-escenario.js";
import { perfCobertura } from "./perf-cobertura.js";
import { perfGenerar } from "./perf-generar.js";
import { perfValidar } from "./perf-validar.js";
import { perfEjecutar } from "./perf-ejecutar.js";
import { perfResultados } from "./perf-resultados.js";
import { perfComparar } from "./perf-comparar.js";
import { perfPipeline } from "./perf-pipeline.js";
import { perfCambios } from "./perf-cambios.js";
import { perfPr } from "./perf-pr.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const localWrite = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const remoteWrite = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
export function registerTools(server: McpServer): void {
  server.registerTool(
    "perf_analizar",
    {
      title: "Analizar performance",
      description:
        "Analiza requisitos, repositorio, OpenAPI, JMX, datasets y CI, separando información observada, declarada, estimada y desconocida.",
      inputSchema: AnalyzeInputSchema.shape,
      annotations: readOnly,
    },
    async (raw) =>
      safe(async () => {
        const input = AnalyzeInputSchema.parse(raw);
        return result(input.response_format, await perfAnalizar(input));
      }),
  );
  server.registerTool(
    "perf_requisitos",
    {
      title: "Modelar requisitos de performance",
      description:
        "Convierte texto NFR/SLA/SLO en un PerformanceRequirement trazable y con confianza explícita.",
      inputSchema: RequirementsInputSchema.shape,
      annotations: readOnly,
    },
    async (raw) =>
      safe(() => {
        const input = RequirementsInputSchema.parse(raw);
        return result(input.response_format, perfRequisitos(input));
      }),
  );
  server.registerTool(
    "perf_escenario",
    {
      title: "Diseñar escenario de carga",
      description:
        "Selecciona y explica un modelo cerrado u abierto; soporta presets sin asumir carga universal.",
      inputSchema: ScenarioInputObjectSchema.shape,
      annotations: readOnly,
    },
    async (raw) =>
      safe(() => {
        const input = ScenarioInputSchema.parse(raw);
        return result(input.response_format, perfEscenario(input));
      }),
  );
  server.registerTool(
    "perf_cobertura",
    {
      title: "Evaluar cobertura JMeter",
      description:
        "Contrasta requisito, plan, dataset, thresholds y CI con estados de cobertura explícitos.",
      inputSchema: CoverageInputSchema.shape,
      annotations: readOnly,
    },
    async (raw) =>
      safe(() => {
        const input = CoverageInputSchema.parse(raw);
        return result(input.response_format, perfCobertura(input));
      }),
  );
  server.registerTool(
    "perf_generar",
    {
      title: "Generar o ampliar JMeter",
      description:
        "Genera, amplía o modifica JMX, CSV ficticio, properties y thresholds sin duplicar samplers por nombre.",
      inputSchema: GenerateInputSchema.shape,
      annotations: localWrite,
    },
    async (raw) =>
      safe(() => {
        const input = GenerateInputSchema.parse(raw);
        return result(input.response_format, perfGenerar(input));
      }),
  );
  server.registerTool(
    "perf_validar",
    {
      title: "Validar plan JMeter",
      description:
        "Valida XML seguro, estructura, variables, plugins, listeners pesados y secretos sin ejecutar la prueba.",
      inputSchema: ValidateInputSchema.shape,
      annotations: readOnly,
    },
    async (raw) =>
      safe(() => {
        const input = ValidateInputSchema.parse(raw);
        return result(input.response_format, perfValidar(input));
      }),
  );
  server.registerTool(
    "perf_ejecutar",
    {
      title: "Ejecutar JMeter con límites",
      description:
        "Ejecuta sólo con autorización, allowlist, límites y confirmaciones; validation_only es el modo predeterminado.",
      inputSchema: ExecuteInputSchema.shape,
      annotations: remoteWrite,
    },
    async (raw) =>
      safe(async () => {
        const input = ExecuteInputSchema.parse(raw);
        return result(input.response_format, await perfEjecutar(input));
      }),
  );
  server.registerTool(
    "perf_resultados",
    {
      title: "Analizar resultados JTL",
      description:
        "Calcula muestras, errores, throughput, percentiles, bytes, métricas por endpoint y veredictos.",
      inputSchema: ResultsInputSchema.shape,
      annotations: readOnly,
    },
    async (raw) =>
      safe(() => {
        const input = ResultsInputSchema.parse(raw);
        return result(input.response_format, perfResultados(input));
      }),
  );
  server.registerTool(
    "perf_comparar",
    {
      title: "Comparar ejecuciones",
      description:
        "Compara baseline/candidate y evita declarar regresiones cuando carga o contexto no son comparables.",
      inputSchema: CompareInputSchema.shape,
      annotations: readOnly,
    },
    async (raw) =>
      safe(() => {
        const input = CompareInputSchema.parse(raw);
        return result(input.response_format, perfComparar(input));
      }),
  );
  server.registerTool(
    "perf_pipeline",
    {
      title: "Generar pipeline JMeter",
      description:
        "Genera GitHub Actions o Azure Pipelines con Java/JMeter fijados, headless, dashboard, artifacts y thresholds.",
      inputSchema: PipelineInputSchema.shape,
      annotations: localWrite,
    },
    async (raw) =>
      safe(() => {
        const input = PipelineInputSchema.parse(raw);
        return result(input.response_format, perfPipeline(input));
      }),
  );
  server.registerTool(
    "perf_cambios",
    {
      title: "Planificar cambios de performance",
      description:
        "Genera el plan de create/extend/keep, cobertura estimada, supuestos y riesgo antes de escribir.",
      inputSchema: ChangesInputSchema.shape,
      annotations: readOnly,
    },
    async (raw) =>
      safe(() => {
        const input = ChangesInputSchema.parse(raw);
        return result(input.response_format, perfCambios(input));
      }),
  );
  server.registerTool(
    "perf_pr",
    {
      title: "Crear draft PR de performance",
      description:
        "Planifica por defecto y, con dry_run=false, crea rama, archivos y draft PR mediante GitHub.",
      inputSchema: PullRequestInputSchema.shape,
      annotations: remoteWrite,
    },
    async (raw) =>
      safe(async () => {
        const input = PullRequestInputSchema.parse(raw);
        return result(input.response_format, await perfPr(input));
      }),
  );
}
async function safe(
  action: () => CallToolResult | Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await action();
  } catch (error: unknown) {
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    };
  }
}
function result(format: ResponseFormat, value: unknown): CallToolResult {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown;
  const object =
    typeof normalized === "object" && normalized !== null && !Array.isArray(normalized)
      ? (normalized as Record<string, unknown>)
      : { value: normalized };
  const text =
    format === "json"
      ? JSON.stringify(value, null, 2)
      : format === "patch"
        ? toPatch(value)
        : toMarkdown(value);
  return { content: [{ type: "text", text }], structuredContent: object };
}
function toMarkdown(value: unknown): string {
  if (
    Array.isArray(value) &&
    value.every((v) => typeof v === "object" && v !== null && "path" in v)
  )
    return value
      .map((v) => {
        const file = v as { path: string; content?: string };
        return `## ${file.path}\n\n\`\`\`\n${file.content ?? ""}\n\`\`\``;
      })
      .join("\n\n");
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}
function toPatch(value: unknown): string {
  if (!Array.isArray(value)) return JSON.stringify(value, null, 2);
  return value
    .filter(
      (item): item is { path: string; content: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).path === "string" &&
        typeof (item as Record<string, unknown>).content === "string",
    )
    .map(
      (file) =>
        `diff --git a/${file.path} b/${file.path}\nnew file mode 100644\n--- /dev/null\n+++ b/${file.path}\n@@ -0,0 +1,${file.content.split("\n").length} @@\n${file.content
          .split("\n")
          .map((line) => `+${line}`)
          .join("\n")}`,
    )
    .join("\n");
}
