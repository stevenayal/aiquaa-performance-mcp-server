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
  ReportInputSchema,
  RequirementsInputSchema,
  ResultsInputSchema,
  ScenarioInputObjectSchema,
  ScenarioInputSchema,
  TelemetryInputSchema,
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
import { perfInforme } from "./perf-informe.js";
import { perfTelemetria } from "./perf-telemetria.js";
import { recordToolUsage } from "../telemetry/tokens.js";

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
      safe("perf_analizar", raw, async () => {
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
      safe("perf_requisitos", raw, () => {
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
      safe("perf_escenario", raw, () => {
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
      safe("perf_cobertura", raw, () => {
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
      safe("perf_generar", raw, () => {
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
      safe("perf_validar", raw, () => {
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
      safe("perf_ejecutar", raw, async () => {
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
      safe("perf_resultados", raw, () => {
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
      safe("perf_comparar", raw, () => {
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
      safe("perf_pipeline", raw, () => {
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
      safe("perf_cambios", raw, () => {
        const input = ChangesInputSchema.parse(raw);
        return result(input.response_format, perfCambios(input));
      }),
  );
  server.registerTool(
    "perf_informe",
    {
      title: "Generar informe PDF",
      description:
        "Genera un informe PDF (portada, veredicto, percentiles, comparación opcional con baseline y detalle por sampler) a partir de un JTL ya calculado por perf_resultados. Devuelve el PDF embebido en base64; el cliente decide si lo persiste.",
      inputSchema: ReportInputSchema.shape,
      annotations: localWrite,
    },
    async (raw) =>
      safe("perf_informe", raw, async () => {
        const input = ReportInputSchema.parse(raw);
        const report = await perfInforme(input);
        return {
          content: [
            {
              type: "text",
              text: [
                `Informe generado: ${report.path}`,
                `Veredicto: ${report.summary.verdict}`,
                `Muestras: ${report.summary.samples}`,
                `Error rate: ${report.summary.errorRate.toFixed(2)}%`,
                `P95: ${report.summary.p95Ms} ms`,
              ].join("\n"),
            },
            {
              type: "resource" as const,
              resource: {
                uri: `file://${report.path}`,
                mimeType: "application/pdf",
                blob: report.content,
              },
            },
          ],
          structuredContent: { path: report.path, verdict: report.summary.verdict },
        };
      }),
  );
  server.registerTool(
    "perf_telemetria",
    {
      title: "Consumo de tokens del servidor",
      description:
        "Contador de tokens estimados (heurística caracteres/4) consumidos por cada tool perf_* en esta sesión del proceso: llamadas, tokens de entrada y de salida. format: json/markdown devuelve el contador; pdf devuelve además un informe PDF embebido en base64.",
      inputSchema: TelemetryInputSchema.shape,
      annotations: readOnly,
    },
    async (raw) =>
      safe("perf_telemetria", raw, async () => {
        const input = TelemetryInputSchema.parse(raw);
        const report = await perfTelemetria(input);
        if (!report.pdf) return result(input.format === "pdf" ? "json" : input.format, report.ledger);
        return {
          content: [
            {
              type: "text",
              text: `Informe de tokens generado. Llamadas registradas: ${Object.values(
                report.ledger.perTool,
              ).reduce((sum, t) => sum + t.calls, 0)}.`,
            },
            {
              type: "resource" as const,
              resource: {
                uri: "file://test-results/performance/INFORME_TOKENS.pdf",
                mimeType: "application/pdf",
                blob: report.pdf.content,
              },
            },
          ],
          structuredContent: { ledger: report.ledger },
        };
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
      safe("perf_pr", raw, async () => {
        const input = PullRequestInputSchema.parse(raw);
        return result(input.response_format, await perfPr(input));
      }),
  );
}
async function safe(
  tool: string,
  raw: unknown,
  action: () => CallToolResult | Promise<CallToolResult>,
): Promise<CallToolResult> {
  let outcome: CallToolResult;
  try {
    outcome = await action();
  } catch (error: unknown) {
    outcome = {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    };
  }
  recordToolUsage(tool, JSON.stringify(raw ?? {}), contentText(outcome));
  return outcome;
}
function contentText(result: CallToolResult): string {
  return result.content
    .map((item) => {
      if (typeof (item as { text?: unknown }).text === "string")
        return (item as { text: string }).text;
      const resource = (item as { resource?: { text?: string; blob?: string } }).resource;
      return resource?.text ?? resource?.blob ?? "";
    })
    .join("\n");
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
