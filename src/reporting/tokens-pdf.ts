import type { TokenLedger } from "../telemetry/tokens.js";
import {
  COLORS,
  MARGIN,
  dataTable,
  footers,
  formatDateTime,
  hr,
  newDocument,
  pageContentWidth,
  statBand,
  subtitle,
  title,
} from "./pdf-kit.js";

export async function buildTokenReportPdf(ledger: TokenLedger): Promise<Buffer> {
  const { doc, done } = newDocument();
  const w = pageContentWidth(doc);
  let y = MARGIN;

  y = title(doc, "Informe de Consumo de Tokens (MCP)", y);
  y = subtitle(
    doc,
    `aiquaa-performance-mcp-server · sesión iniciada ${formatDateTime(new Date(ledger.startedAt))}`,
    y,
  );
  y = hr(doc, y, w);

  const tools = Object.values(ledger.perTool).sort(
    (a, b) =>
      b.inputTokensEstimate + b.outputTokensEstimate - (a.inputTokensEstimate + a.outputTokensEstimate),
  );
  const totalCalls = tools.reduce((sum, t) => sum + t.calls, 0);
  const totalIn = tools.reduce((sum, t) => sum + t.inputTokensEstimate, 0);
  const totalOut = tools.reduce((sum, t) => sum + t.outputTokensEstimate, 0);

  y = statBand(doc, MARGIN, y, w, 50, [
    { value: String(totalCalls), label: "Llamadas a tools" },
    { value: totalIn.toLocaleString("es-AR"), label: "Tokens input (est.)" },
    { value: totalOut.toLocaleString("es-AR"), label: "Tokens output (est.)" },
    { value: (totalIn + totalOut).toLocaleString("es-AR"), label: "Total estimado" },
  ]);
  y += 14;

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.grayMid)
    .text(
      "Estimación por heurística caracteres/4 sobre el JSON de entrada y el contenido de la " +
        "respuesta de cada tool MCP (perf_*). No reemplaza el conteo real del tokenizer del " +
        "cliente que invoca este servidor.",
      MARGIN,
      y,
      { width: w },
    );
  y += 32;

  if (tools.length) {
    y = dataTable(
      doc,
      MARGIN,
      y,
      w,
      [
        { header: "Tool", weight: 0.34 },
        { header: "Llamadas", weight: 0.14, align: "center" },
        { header: "Tokens in", weight: 0.17, align: "center" },
        { header: "Tokens out", weight: 0.17, align: "center" },
        { header: "Total", weight: 0.18, align: "center" },
      ],
      tools.map((t) => [
        t.tool,
        String(t.calls),
        t.inputTokensEstimate.toLocaleString("es-AR"),
        t.outputTokensEstimate.toLocaleString("es-AR"),
        (t.inputTokensEstimate + t.outputTokensEstimate).toLocaleString("es-AR"),
      ]),
    );
  } else {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.grayMid)
      .text("Todavía no se registraron llamadas a tools en esta sesión del servidor.", MARGIN, y, {
        width: w,
      });
    y += 16;
  }

  footers(doc, "aiquaa-performance-mcp-server");
  doc.end();
  return done;
}
