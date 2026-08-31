#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createPerformanceMcpServer } from "./app.js";
import { DEFAULT_MCP_PATH, DEFAULT_PORT, SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { analyzeJtl, buildTimeline } from "./results/jtl.js";
import { compareJtl } from "./comparison/compare.js";
import { buildPdfReport } from "./reporting/pdf.js";
import type { ThresholdDefinition } from "./types.js";

if (process.argv[2] === "--evaluate") {
  await evaluateCli(process.argv[3], process.argv[4]);
} else if (process.argv[2] === "--report") {
  await reportCli(process.argv.slice(3));
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
async function loadThresholds(thresholdsPath: string): Promise<ThresholdDefinition[]> {
  const raw = await readFile(thresholdsPath, "utf8");
  const parsed = JSON.parse(raw) as {
    global?: Record<string, number>;
    operations?: Record<string, Record<string, number>>;
  };
  return [
    { scope: "global", ...(parsed.global ?? {}) },
    ...Object.entries(parsed.operations ?? {}).map(([scope, value]) => ({ scope, ...value })),
  ];
}
async function evaluateCli(jtlPath?: string, thresholdsPath?: string): Promise<void> {
  if (!jtlPath || !thresholdsPath)
    throw new Error("Uso: --evaluate <results.jtl> <thresholds.json>");
  const [jtl, thresholds] = await Promise.all([
    readFile(jtlPath, "utf8"),
    loadThresholds(thresholdsPath),
  ]);
  const report = analyzeJtl(jtl, thresholds);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.verdict === "FAIL") process.exitCode = 1;
}
function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (key?.startsWith("--") && value !== undefined) flags[key.slice(2)] = value;
  }
  return flags;
}
async function reportCli(args: string[]): Promise<void> {
  const [jtlPath, thresholdsPath, outputPath, ...rest] = args;
  if (!jtlPath || !thresholdsPath || !outputPath)
    throw new Error(
      "Uso: --report <results.jtl> <thresholds.json> <output.pdf> " +
        "[--api-name X] [--test-type Y] [--threads N] [--loops N] " +
        "[--baseline baseline.jtl] [--api-version V] [--repo-url URL] [--author A]",
    );
  const flags = parseFlags(rest);
  const [jtl, thresholds] = await Promise.all([
    readFile(jtlPath, "utf8"),
    loadThresholds(thresholdsPath),
  ]);
  const baselineJtl = flags.baseline ? await readFile(flags.baseline, "utf8") : undefined;
  const summary = analyzeJtl(jtl, thresholds);
  const comparison = baselineJtl
    ? compareJtl(baselineJtl, jtl, thresholds, {}, {}, 10)
    : undefined;
  const timeline = buildTimeline(jtl);
  const pdf = await buildPdfReport({
    summary,
    comparison,
    timeline,
    thresholds,
    apiName: flags["api-name"] ?? "API",
    testType: flags["test-type"],
    threads: flags.threads === undefined ? undefined : Number(flags.threads),
    loops: flags.loops === undefined ? undefined : Number(flags.loops),
    apiVersion: flags["api-version"],
    repoUrl: flags["repo-url"],
    author: flags.author,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, pdf);
  process.stdout.write(`Informe: ${outputPath}\nVeredicto: ${summary.verdict}\n`);
  if (summary.verdict === "FAIL") process.exitCode = 1;
}
function parsePort(value?: string): number {
  const port = Number(value ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT inválido.");
  return port;
}
function normalizePath(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}
