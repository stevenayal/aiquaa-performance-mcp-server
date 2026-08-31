import path from "node:path";
import type { LoadModel } from "../types.js";

export interface SafetyDecision {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
}
const list = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
export function redactSecrets(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/((?:password|token|api[_-]?key|secret)\s*[:=]\s*)[^\s,;"']+/gi, "$1[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_GITHUB_TOKEN]");
}
export function safeRelativePath(input: string): string {
  if (path.isAbsolute(input) || input.includes("\0"))
    throw new Error("La ruta debe ser relativa y no contener NUL.");
  const normalized = path.normalize(input);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`))
    throw new Error("Path traversal bloqueado.");
  return normalized;
}
const PRIVATE_HOST_PATTERN =
  /^(localhost|127(\.\d+){3}|0\.0\.0\.0|::1|10(\.\d+){3}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|192\.168(\.\d+){2}|169\.254(\.\d+){2})$/i;
export function evaluateMonitoringTarget(dashboardUrl: string): SafetyDecision {
  let url: URL;
  try {
    url = new URL(dashboardUrl);
  } catch {
    return { allowed: false, reasons: ["dashboard_url inválida."], warnings: [] };
  }
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (url.protocol !== "http:" && url.protocol !== "https:")
    reasons.push(`Protocolo ${url.protocol} no permitido; use http o https.`);
  const host = url.hostname.toLowerCase();
  const allowedPrivateHosts = list(process.env.PERF_MONITORING_ALLOWED_PRIVATE_HOSTS);
  if (PRIVATE_HOST_PATTERN.test(host) && !allowedPrivateHosts.includes(host))
    reasons.push(
      `El host ${host} es privado/loopback; agréguelo a PERF_MONITORING_ALLOWED_PRIVATE_HOSTS si es intencional.`,
    );
  if (url.protocol !== "https:") warnings.push("El dashboard no usa HTTPS.");
  return { allowed: reasons.length === 0, reasons, warnings };
}
export function evaluateExecution(
  targetUrl: string,
  model: LoadModel,
  options: { authorized: boolean; destructive: boolean; aggressiveConfirmed: boolean },
): SafetyDecision {
  const url = new URL(targetUrl);
  const host = url.hostname.toLowerCase();
  const allowedHosts = list(process.env.PERF_ALLOWED_HOSTS);
  const productionHosts = list(process.env.PERF_PRODUCTION_HOSTS);
  const maxThreads = Number(process.env.PERF_MAX_THREADS ?? 100);
  const maxDuration = Number(process.env.PERF_MAX_DURATION_SECONDS ?? 3600);
  const maxRate = Number(process.env.PERF_MAX_ARRIVAL_RATE ?? 100);
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (process.env.PERF_ALLOW_EXECUTION !== "true")
    reasons.push("PERF_ALLOW_EXECUTION no está habilitado.");
  if (!options.authorized) reasons.push("Falta autorización explícita para ejecutar.");
  if (allowedHosts.length === 0 || !allowedHosts.includes(host))
    reasons.push(`El host ${host} no está en PERF_ALLOWED_HOSTS.`);
  if (productionHosts.includes(host) && !options.aggressiveConfirmed)
    reasons.push("Producción requiere confirmación explícita adicional.");
  if (options.destructive && !options.aggressiveConfirmed)
    reasons.push("La prueba destructiva no fue confirmada.");
  if ((model.threads ?? 0) > maxThreads)
    reasons.push(`Threads superiores al límite ${maxThreads}.`);
  if ((model.durationSeconds ?? 0) > maxDuration)
    reasons.push(`Duración superior al límite ${maxDuration}s.`);
  if ((model.arrivalRate ?? 0) > maxRate)
    reasons.push(`Arrival rate superior al límite ${maxRate}.`);
  if (model.aggressive && !options.aggressiveConfirmed)
    reasons.push("La carga agresiva requiere confirmación específica.");
  if (url.protocol !== "https:" && host !== "localhost" && host !== "127.0.0.1")
    warnings.push("El target no usa HTTPS.");
  return { allowed: reasons.length === 0, reasons, warnings };
}
