import path from "node:path";
import { mkdir } from "node:fs/promises";
import { run } from "../../codegraph/client.js";
import { safeRelativePath } from "../../security/policy.js";

export async function runJMeter(
  planPath: string,
  outputPath: string,
  properties: Record<string, string>,
  timeoutMs: number,
): Promise<string> {
  const plan = path.resolve(planPath);
  const output = path.resolve(safeRelativePath(outputPath));
  await mkdir(path.dirname(output), { recursive: true });
  const executable = process.env.JMETER_HOME
    ? path.join(
        process.env.JMETER_HOME,
        "bin",
        process.platform === "win32" ? "jmeter.bat" : "jmeter",
      )
    : "jmeter";
  const args = [
    "-n",
    "-t",
    plan,
    "-l",
    output,
    ...Object.entries(properties).flatMap(([key, value]) => [`-J${key}=${value}`]),
  ];
  return run(executable, args, process.cwd(), timeoutMs);
}
