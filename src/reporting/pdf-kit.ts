import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";

export type Doc = PDFKit.PDFDocument;

export const MARGIN = 40;
export const COLORS = {
  navy: "#0D1B40",
  grayDark: "#1A1A1A",
  grayMid: "#4A4A4A",
  grayLight: "#F5F5F5",
  grayBorder: "#DDDDDD",
  greenPass: "#16A34A",
  redFail: "#DC2626",
  amberWarn: "#D97706",
  greenBg: "#F0FDF4",
  redBg: "#FEF2F2",
  amberBg: "#FFFBEB",
  white: "#FFFFFF",
  chartBar: "#93C5FD",
  panelBg: "#181B1F",
  panelGrid: "#2C3235",
  panelText: "#9FA6AD",
  seriesGreen: "#73BF69",
  seriesBlue: "#5794F2",
  seriesRed: "#F2495C",
  percentileP90: "#FADE2A",
  percentileP95: "#FF9830",
} as const;

export function newDocument(): { doc: Doc; done: Promise<Buffer> } {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, done };
}

/**
 * Human-readable timestamp for report covers, e.g. "31 de ago de 2026, 02:59:37 UTC".
 * Fixed to UTC so the same run reads identically whether the report was built
 * on a laptop or a CI runner in another time zone.
 */
export function formatDateTime(date: Date): string {
  const formatted = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}

export function pageContentWidth(doc: Doc): number {
  return doc.page.width - 2 * MARGIN;
}

export function ensureSpace(doc: Doc, y: number, needed: number): number {
  if (y + needed <= doc.page.height - MARGIN - 20) return y;
  doc.addPage();
  return MARGIN;
}

export function title(doc: Doc, text: string, y: number): number {
  doc.font("Helvetica-Bold").fontSize(20).fillColor(COLORS.grayDark).text(text, MARGIN, y);
  return y + 26;
}

export function subtitle(doc: Doc, text: string, y: number): number {
  doc.font("Helvetica").fontSize(11).fillColor(COLORS.grayMid).text(text, MARGIN, y);
  return y + 20;
}

export function hr(doc: Doc, y: number, w: number): number {
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + w, y)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(0.5)
    .stroke();
  return y + 12;
}

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
    .fillColor(COLORS.grayMid)
    .text(label, x, y + 22, { width: w, align: "center" });
}

export function statBand(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  cells: Array<{ value: string; label: string; color?: string }>,
): number {
  doc.rect(x, y, w, h).fillAndStroke(COLORS.grayLight, COLORS.grayBorder);
  const colW = w / cells.length;
  cells.forEach((cell, i) => {
    statCell(doc, x + i * colW, y + h / 2 - 16, colW, cell.value, cell.label, cell.color ?? COLORS.grayDark);
  });
  return y + h;
}

export function metaTable(doc: Doc, x: number, y: number, w: number, rows: Array<[string, string]>): number {
  let cursor = y;
  for (const [key, value] of rows) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLORS.grayMid)
      .text(key, x, cursor, { width: 130 });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.grayDark)
      .text(value, x + 135, cursor, { width: w - 135 });
    cursor += 16;
    doc
      .moveTo(x, cursor - 4)
      .lineTo(x + w, cursor - 4)
      .strokeColor(COLORS.grayBorder)
      .lineWidth(0.5)
      .stroke();
  }
  return cursor;
}

export interface TableColumn {
  header: string;
  weight: number;
  align?: "left" | "center" | "right";
}
export interface DataTableOptions {
  cellColor?: (row: string[], rowIndex: number, colIndex: number) => string | undefined;
  cellBold?: (row: string[], rowIndex: number, colIndex: number) => boolean;
}

