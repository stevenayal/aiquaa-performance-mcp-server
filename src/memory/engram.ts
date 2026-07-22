import { run } from "../codegraph/client.js";

export async function searchMemory(projectId: string, query: string): Promise<string> {
  const project =
    `${process.env.ENGRAM_PROJECT_PREFIX?.trim() || "aiquaa-"}${projectId}`.toLowerCase();
  return run(
    process.env.ENGRAM_BIN?.trim() || "engram",
    ["search", query, "--project", project, "--scope", "project", "--limit", "10"],
    process.cwd(),
    15_000,
  );
}
