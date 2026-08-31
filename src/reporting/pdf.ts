import type { Comparison } from "../comparison/compare.js";
import type { JtlSummary, ThresholdDefinition, Verdict } from "../types.js";
import {
  COLORS,
  type ChartPoint,
  type Doc,
  MARGIN,
  dataTable,
  embedSvg,
  ensureSpace,
  footers,
  formatDateTime,
  hr,
  metaTable,
  newDocument,
  pageContentWidth,
  statBand,
  subtitle,
  timeSeriesChart,
  title,
} from "./pdf-kit.js";
import { JMETER_LOGO_SVG } from "./jmeter-logo.js";

export interface ReportOptions {
  summary: JtlSummary;
  comparison?: Comparison | undefined;
  timeline?: ChartPoint[] | undefined;
  thresholds: ThresholdDefinition[];
  apiName: string;
  testType?: string | undefined;
  threads?: number | undefined;
  loops?: number | undefined;
  apiVersion?: string | undefined;
  repoUrl?: string | undefined;
  author?: string | undefined;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  PASS: "DENTRO DE SLA",
  FAIL: "FUERA DE SLA / DEGRADACIÓN",
  INCONCLUSIVE: "INCONCLUSO",
  NOT_EXECUTED: "NO EJECUTADO",
};
const VERDICT_COLOR: Record<Verdict, { fg: string; bg: string }> = {
  PASS: { fg: COLORS.greenPass, bg: COLORS.greenBg },
  FAIL: { fg: COLORS.redFail, bg: COLORS.redBg },
  INCONCLUSIVE: { fg: COLORS.amberWarn, bg: COLORS.amberBg },
  NOT_EXECUTED: { fg: COLORS.grayMid, bg: COLORS.grayLight },
};

function verdictBanner(doc: Doc, x: number, y: number, w: number, verdict: Verdict): number {
  const { fg, bg } = VERDICT_COLOR[verdict];
  const h = 28;
  doc.rect(x, y, w, h).fillAndStroke(bg, COLORS.grayBorder);
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(fg)
    .text(VERDICT_LABEL[verdict], x, y + 8, { width: w, align: "center" });
  return y + h;
}

function slaLine(thresholds: ThresholdDefinition[]): string {
  const global = thresholds.find((t) => t.scope === "global");
  if (!global) return "SLA evaluado: sin thresholds declarados.";
  const parts: string[] = [];
  if (global.maxErrorRate !== undefined) parts.push(`error rate <= ${global.maxErrorRate}%`);
  if (global.p95Ms !== undefined) parts.push(`p95 <= ${global.p95Ms}ms`);
  if (global.p99Ms !== undefined) parts.push(`p99 <= ${global.p99Ms}ms`);
  if (global.averageMs !== undefined) parts.push(`avg <= ${global.averageMs}ms`);
  return parts.length ? `SLA evaluado: ${parts.join(" · ")}` : "SLA evaluado: sin thresholds declarados.";
}

function comparisonTable(doc: Doc, x: number, y: number, w: number, comparison: Comparison): number {
  const rows: string[][] = [
    [
      "P95 (ms)",
      String(comparison.baseline.p95Ms),
      String(comparison.candidate.p95Ms),
      comparison.p95ChangePercent === undefined ? "n/a" : `${comparison.p95ChangePercent.toFixed(1)}%`,
    ],
    [
      "Error rate (%)",
      comparison.baseline.errorRate.toFixed(2),
      comparison.candidate.errorRate.toFixed(2),
      comparison.errorRateChangePoints === undefined
        ? "n/a"
        : `${comparison.errorRateChangePoints.toFixed(2)} pts`,
    ],
  ];
  return dataTable(
    doc,
    x,
    y,
    w,
    [
      { header: "Métrica", weight: 0.3 },
      { header: "Línea base", weight: 0.23, align: "center" },
      { header: "Esta corrida", weight: 0.23, align: "center" },
      { header: "Cambio", weight: 0.24, align: "center" },
    ],
    rows,
  );
}

function samplerTable(doc: Doc, x: number, startY: number, w: number, summary: JtlSummary): number {
  let y = ensureSpace(doc, startY, 40);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.grayDark).text("Detalle por sampler", x, y);
  y += 20;
  return dataTable(
    doc,
    x,
    y,
    w,
    [
      { header: "Sampler", weight: 0.3 },
      { header: "Total", weight: 0.11, align: "center" },
      { header: "Errores", weight: 0.12, align: "center" },
      { header: "Error %", weight: 0.12, align: "center" },
      { header: "Avg ms", weight: 0.12, align: "center" },
      { header: "P90 ms", weight: 0.11, align: "center" },
      { header: "P95 ms", weight: 0.12, align: "center" },
    ],
    summary.operations.map((op) => [
      op.label,
      String(op.samples),
      String(op.failures),
      `${op.errorRate.toFixed(2)}%`,
      op.averageMs.toFixed(1),
      op.p90Ms.toFixed(1),
      op.p95Ms.toFixed(1),
    ]),
    {
      cellColor: (row, _rowIndex, colIndex) => {
        if (colIndex !== 2 && colIndex !== 3) return undefined;
        return parseFloat(row[3] ?? "0") > 2 ? COLORS.redFail : undefined;
      },
      cellBold: (_row, _rowIndex, colIndex) => colIndex === 3,
    },
  );
}

