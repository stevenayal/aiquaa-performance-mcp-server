import path from "node:path";
import { spawn } from "node:child_process";

export function allowedRoots(): string[] {
  return (process.env.CODEGRAPH_ALLOWED_ROOTS ?? "")
    .split(path.delimiter)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => path.resolve(v));
}
export function resolveAllowedProjectPath(projectPath: string): string {
  const roots = allowedRoots();
  if (roots.length === 0)
    throw new Error("Configure CODEGRAPH_ALLOWED_ROOTS para analizar repositorios locales.");
  const resolved = path.resolve(projectPath);
  if (
    !roots.some((root) => {
      const rel = path.relative(root, resolved);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    })
  )
    throw new Error("Ruta fuera de CODEGRAPH_ALLOWED_ROOTS.");
  return resolved;
}
export async function codeGraphContext(projectPath: string, task: string): Promise<string> {
  const cwd = resolveAllowedProjectPath(projectPath);
  return run(
    process.env.CODEGRAPH_BIN?.trim() || "codegraph",
    ["context", task, "--path", cwd, "--format", "markdown"],
    cwd,
    45_000,
  );
}
export function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Proceso cancelado tras ${timeoutMs}ms.`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Proceso terminó con ${String(code)}.`));
    });
  });
}
