import PDFDocument from "pdfkit";
import type { Comparison } from "../comparison/compare.js";
import type { JtlSummary, ThresholdDefinition, Verdict } from "../types.js";

export interface ReportOptions {
  summary: JtlSummary;
  comparison?: Comparison | undefined;
  thresholds: ThresholdDefinition[];
  apiName: string;
  testType?: string | undefined;
  threads?: number | undefined;
  loops?: number | undefined;
  apiVersion?: string | undefined;
  repoUrl?: string | undefined;
  author?: string | undefined;
}

const NAVY = "#0D1B40";
const GRAY_DARK = "#1A1A1A";
const GRAY_MID = "#4A4A4A";
const GRAY_LIGHT = "#F5F5F5";
const GRAY_BORDER = "#DDDDDD";
const GREEN_PASS = "#16A34A";
const RED_FAIL = "#DC2626";
const AMBER_WARN = "#D97706";
const GREEN_BG = "#F0FDF4";
const RED_BG = "#FEF2F2";
const AMBER_BG = "#FFFBEB";
const WHITE = "#FFFFFF";

const VERDICT_LABEL: Record<Verdict, string> = {
  PASS: "DENTRO DE SLA",
  FAIL: "FUERA DE SLA / DEGRADACIÓN",
  INCONCLUSIVE: "INCONCLUSO",
  NOT_EXECUTED: "NO EJECUTADO",
};
const VERDICT_COLOR: Record<Verdict, { fg: string; bg: string }> = {
  PASS: { fg: GREEN_PASS, bg: GREEN_BG },
  FAIL: { fg: RED_FAIL, bg: RED_BG },
  INCONCLUSIVE: { fg: AMBER_WARN, bg: AMBER_BG },
  NOT_EXECUTED: { fg: GRAY_MID, bg: GRAY_LIGHT },
};

type Doc = PDFKit.PDFDocument;

function statCell(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  value: string,
  label: string,
  color: string,
): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(color)
    .text(value, x, y, { width: w, align: "center" });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(GRAY_MID)
    .text(label, x, y + 22, { width: w, align: "center" });
}

function statBand(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  cells: Array<{ value: string; label: string; color?: string }>,
): number {
  doc.rect(x, y, w, h).fillAndStroke(GRAY_LIGHT, GRAY_BORDER);
  const colW = w / cells.length;
  cells.forEach((cell, i) => {
    statCell(doc, x + i * colW, y + h / 2 - 16, colW, cell.value, cell.label, cell.color ?? GRAY_DARK);
  });
  return y + h;
}

function verdictBanner(doc: Doc, x: number, y: number, w: number, verdict: Verdict): number {
  const { fg, bg } = VERDICT_COLOR[verdict];
  const h = 28;
  doc.rect(x, y, w, h).fillAndStroke(bg, GRAY_BORDER);
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

function metaTable(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  rows: Array<[string, string]>,
): number {
  let cursor = y;
  for (const [key, value] of rows) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY_MID).text(key, x, cursor, { width: 130 });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(GRAY_DARK)
      .text(value, x + 135, cursor, { width: w - 135 });
    cursor += 16;
    doc
      .moveTo(x, cursor - 4)
      .lineTo(x + w, cursor - 4)
      .strokeColor(GRAY_BORDER)
      .lineWidth(0.5)
      .stroke();
  }
  return cursor;
}

