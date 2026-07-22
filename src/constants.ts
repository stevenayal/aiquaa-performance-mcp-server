export const SERVER_NAME = "aiquaa-performance";
export const SERVER_VERSION = "0.1.0";
export const DEFAULT_PORT = 3000;
export const DEFAULT_MCP_PATH = "/mcp";
export const JMETER_VERSION = "5.6.3";

export const AIQUAA_ENDPOINTS = {
  requirement: (projectId: string, requirementId: string) =>
    `/projects/${encodeURIComponent(projectId)}/requirements/${encodeURIComponent(requirementId)}`,
  performancePlans: (projectId: string) =>
    `/projects/${encodeURIComponent(projectId)}/performance-plans`,
  executions: (projectId: string) =>
    `/projects/${encodeURIComponent(projectId)}/performance-executions`,
  pullRequest: (projectId: string) =>
    `/projects/${encodeURIComponent(projectId)}/performance-pull-requests`,
} as const;
