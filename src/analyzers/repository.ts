import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { PerformanceAnalysis } from "../types.js";
import { resolveAllowedProjectPath } from "../codegraph/client.js";

const interesting =
  /(?:\.jmx|\.jtl|\.csv|openapi|swagger|pipeline|workflow|package\.json|pom\.xml|build\.gradle|\.ya?ml)$/i;
export async function analyzeRepository(projectPath: string): Promise<PerformanceAnalysis> {
  const root = resolveAllowedProjectPath(projectPath);
  const files = await walk(root, 5, 2_000);
  const relative = files.map((f) => path.relative(root, f).replaceAll("\\", "/"));
  const textFiles = files.filter((f) => interesting.test(f)).slice(0, 200);
  const contents = await Promise.all(
    textFiles.map(async (file) => ({ file, text: await readFile(file, "utf8").catch(() => "") })),
  );
  const combined = contents.map((v) => v.text).join("\n");
  const endpoints = [
    ...new Set(
      [...combined.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+([/][A-Za-z0-9_{}:./-]+)/g)].map(
        (m) => `${m[1]} ${m[2]}`,
      ),
    ),
  ];
  const frameworks = ["express", "fastify", "nestjs", "spring-boot", "aspnet", "django"].filter(
    (name) => combined.toLowerCase().includes(name),
  );
  return {
    observed: [
      ...frameworks.map((f) => `Framework/dependencia detectada: ${f}`),
      `${files.length} archivos inspeccionados.`,
    ],
    declared: [],
    estimated: [],
    unknown: ["Capacidad real de la infraestructura", "Comportamiento del ambiente bajo carga"],
    endpoints,
    criticalFlows: [],
    risks: detectRisks(combined),
    authentication: ["bearer", "oauth", "api-key", "basic"].filter((v) =>
      combined.toLowerCase().includes(v),
    ),
    requiredData: [
      ...new Set([...combined.matchAll(/\$\{([A-Za-z][\w]*)\}/g)].map((m) => m[1] ?? "")),
    ].filter(Boolean),
    existingPlans: relative.filter((f) => f.endsWith(".jmx")),
    existingThresholds: relative.filter((f) => /threshold/i.test(f)),
    existingCi: relative.filter((f) => /(?:\.github\/workflows|azure-pipelines)/.test(f)),
    confidence: files.length > 0 ? "medium" : "low",
  };
}
async function walk(root: string, depth: number, maxFiles: number): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string, level: number): Promise<void> {
    if (level > depth || out.length >= maxFiles) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        out.length >= maxFiles ||
        [".git", "node_modules", "dist", "coverage"].includes(entry.name)
      )
        continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full, level + 1);
      else out.push(full);
    }
  }
  await visit(root, 0);
  return out;
}
function detectRisks(text: string): string[] {
  const lower = text.toLowerCase();
  const risks: string[] = [];
  if (lower.includes("rate limit"))
    risks.push("Rate limiting detectado; coordinar límites de la prueba.");
  if (lower.includes("retry")) risks.push("Retries pueden amplificar carga y ocultar errores.");
  if (lower.includes("circuit breaker"))
    risks.push("Circuit breaker puede cambiar el perfil de errores.");
  if (lower.includes("queue"))
    risks.push("Operaciones asíncronas requieren métricas adicionales de cola.");
  return risks;
}
