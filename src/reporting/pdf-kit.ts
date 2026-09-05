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

/**
 * Grafana-style dark panel plotting average response time (green area, left
 * axis) and throughput (blue line, right axis) over the run, with failing
 * intervals marked in red. Returns the y position right after the chart.
 */
export function timeSeriesChart(
  doc: Doc,
  x: number,
  startY: number,
  w: number,
  h: number,
  points: ChartPoint[],
): number {
  doc.roundedRect(x, startY, w, h, 3).fill(COLORS.panelBg);
  if (!points.length) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.panelText)
      .text("Sin datos suficientes para graficar la línea de tiempo.", x, startY + h / 2 - 4, {
        width: w,
        align: "center",
      });
    return startY + h;
  }

  const axisLeft = x + 38;
  const axisRight = x + w - 38;
  const axisTop = startY + 16;
  const axisBottom = startY + h - 30;
  const plotW = axisRight - axisLeft;
  const plotH = axisBottom - axisTop;
  const msTicks = niceTicks(Math.max(...points.map((p) => p.avgMs)));
  const countTicks = niceTicks(Math.max(...points.map((p) => p.count)));
  const maxMs = msTicks.at(-1) ?? 1;
  const maxCount = countTicks.at(-1) ?? 1;
  // Single points would divide by zero below; pin them to the plot's left edge.
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
  const atX = (i: number): number => axisLeft + stepX * i;

  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(COLORS.seriesGreen)
    .text("TIEMPO DE RESPUESTA (MS)", x + 8, startY + 6, { width: plotW / 2, align: "left" });
  doc
    .fillColor(COLORS.seriesBlue)
    .text("TRANSACCIONES", x, startY + 6, { width: w - 8, align: "right" });

  const tickCount = Math.max(msTicks.length, countTicks.length) - 1;
  for (let i = 0; i <= tickCount; i += 1) {
    const yy = axisBottom - (plotH * i) / tickCount;
    doc.moveTo(axisLeft, yy).lineTo(axisRight, yy).strokeColor(COLORS.panelGrid).lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.panelText);
    const msValue = msTicks[i];
    if (msValue !== undefined)
      doc.text(fmtNum(msValue), x, yy - 3, { width: axisLeft - x - 5, align: "right" });
    const countValue = countTicks[i];
    if (countValue !== undefined)
      doc.text(fmtNum(countValue), axisRight + 5, yy - 3, {
        width: x + w - axisRight - 7,
        align: "left",
      });
  }

  const msPoints = points.map((p, i) => ({
    x: atX(i),
    y: axisBottom - (p.avgMs / maxMs) * plotH,
  }));
  const countPoints = points.map((p, i) => ({
    x: atX(i),
    y: axisBottom - (p.count / maxCount) * plotH,
  }));

  const first = msPoints[0];
  const last = msPoints.at(-1);
  if (first && last && msPoints.length > 1) {
    doc.save();
    doc.moveTo(first.x, axisBottom).lineTo(first.x, first.y);
    seriesPath(doc, msPoints);
    doc.lineTo(last.x, axisBottom).closePath().clip();
    const gradient = doc.linearGradient(axisLeft, axisTop, axisLeft, axisBottom);
    gradient.stop(0, COLORS.seriesGreen, 0.45).stop(1, COLORS.seriesGreen, 0.02);
    doc.rect(axisLeft, axisTop, plotW, plotH).fill(gradient);
    doc.restore();
  }

  doc.strokeColor(COLORS.seriesBlue).lineWidth(1).dash(3, { space: 2 });
  seriesPath(doc, countPoints);
  doc.stroke().undash();

  doc.strokeColor(COLORS.seriesGreen).lineWidth(1.6);
  seriesPath(doc, msPoints);
  doc.stroke();

  points.forEach((p, i) => {
    const point = msPoints[i];
    if (!point) return;
    const failing = (p.errorCount ?? 0) > 0;
    doc.circle(point.x, point.y, failing ? 3 : 2).fill(failing ? COLORS.seriesRed : COLORS.seriesGreen);
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

  const legendY = startY + h - 15;
  let legendX = legendItem(doc, x + 10, legendY, COLORS.seriesGreen, "Tiempo de respuesta promedio (ms)");
  legendX = legendItem(doc, legendX, legendY, COLORS.seriesBlue, "Transacciones por intervalo");
  if (points.some((p) => (p.errorCount ?? 0) > 0))
    legendItem(doc, legendX, legendY, COLORS.seriesRed, "Intervalo con errores");

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
