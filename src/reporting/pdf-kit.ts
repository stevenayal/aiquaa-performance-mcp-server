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
}

/**
 * Transactions/interval (bars, left axis) + average response time (line, right
 * axis) over the run's duration. Returns the y position right after the chart.
 */
export function timeSeriesChart(
  doc: Doc,
  x: number,
  startY: number,
  w: number,
  h: number,
  points: ChartPoint[],
): number {
  if (!points.length) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.grayMid)
      .text("Sin datos suficientes para graficar la línea de tiempo.", x, startY + h / 2 - 4, {
        width: w,
        align: "center",
      });
    return startY + h;
  }

  const axisLeft = x + 28;
  const axisRight = x + w - 28;
  const axisTop = startY + 4;
  const axisBottom = startY + h - 22;
  const plotW = axisRight - axisLeft;
  const plotH = axisBottom - axisTop;
  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const maxMs = Math.max(1, ...points.map((p) => p.avgMs));
  const slot = plotW / points.length;
  const barW = Math.min(18, slot * 0.5);

  doc.rect(axisLeft, axisTop, plotW, plotH).strokeColor(COLORS.grayBorder).lineWidth(0.5).stroke();

  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const yy = axisBottom - (plotH * i) / ticks;
    if (i > 0)
      doc.moveTo(axisLeft, yy).lineTo(axisRight, yy).strokeColor(COLORS.grayLight).lineWidth(0.5).stroke();
    doc
      .font("Helvetica")
      .fontSize(6)
      .fillColor(COLORS.grayMid)
      .text(String(Math.round((maxCount * i) / ticks)), x, yy - 3, {
        width: axisLeft - x - 3,
        align: "right",
      });
    doc.text(String(Math.round((maxMs * i) / ticks)), axisRight + 3, yy - 3, {
      width: x + w - axisRight - 3,
      align: "left",
    });
  }

  points.forEach((p, i) => {
    const barH = (p.count / maxCount) * plotH;
    const cx = axisLeft + slot * i + slot / 2;
    doc.rect(cx - barW / 2, axisBottom - barH, barW, Math.max(0.5, barH)).fill(COLORS.chartBar);
  });

  doc.strokeColor(COLORS.amberWarn).lineWidth(1.5);
  points.forEach((p, i) => {
    const px = axisLeft + slot * i + slot / 2;
    const py = axisBottom - (p.avgMs / maxMs) * plotH;
    if (i === 0) doc.moveTo(px, py);
    else doc.lineTo(px, py);
  });
  doc.stroke();
  points.forEach((p, i) => {
    const px = axisLeft + slot * i + slot / 2;
    const py = axisBottom - (p.avgMs / maxMs) * plotH;
    doc.circle(px, py, 1.8).fill(COLORS.amberWarn);
  });

  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  for (const i of labelIndexes) {
    const p = points[i];
    if (!p) continue;
    const px = axisLeft + slot * i + slot / 2;
    doc
      .font("Helvetica")
      .fontSize(6)
      .fillColor(COLORS.grayMid)
      .text(`${p.tSeconds}s`, px - 14, axisBottom + 4, { width: 28, align: "center" });
  }

  const legendY = startY + h - 10;
  doc.rect(x, legendY, 7, 7).fill(COLORS.chartBar);
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.grayMid)
    .text("Transacciones / intervalo", x + 11, legendY - 1);
  doc.rect(x + 155, legendY, 7, 7).fill(COLORS.amberWarn);
  doc.text("Tiempo de respuesta promedio (ms)", x + 166, legendY - 1);

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