/** Header (navy/white) + zebra-striped, bordered data rows. Paginates via ensureSpace. */
export function dataTable(
  doc: Doc,
  x: number,
  startY: number,
  w: number,
  columns: TableColumn[],
  rows: string[][],
  options: DataTableOptions = {},
): number {
  const colW = columns.map((c) => c.weight * w);
  const rowH = 16;
  let y = ensureSpace(doc, startY, rowH);
  doc.rect(x, y, w, rowH).fill(COLORS.navy);
  let cx = x;
  columns.forEach((col, i) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(COLORS.white)
      .text(col.header, cx + 4, y + 4, { width: (colW[i] ?? 0) - 8, align: col.align ?? "left" });
    cx += colW[i] ?? 0;
  });
  y += rowH;
  rows.forEach((row, rowIndex) => {
    y = ensureSpace(doc, y, rowH);
    if (rowIndex % 2 === 1) doc.rect(x, y, w, rowH).fill(COLORS.grayLight);
    cx = x;
    row.forEach((cell, colIndex) => {
      const color = options.cellColor?.(row, rowIndex, colIndex) ?? COLORS.grayDark;
      const bold = options.cellBold?.(row, rowIndex, colIndex) ?? false;
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7.5)
        .fillColor(color)
        .text(cell, cx + 4, y + 4, {
          width: (colW[colIndex] ?? 0) - 8,
          align: columns[colIndex]?.align ?? "left",
        });
      cx += colW[colIndex] ?? 0;
    });
    doc.rect(x, y, w, rowH).strokeColor(COLORS.grayBorder).lineWidth(0.3).stroke();
    y += rowH;
  });
  return y;
}

export function embedSvg(
  doc: Doc,
  svg: string,
  x: number,
  y: number,
  options: { width?: number; height?: number } = {},
): void {
  SVGtoPDF(doc, svg, x, y, { preserveAspectRatio: "xMinYMin meet", ...options });
}

/** Reads width/height straight from a PNG's IHDR chunk (bytes 16-23, big-endian). */
function pngDimensions(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) return { width: 0, height: 0 };
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export interface EmbedImageOptions {
  caption?: string | undefined;
  sourceUrl?: string | undefined;
  capturedAt?: string | undefined;
}

/** Bordered card with a proportionally scaled PNG plus caption/metadata below it. Paginates via ensureSpace. */
export function embedImage(
  doc: Doc,
  x: number,
  startY: number,
  w: number,
  image: Buffer,
  options: EmbedImageOptions = {},
): number {
  const { width: imgW, height: imgH } = pngDimensions(image);
  const scale = imgW > 0 ? Math.min(1, w / imgW) : 1;
  const drawW = imgW > 0 ? imgW * scale : w;
  const drawH = imgH > 0 ? imgH * scale : w * 0.5625;
  let y = ensureSpace(doc, startY, drawH + 44);
  doc
    .roundedRect(x, y, w, drawH + 4, 4)
    .strokeColor(COLORS.grayBorder)
    .lineWidth(0.5)
    .stroke();
  doc.image(image, x + (w - drawW) / 2, y + 2, { width: drawW, height: drawH });
  y += drawH + 10;
  if (options.caption) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.grayDark).text(options.caption, x, y, { width: w });
    y += 13;
  }
  const metaParts = [options.sourceUrl, options.capturedAt].filter(Boolean) as string[];
  if (metaParts.length) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.grayMid)
      .text(metaParts.join("  ·  "), x, y, { width: w });
    y += 12;
  }
  return y + 8;
}

export function pill(doc: Doc, x: number, y: number, text: string, fg: string, bg: string, w: number): number {
  const h = 14;
  doc.roundedRect(x, y, w, h, 3).fill(bg);
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(fg)
    .text(text, x, y + 3.5, { width: w, align: "center" });
  return w;
}

export interface ChartPoint {
  tSeconds: number;
  count: number;
  avgMs: number;
  errorCount?: number;
  bucketSeconds?: number;
}

/** Percentile reference lines overlaid on the response-time chart. */
export interface PercentileMarkers {
  averageMs?: number;
  medianMs?: number;
  p90Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
}