function errorsTable(doc: Doc, x: number, startY: number, w: number, errors: Record<string, number>): number {
  const top = Object.entries(errors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (!top.length) return startY;
  let y = ensureSpace(doc, startY, 40);
  y += 12;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.grayDark).text("Top errores", x, y);
  y += 20;
  return dataTable(
    doc,
    x,
    y,
    w,
    [
      { header: "Código / mensaje", weight: 0.7 },
      { header: "Ocurrencias", weight: 0.3, align: "center" },
    ],
    top.map(([message, count]) => [message, String(count)]),
    { cellColor: (_row, _rowIndex, colIndex) => (colIndex === 0 ? COLORS.redFail : undefined) },
  );
}

export async function buildPdfReport(options: ReportOptions): Promise<Buffer> {
  const {
    summary,
    comparison,
    timeline,
    thresholds,
    apiName,
    testType,
    threads,
    loops,
    apiVersion,
    repoUrl,
    author,
  } = options;
  const { doc, done } = newDocument();
  const w = pageContentWidth(doc);
  let y = MARGIN;

  embedSvg(doc, JMETER_LOGO_SVG, MARGIN + w - 92, MARGIN - 4, { width: 92, height: 31 });
  y = title(doc, "Informe de Prueba de Rendimiento", y);
  y = subtitle(doc, testType ? `${apiName} — perfil ${testType}` : apiName, y);
  y = hr(doc, y, w);

  y = statBand(doc, MARGIN, y, w, 50, [
    { value: summary.samples.toLocaleString("es-AR"), label: "Peticiones totales" },
    { value: summary.throughput.toFixed(2), label: "Req/seg" },
    { value: `${summary.averageMs.toFixed(1)} ms`, label: "Tiempo promedio" },
    {
      value: `${summary.errorRate.toFixed(2)}%`,
      label: "Error rate",
      color: summary.errorRate > 2 ? COLORS.redFail : COLORS.greenPass,
    },
  ]);
  y += 12;
  y = statBand(doc, MARGIN, y, w, 46, [
    { value: `${summary.minMs} ms`, label: "Mínimo" },
    { value: `${summary.medianMs} ms`, label: "Mediana" },
    { value: `${summary.p90Ms} ms`, label: "Percentil 90" },
    { value: `${summary.p95Ms} ms`, label: "Percentil 95" },
    { value: `${summary.p99Ms} ms`, label: "Percentil 99" },
  ]);
  y += 12;

  y = verdictBanner(doc, MARGIN, y, w, summary.verdict);
  y += 6;
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.grayMid).text(slaLine(thresholds), MARGIN, y, {
    width: w,
    align: "center",
  });
  y += 16;
  if (summary.inconclusiveReasons.length)
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.amberWarn)
      .text(`Motivo INCONCLUSIVE: ${summary.inconclusiveReasons.join("; ")}`, MARGIN, y, { width: w });
  y += 12;

  if (comparison && comparison.verdict !== "not_comparable") {
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.grayDark).text("Comparación con línea base", MARGIN, y);
    y += 16;
    y = comparisonTable(doc, MARGIN, y, w, comparison);
    y += 12;
  }

  const meta: Array<[string, string]> = [
    ["Fecha / hora", formatDateTime(new Date())],
    ["Perfil", testType ?? "no especificado"],
    ["Threads (usuarios)", threads === undefined ? "no especificado" : String(threads)],
    ["Loops por thread", loops === undefined ? "hasta agotar duración" : String(loops)],
    ["Total requests (real)", summary.samples.toLocaleString("es-AR")],
  ];
  if (apiVersion) meta.push(["Versión / release", apiVersion]);
  if (repoUrl) meta.push(["Repositorio", repoUrl]);
  y = metaTable(doc, MARGIN, y, w, meta);
  y += 14;

  if (timeline && timeline.length) {
    y = ensureSpace(doc, y, 130);
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(COLORS.grayDark)
      .text("Transacciones y tiempo de respuesta durante la ejecución", MARGIN, y);
    y += 16;
    y = timeSeriesChart(doc, MARGIN, y, w, 110, timeline);
    y += 14;
  }

  y = samplerTable(doc, MARGIN, y, w, summary);
  errorsTable(doc, MARGIN, y, w, summary.errors);

  footers(
    doc,
    author
      ? `Prueba de rendimiento: ${author}  |  aiquaa-performance-mcp-server`
      : "aiquaa-performance-mcp-server",
  );
  doc.end();
  return done;
}
