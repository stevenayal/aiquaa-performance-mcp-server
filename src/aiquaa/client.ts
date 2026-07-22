import { AIQUAA_ENDPOINTS } from "../constants.js";

export class AiquaaClient {
  private readonly baseUrl: string;
  private readonly token: string;
  constructor(token?: string) {
    this.baseUrl = (process.env.AIQUAA_API_BASE_URL ?? "").replace(/\/$/, "");
    this.token = token ?? process.env.AIQUAA_ACCESS_TOKEN ?? "";
    if (!this.baseUrl || !this.token)
      throw new Error("Configure AIQUAA_API_BASE_URL y AIQUAA_ACCESS_TOKEN.");
  }
  getRequirement(projectId: string, requirementId: string): Promise<unknown> {
    return this.request("GET", AIQUAA_ENDPOINTS.requirement(projectId, requirementId));
  }
  savePlan(projectId: string, value: unknown): Promise<unknown> {
    return this.request("POST", AIQUAA_ENDPOINTS.performancePlans(projectId), value);
  }
  saveExecution(projectId: string, value: unknown): Promise<unknown> {
    return this.request("POST", AIQUAA_ENDPOINTS.executions(projectId), value);
  }
  linkPullRequest(projectId: string, value: unknown): Promise<unknown> {
    return this.request("POST", AIQUAA_ENDPOINTS.pullRequest(projectId), value);
  }
  private async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`AIQUAA respondió ${response.status}.`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