/** Evenly spaced, human-friendly axis ticks (0, step, 2·step, …) covering `max`. */
function niceTicks(max: number, targetCount = 4): number[] {
  if (max <= 0) return Array.from({ length: targetCount + 1 }, (_, i) => i);
  const rawStep = max / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  const step = niceResidual * magnitude;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

const fmtNum = (value: number): string => value.toLocaleString("es-AR");

/** Smooth series path through `pts` using midpoint bezier control points. */
function seriesPath(doc: Doc, pts: { x: number; y: number }[]): void {
  pts.forEach((p, i) => {
    if (i === 0) {
      doc.moveTo(p.x, p.y);
      return;
    }
    const prev = pts[i - 1];
    if (!prev) return;
    const midX = (prev.x + p.x) / 2;
    doc.bezierCurveTo(midX, prev.y, midX, p.y, p.x, p.y);
  });
}

/** Draws one legend swatch and its label, returning the x after it. */
function legendItem(doc: Doc, x: number, y: number, color: string, label: string): number {
  doc.roundedRect(x, y, 8, 8, 2).fill(color);
  doc.font("Helvetica").fontSize(7).fillColor(COLORS.panelText).text(label, x + 12, y + 0.5);
  return x + 12 + doc.widthOfString(label) + 16;
}

interface PanelPlot {
  axisLeft: number;
  axisRight: number;
  axisTop: number;
  axisBottom: number;
  plotW: number;
  plotH: number;
  atX: (index: number) => number;
}

/**
 * Draws the shared Grafana-style dark panel (background, title, y grid + labels,
 * x axis ticks) and returns its plot geometry, or undefined when there is
 * nothing to plot.
 */
function panelFrame(
  doc: Doc,
  x: number,
  startY: number,
  w: number,
  h: number,
  title: string,
  titleColor: string,
  points: ChartPoint[],
  yTicks: number[],
  unitSuffix: string,
): PanelPlot | undefined {
  doc.roundedRect(x, startY, w, h, 3).fill(COLORS.panelBg);
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(titleColor)
    .text(title, x + 8, startY + 6, { width: w - 16, align: "left" });
  if (!points.length) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.panelText)
      .text("Sin datos suficientes para graficar la línea de tiempo.", x, startY + h / 2 - 4, {
        width: w,
        align: "center",
      });
    return undefined;
  }

  const axisLeft = x + 42;
  const axisRight = x + w - 14;
  const axisTop = startY + 18;
  const axisBottom = startY + h - 28;
  const plotW = axisRight - axisLeft;
  const plotH = axisBottom - axisTop;
  // A single bucket would divide by zero below; pin it to the plot's left edge.
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
  const atX = (index: number): number => axisLeft + stepX * index;

  const tickCount = yTicks.length - 1;
  yTicks.forEach((value, i) => {
    const yy = axisBottom - (plotH * i) / tickCount;
    doc.moveTo(axisLeft, yy).lineTo(axisRight, yy).strokeColor(COLORS.panelGrid).lineWidth(0.5).stroke();
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.panelText)
      .text(`${fmtNum(value)}${unitSuffix}`, x, yy - 3, { width: axisLeft - x - 5, align: "right" });
  });

  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  for (const i of labelIndexes) {
    const p = points[i];
    if (!p) continue;
    const px = atX(i);
    doc.moveTo(px, axisBottom).lineTo(px, axisBottom + 3).strokeColor(COLORS.panelGrid).lineWidth(0.5).stroke();
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.panelText)
      .text(`${p.tSeconds}s`, px - 16, axisBottom + 6, { width: 32, align: "center" });
  }

  return { axisLeft, axisRight, axisTop, axisBottom, plotW, plotH, atX };
}

/** Fills the region between a series and the panel floor with a vertical gradient. */
function fillUnderSeries(doc: Doc, plot: PanelPlot, pts: { x: number; y: number }[], color: string): void {
  const first = pts[0];
  const last = pts.at(-1);
  if (!first || !last || pts.length < 2) return;
  doc.save();
  doc.moveTo(first.x, plot.axisBottom).lineTo(first.x, first.y);
  seriesPath(doc, pts);
  doc.lineTo(last.x, plot.axisBottom).closePath().clip();
  const gradient = doc.linearGradient(plot.axisLeft, plot.axisTop, plot.axisLeft, plot.axisBottom);
  gradient.stop(0, color, 0.45).stop(1, color, 0.02);
  doc.rect(plot.axisLeft, plot.axisTop, plot.plotW, plot.plotH).fill(gradient);
  doc.restore();
}

