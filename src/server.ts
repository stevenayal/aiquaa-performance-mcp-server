#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { readFile } from "node:fs/promises";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createPerformanceMcpServer } from "./app.js";
import { DEFAULT_MCP_PATH, DEFAULT_PORT, SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { analyzeJtl } from "./results/jtl.js";

if (process.argv[2] === "--evaluate") {
  await evaluateCli(process.argv[3], process.argv[4]);
} else {
  startServer();
}
function startServer(): void {
  const port = parsePort(process.env.PORT);
  const mcpPath = normalizePath(process.env.MCP_PATH ?? DEFAULT_MCP_PATH);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10mb" }));
  app.get("/health", (_request: Request, response: Response) =>
    response.json({
      status: "ok",
      name: SERVER_NAME,
      version: SERVER_VERSION,
      transport: "streamable-http",
      jmeter: process.env.JMETER_HOME ? "configured" : "not_configured",
    }),
  );
  app.post(mcpPath, async (request: Request, response: Response) => {
    const server = createPerformanceMcpServer();
    const transport = new StreamableHTTPServerTransport({});
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error: unknown) {
      if (!response.headersSent)
        response
          .status(500)
          .json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : "Internal server error",
            },
            id: null,
          });
    }
  });
  app.all(mcpPath, (_request, response) =>
    response
      .status(405)
      .set("Allow", "POST")
      .json({ error: "Use POST para Streamable HTTP sin estado." }),
  );
  app.listen(port, () =>
    process.stderr.write(
      `${SERVER_NAME} ${SERVER_VERSION} en http://localhost:${port}${mcpPath}\n`,
    ),
  );
}
async function evaluateCli(jtlPath?: string, thresholdsPath?: string): Promise<void> {
  if (!jtlPath || !thresholdsPath)
    throw new Error("Uso: --evaluate <results.jtl> <thresholds.json>");
  const [jtl, raw] = await Promise.all([
    readFile(jtlPath, "utf8"),
    readFile(thresholdsPath, "utf8"),
  ]);
  const parsed = JSON.parse(raw) as {
    global?: Record<string, number>;
    operations?: Record<string, Record<string, number>>;
  };
  const thresholds = [
    { scope: "global", ...(parsed.global ?? {}) },
    ...Object.entries(parsed.operations ?? {}).map(([scope, value]) => ({ scope, ...value })),
  ];
  const report = analyzeJtl(jtl, thresholds);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.verdict === "FAIL") process.exitCode = 1;
}
function parsePort(value?: string): number {
  const port = Number(value ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT inválido.");
  return port;
}
function normalizePath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}