function comparisonTable(doc: Doc, x: number, y: number, w: number, comparison: Comparison): number {
  const rows: Array<[string, string, string, string]> = [
    ["Métrica", "Línea base", "Esta corrida", "Cambio"],
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
  const colW = [w * 0.3, w * 0.23, w * 0.23, w * 0.24];
  let cursor = y;
  rows.forEach((row, i) => {
    const rowH = 18;
    if (i === 0) doc.rect(x, cursor, w, rowH).fill(GRAY_LIGHT);
    let cx = x;
    row.forEach((cell, ci) => {
      doc
        .font(i === 0 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8)
        .fillColor(GRAY_DARK)
        .text(cell, cx + 4, cursor + 5, { width: (colW[ci] ?? 0) - 8 });
      cx += colW[ci] ?? 0;
    });
    doc
      .rect(x, cursor, w, rowH)
      .strokeColor(GRAY_BORDER)
      .lineWidth(0.5)
      .stroke();
    cursor += rowH;
  });
  return cursor;
}

const MARGIN = 40;
const HEADERS = ["Sampler", "Total", "Errores", "Error %", "Avg ms", "P90 ms", "P95 ms"] as const;
const COL_WEIGHTS = [0.3, 0.11, 0.12, 0.12, 0.12, 0.11, 0.12];

function ensureSpace(doc: Doc, y: number, needed: number): number {
  if (y + needed <= doc.page.height - MARGIN - 20) return y;
  doc.addPage();
  return MARGIN;
}

function samplerTable(doc: Doc, x: number, startY: number, w: number, summary: JtlSummary): number {
  const colW = COL_WEIGHTS.map((weight) => weight * w);
  let y = ensureSpace(doc, startY, 40);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(GRAY_DARK).text("Detalle por sampler", x, y);
  y += 20;
  const rowH = 16;
  y = ensureSpace(doc, y, rowH);
  doc.rect(x, y, w, rowH).fill(NAVY);
  let cx = x;
  HEADERS.forEach((header, i) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(WHITE)
      .text(header, cx + 4, y + 4, { width: (colW[i] ?? 0) - 8 });
    cx += colW[i] ?? 0;
  });
  y += rowH;
  for (const [index, op] of summary.operations.entries()) {
    y = ensureSpace(doc, y, rowH);
    if (index % 2 === 1) doc.rect(x, y, w, rowH).fill(GRAY_LIGHT);
    const errColor = op.errorRate > 2 ? RED_FAIL : GRAY_DARK;
    const cells = [
      op.label,
      String(op.samples),
      String(op.failures),
      `${op.errorRate.toFixed(2)}%`,
      op.averageMs.toFixed(1),
      op.p90Ms.toFixed(1),
      op.p95Ms.toFixed(1),
    ];
    cx = x;
    cells.forEach((cell, i) => {
      doc
        .font(i === 3 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7.5)
        .fillColor(i === 2 || i === 3 ? errColor : GRAY_DARK)
        .text(cell, cx + 4, y + 4, { width: (colW[i] ?? 0) - 8 });
      cx += colW[i] ?? 0;
    });
    doc.rect(x, y, w, rowH).strokeColor(GRAY_BORDER).lineWidth(0.3).stroke();
    y += rowH;
  }
  return y;
}

function errorsTable(doc: Doc, x: number, startY: number, w: number, errors: Record<string, number>): number {
  const top = Object.entries(errors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (!top.length) return startY;
  let y = ensureSpace(doc, startY, 40);
  y += 12;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(GRAY_DARK).text("Top errores", x, y);
  y += 20;
  const colW = [w * 0.7, w * 0.3];
  const rowH = 16;
  y = ensureSpace(doc, y, rowH);
  doc.rect(x, y, w, rowH).fill(RED_BG);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(GRAY_DARK).text("Código / mensaje", x + 4, y + 4, {
    width: (colW[0] ?? 0) - 8,
  });
  doc.text("Ocurrencias", x + (colW[0] ?? 0) + 4, y + 4, { width: (colW[1] ?? 0) - 8 });
  y += rowH;
  for (const [message, count] of top) {
    y = ensureSpace(doc, y, rowH);
    doc.rect(x, y, w, rowH).strokeColor(GRAY_BORDER).lineWidth(0.3).stroke();
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(RED_FAIL)
      .text(message, x + 4, y + 4, { width: (colW[0] ?? 0) - 8 });
    doc
      .font("Helvetica")
      .fillColor(GRAY_DARK)
      .text(String(count), x + (colW[0] ?? 0) + 4, y + 4, { width: (colW[1] ?? 0) - 8 });
    y += rowH;
  }
  return y;
}

function footers(doc: Doc, author: string | undefined): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const w = doc.page.width;
    const h = doc.page.height;
    // Footer sits inside the bottom margin band; pdfkit auto-paginates text
    // that would land past page.maxY(), so the bottom margin is dropped to 0
    // for the duration of this draw and restored right after.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const left = author
      ? `Prueba de rendimiento: ${author}  |  aiquaa-performance-mcp-server`
      : "aiquaa-performance-mcp-server";
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(NAVY)
      .text(left, MARGIN, h - 28, { lineBreak: false });
    doc
      .fillColor(GRAY_MID)
      .text(`Pág. ${i - range.start + 1}/${range.count}`, w - MARGIN - 100, h - 28, {
        width: 100,
        align: "right",
        lineBreak: false,
      });
    doc.page.margins.bottom = bottomMargin;
  }
}