const PERCENTILE_COLORS = {
  medianMs: COLORS.panelText,
  p90Ms: COLORS.percentileP90,
  p95Ms: COLORS.percentileP95,
  p99Ms: COLORS.seriesRed,
} as const;

/**
 * Grafana-style panel of average response time over the run (green gradient
 * area), with the run's median/p90/p95/p99 drawn as labelled reference lines
 * and intervals containing failures marked in red. Returns the y position right
 * after the chart.
 */
export function responseTimeChart(
  doc: Doc,
  x: number,
  startY: number,
  w: number,
  h: number,
  points: ChartPoint[],
  markers: PercentileMarkers = {},
): number {
  const markerEntries = (Object.keys(PERCENTILE_COLORS) as (keyof typeof PERCENTILE_COLORS)[])
    .map((key) => ({ key, value: markers[key] }))
    .filter((entry): entry is { key: keyof typeof PERCENTILE_COLORS; value: number } =>
      typeof entry.value === "number" && entry.value > 0,
    );
  // The percentile lines must stay inside the plot, so they raise the y scale.
  const peak = Math.max(
    ...points.map((p) => p.avgMs),
    ...markerEntries.map((entry) => entry.value),
    0,
  );
  const yTicks = niceTicks(peak);
  const plot = panelFrame(
    doc,
    x,
    startY,
    w,
    h,
    "TIEMPO DE RESPUESTA (MS)",
    COLORS.seriesGreen,
    points,
    yTicks,
    "",
  );
  if (!plot) return startY + h;
  const maxY = yTicks.at(-1) ?? 1;
  const atY = (value: number): number => plot.axisBottom - (value / maxY) * plot.plotH;

  const series = points.map((p, i) => ({ x: plot.atX(i), y: atY(p.avgMs) }));
  fillUnderSeries(doc, plot, series, COLORS.seriesGreen);

  markerEntries.forEach(({ key, value }, i) => {
    const yy = atY(value);
    const color = PERCENTILE_COLORS[key];
    doc
      .moveTo(plot.axisLeft, yy)
      .lineTo(plot.axisRight, yy)
      .strokeColor(color)
      .lineWidth(0.8)
      .dash(2, { space: 2 })
      .stroke()
      .undash();
    const label = `${PERCENTILE_LABELS[key]} ${fmtNum(Math.round(value))} ms`;
    doc.font("Helvetica-Bold").fontSize(6);
    const labelW = doc.widthOfString(label) + 6;
    // Percentiles cluster together on the y axis, so their labels are spread
    // along x instead of stacking on top of each other at the plot's edge.
    const lane = markerEntries.length > 1 ? i / (markerEntries.length - 1) : 0;
    const labelX = plot.axisLeft + 4 + lane * (plot.plotW - labelW - 8);
    doc.rect(labelX, yy - 7.5, labelW, 8).fillOpacity(0.85).fill(COLORS.panelBg).fillOpacity(1);
    doc.fillColor(color).text(label, labelX + 3, yy - 6);
  });

  doc.strokeColor(COLORS.seriesGreen).lineWidth(1.6);
  seriesPath(doc, series);
  doc.stroke();

  points.forEach((p, i) => {
    const point = series[i];
    if (!point) return;
    const failing = (p.errorCount ?? 0) > 0;
    doc.circle(point.x, point.y, failing ? 3 : 2).fill(failing ? COLORS.seriesRed : COLORS.seriesGreen);
  });

  const legendY = startY + h - 14;
  let legendX = legendItem(doc, x + 10, legendY, COLORS.seriesGreen, "Promedio por intervalo");
  for (const { key } of markerEntries)
    legendX = legendItem(doc, legendX, legendY, PERCENTILE_COLORS[key], PERCENTILE_LABELS[key]);
  if (points.some((p) => (p.errorCount ?? 0) > 0))
    legendItem(doc, legendX, legendY, COLORS.seriesRed, "Con errores");

  return startY + h;
}

