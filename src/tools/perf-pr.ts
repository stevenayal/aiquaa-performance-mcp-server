import type { z } from "zod";
import { PullRequestInputSchema } from "../schemas/tools.js";
import { createDraftPullRequest, planPullRequest } from "../github/pull-request.js";
export async function perfPr(input: z.infer<typeof PullRequestInputSchema>) {
  const plan = planPullRequest(
    input.requirement_or_flow,
    input.title_flow,
    input.files,
    input.body,
  );
  return input.dry_run
    ? { created: false, dryRun: true, plan }
    : {
        created: true,
        dryRun: false,
        plan,
        pullRequest: await createDraftPullRequest(input.owner, input.repo, input.base, plan),
      };
}
