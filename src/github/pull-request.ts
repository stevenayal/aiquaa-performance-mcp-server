import { Octokit } from "@octokit/rest";
import { safeRelativePath, redactSecrets } from "../security/policy.js";
import type { GeneratedFile } from "../types.js";

export interface PullRequestPlan {
  branch: string;
  title: string;
  draft: true;
  files: GeneratedFile[];
  body: string;
  commands: string[];
}
const branchSlug = (v: string): string =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "coverage";
export function planPullRequest(
  requirementOrFlow: string,
  titleFlow: string,
  files: Array<{ path: string; content: string }>,
  body: string,
): PullRequestPlan {
  const branch = `test/performance/${branchSlug(requirementOrFlow)}`;
  return {
    branch,
    title: `test(perf): add load coverage for ${titleFlow}`,
    draft: true,
    files: files.map((file) => ({
      path: safeRelativePath(file.path).replaceAll("\\", "/"),
      content: redactSecrets(file.content),
      encoding: "utf8",
    })),
    body: redactSecrets(body),
    commands: [
      `git switch -c ${branch}`,
      "git add tests/performance .github/workflows azure-pipelines",
      `git commit -m "test(perf): add load coverage for ${titleFlow}"`,
    ],
  };
}
export async function createDraftPullRequest(
  owner: string,
  repo: string,
  base: string,
  plan: PullRequestPlan,
): Promise<{ url: string; number: number; branch: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Falta GITHUB_TOKEN.");
  const octokit = new Octokit({
    auth: token,
    ...(process.env.GITHUB_API_URL ? { baseUrl: process.env.GITHUB_API_URL } : {}),
  });
  const baseRef = await octokit.git.getRef({ owner, repo, ref: `heads/${base}` });
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${plan.branch}`,
    sha: baseRef.data.object.sha,
  });
  for (const file of plan.files)
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: file.path,
      branch: plan.branch,
      message: `test(perf): add ${file.path}`,
      content: Buffer.from(file.content).toString("base64"),
    });
  const pull = await octokit.pulls.create({
    owner,
    repo,
    base,
    head: plan.branch,
    title: plan.title,
    body: plan.body,
    draft: true,
  });
  return { url: pull.data.html_url, number: pull.data.number, branch: plan.branch };
}