const PERCENTILE_LABELS = {
  medianMs: "Mediana",
  p90Ms: "p90",
  p95Ms: "p95",
  p99Ms: "p99",
} as const;

/**
 * Grafana-style panel of throughput over the run, drawn as bars stacked into
 * successful (blue) and failed (red) transactions per second, with the run's
 * average marked. Returns the y position right after the chart.
 */
export function throughputChart(
  doc: Doc,
  x: number,
  startY: number,
  w: number,
  h: number,
  points: ChartPoint[],
): number {
  const rates = points.map((p) => {
    const perSecond = Math.max(1, p.bucketSeconds ?? 1);
    const errors = Math.min(p.count, p.errorCount ?? 0);
    return { ok: (p.count - errors) / perSecond, failed: errors / perSecond };
  });
  const yTicks = niceTicks(Math.max(...rates.map((r) => r.ok + r.failed), 0));
  const plot = panelFrame(
    doc,
    x,
    startY,
    w,
    h,
    "TRANSACCIONES POR SEGUNDO",
    COLORS.seriesBlue,
    points,
    yTicks,
    "",
  );
  if (!plot) return startY + h;
  const maxY = yTicks.at(-1) ?? 1;
  const scale = (value: number): number => (value / maxY) * plot.plotH;

  const slot = plot.plotW / Math.max(1, points.length);
  const barW = Math.max(1.5, Math.min(18, slot * 0.6));
  rates.forEach((rate, i) => {
    const left = plot.atX(i) - barW / 2;
    const okH = scale(rate.ok);
    const failedH = scale(rate.failed);
    doc.fillOpacity(0.85);
    if (okH > 0) doc.rect(left, plot.axisBottom - okH, barW, okH).fill(COLORS.seriesBlue);
    if (failedH > 0)
      doc.rect(left, plot.axisBottom - okH - failedH, barW, failedH).fill(COLORS.seriesRed);
    doc.fillOpacity(1);
  });

  const totalOk = points.reduce((sum, p) => sum + (p.count - Math.min(p.count, p.errorCount ?? 0)), 0);
  const totalFailed = points.reduce((sum, p) => sum + Math.min(p.count, p.errorCount ?? 0), 0);
  const avgTps =
    rates.reduce((sum, rate) => sum + rate.ok + rate.failed, 0) / Math.max(1, rates.length);
  const avgY = plot.axisBottom - scale(avgTps);
  doc
    .moveTo(plot.axisLeft, avgY)
    .lineTo(plot.axisRight, avgY)
    .strokeColor(COLORS.percentileP95)
    .lineWidth(0.8)
    .dash(2, { space: 2 })
    .stroke()
    .undash();

  const legendY = startY + h - 14;
  let legendX = legendItem(doc, x + 10, legendY, COLORS.seriesBlue, `Correctas (${fmtNum(totalOk)})`);
  legendX = legendItem(doc, legendX, legendY, COLORS.seriesRed, `Con error (${fmtNum(totalFailed)})`);
  legendItem(doc, legendX, legendY, COLORS.percentileP95, `Promedio ${avgTps.toFixed(2)} req/s`);

  return startY + h;
}

export function footers(doc: Doc, leftText: string): void {
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
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.navy).text(leftText, MARGIN, h - 28, {
      lineBreak: false,
    });
    doc
      .fillColor(COLORS.grayMid)
      .text(`Pág. ${i - range.start + 1}/${range.count}`, w - MARGIN - 100, h - 28, {
        width: 100,
        align: "right",
        lineBreak: false,
      });
    doc.page.margins.bottom = bottomMargin;
  }
}