export async function buildPdfReport(options: ReportOptions): Promise<Buffer> {
  const { summary, comparison, thresholds, apiName, testType, threads, loops, apiVersion, repoUrl, author } =
    options;
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const w = doc.page.width - 2 * MARGIN;
  let y = MARGIN;

  doc.font("Helvetica-Bold").fontSize(20).fillColor(GRAY_DARK).text("Informe de Prueba de Rendimiento", MARGIN, y);
  y += 26;
  const subtitle = testType ? `${apiName} — perfil ${testType}` : apiName;
  doc.font("Helvetica").fontSize(11).fillColor(GRAY_MID).text(subtitle, MARGIN, y);
  y += 20;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + w, y).strokeColor(GRAY_BORDER).lineWidth(0.5).stroke();
  y += 12;

  y = statBand(doc, MARGIN, y, w, 50, [
    { value: summary.samples.toLocaleString("es-AR"), label: "Peticiones totales" },
    { value: summary.throughput.toFixed(2), label: "Req/seg" },
    { value: `${summary.averageMs.toFixed(1)} ms`, label: "Tiempo promedio" },
    {
      value: `${summary.errorRate.toFixed(2)}%`,
      label: "Error rate",
      color: summary.errorRate > 2 ? RED_FAIL : GREEN_PASS,
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
  doc.font("Helvetica").fontSize(8).fillColor(GRAY_MID).text(slaLine(thresholds), MARGIN, y, {
    width: w,
    align: "center",
  });
  y += 16;
  if (summary.inconclusiveReasons.length)
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(AMBER_WARN)
      .text(`Motivo INCONCLUSIVE: ${summary.inconclusiveReasons.join("; ")}`, MARGIN, y, { width: w });
  y += 12;

  if (comparison && comparison.verdict !== "not_comparable") {
    doc.font("Helvetica-Bold").fontSize(12).fillColor(GRAY_DARK).text("Comparación con línea base", MARGIN, y);
    y += 16;
    y = comparisonTable(doc, MARGIN, y, w, comparison);
    y += 12;
  }

  const meta: Array<[string, string]> = [
    ["Fecha / hora", new Date().toISOString()],
    ["Perfil", testType ?? "no especificado"],
    ["Threads (usuarios)", threads === undefined ? "no especificado" : String(threads)],
    ["Loops por thread", loops === undefined ? "hasta agotar duración" : String(loops)],
    ["Total requests (real)", summary.samples.toLocaleString("es-AR")],
  ];
  if (apiVersion) meta.push(["Versión / release", apiVersion]);
  if (repoUrl) meta.push(["Repositorio", repoUrl]);
  y = metaTable(doc, MARGIN, y, w, meta);
  y += 10;

  y = samplerTable(doc, MARGIN, y, w, summary);
  errorsTable(doc, MARGIN, y, w, summary.errors);

  footers(doc, author);
  doc.end();
  return done;
}
