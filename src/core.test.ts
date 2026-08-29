import { describe, expect, it } from "vitest";
import { parseRequirement } from "./analyzers/requirement.js";
import { compareJtl } from "./comparison/compare.js";
import { generatePerformanceFiles } from "./jmeter/generator/index.js";
import { parseJmx } from "./jmeter/parser/index.js";
import { validateJmx } from "./jmeter/validator/index.js";
import { deriveLoadModel, presetModel } from "./load-model/presets.js";
import { analyzeJtl } from "./results/jtl.js";
import { evaluateExecution, redactSecrets, safeRelativePath } from "./security/policy.js";
import { planPullRequest } from "./github/pull-request.js";
import { RequirementSchema } from "./schemas/common.js";
import { evaluateThreshold } from "./thresholds/evaluate.js";
import { buildPdfReport } from "./reporting/pdf.js";

const jtl = (elapsed: number[]): string =>
  `timeStamp,elapsed,label,responseCode,responseMessage,success,bytes\n${elapsed.map((v, i) => `${1700000000000 + i * 1000},${v},GET users,200,OK,true,100`).join("\n")}\n`;
describe("requirements and load", () => {
  it("extracts declared NFR values", () => {
    const r = parseRequirement(
      "load de 150 usuarios durante 10 minutos, P95 menor a 2000 ms y error rate menor a 0,5%",
      "NFR-18",
      ["GET users"],
      "ticket",
    );
    expect(r.concurrentUsers).toBe(150);
    expect(r.durationSeconds).toBe(600);
    expect(r.responseTimeThresholds.p95Ms).toBe(2000);
    expect(r.maxErrorRate).toBe(0.5);
    expect(r.confidence).toBe("high");
    expect(deriveLoadModel(r).kind).toBe("closed");
  });
  it("uses open model for arrival rate", () => {
    const r = parseRequirement("load de 50 rps durante 60 segundos", "NFR", [], "ticket");
    expect(deriveLoadModel(r).kind).toBe("open");
  });
  it("marks aiquaa stress aggressive", () => {
    expect(presetModel("aiquaa_stress")).toMatchObject({
      threads: 1000,
      loops: 30,
      aggressive: true,
    });
  });
  it("validates requirement exclusivity", () => {
    expect(() =>
      RequirementSchema.parse({
        id: "x",
        operationIds: [],
        testType: "load",
        concurrentUsers: 2,
        arrivalRate: 2,
        responseTimeThresholds: {},
        source: { kind: "user", reference: "x" },
        confidence: "low",
      }),
    ).toThrow();
  });
});
describe("JMX generation and validation", () => {
  const options = {
    mode: "create" as const,
    apiName: "Users API",
    baseUrl: "https://example.test",
    endpoints: [{ name: "GET users", method: "GET", path: "/users", expectedStatus: 200 }],
    model: presetModel("smoke"),
    csvColumns: ["username", "password"],
    thresholds: [{ scope: "global", p95Ms: 1000 }],
  };
  it("generates valid plan and fictitious dataset", () => {
    const files = generatePerformanceFiles(options);
    const plan = files.find((f) => f.path.endsWith(".jmx"));
    expect(plan).toBeDefined();
    const inventory = parseJmx(plan?.content ?? "");
    expect(inventory.valid).toBe(true);
    expect(inventory.samplers).toContain("GET users");
    expect(files.find((f) => f.path.endsWith(".csv"))?.content).toContain("example-password");
  });
  it("generates an arrival-rate workload for open models", () => {
    const model = deriveLoadModel(
      parseRequirement("load de 25 rps durante 60 segundos", "NFR", [], "ticket"),
    );
    const plan = generatePerformanceFiles({ ...options, model })[0]?.content ?? "";
    const inventory = parseJmx(plan);
    expect(inventory.valid).toBe(true);
    expect(inventory.plugins).toContain(
      "com.blazemeter.jmeter.threads.arrival.ArrivalsThreadGroup",
    );
    expect(plan).toContain("${__P(arrivalRate,25)}");
  });
  it("extends locally without duplicate sampler", () => {
    const original = generatePerformanceFiles(options)[0]?.content ?? "";
    const files = generatePerformanceFiles({
      ...options,
      mode: "extend",
      existingJmx: original,
      endpoints: [
        ...options.endpoints,
        { name: "POST users", method: "POST", path: "/users", expectedStatus: 201 },
      ],
    });
    const inventory = parseJmx(files[0]?.content ?? "");
    expect(inventory.samplers.filter((v) => v === "GET users")).toHaveLength(1);
    expect(inventory.samplers).toContain("POST users");
  });
  it("blocks XXE and warns heavy listeners", () => {
    expect(parseJmx('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x/>').valid).toBe(
      false,
    );
    const report = validateJmx(
      `<jmeterTestPlan><hashTree><ThreadGroup testname="x"/><HTTPSamplerProxy testname="y"/><ResultCollector testname="View Results Tree"/></hashTree></jmeterTestPlan>`,
    );
    expect(report.warnings.join(" ")).toContain("pesado");
  });
});
describe("results and comparisons", () => {
  it("computes percentiles and PASS", () => {
    const result = analyzeJtl(jtl([100, 200, 300, 400]), [
      { scope: "global", p95Ms: 500, maxErrorRate: 1 },
    ]);
    expect(result.p95Ms).toBe(400);
    expect(result.samples).toBe(4);
    expect(result.verdict).toBe("PASS");
  });
  it("returns inconclusive without threshold", () =>
    expect(analyzeJtl(jtl([100])).verdict).toBe("INCONCLUSIVE"));
  it("detects degradation and non-comparable runs", () => {
    expect(compareJtl(jtl([100, 100]), jtl([200, 200]), [], {}, {}, 10).verdict).toBe(
      "degradation",
    );
    expect(
      compareJtl(jtl([100]), jtl([200]), [], { environment: "a" }, { environment: "b" }, 10)
        .verdict,
    ).toBe("not_comparable");
  });
  it("evaluates direct endpoint thresholds", () => {
    const metric = analyzeJtl(jtl([100, 200]), [{ scope: "global", p95Ms: 500 }]);
    expect(evaluateThreshold(metric, { scope: "global", p95Ms: 500 })).toBe("PASS");
    expect(evaluateThreshold(metric, { scope: "global", p95Ms: 50 })).toBe("FAIL");
    expect(evaluateThreshold(metric)).toBe("INCONCLUSIVE");
  });
});
describe("PDF reporting", () => {
  it("renders a valid PDF with cover, verdict and sampler detail", async () => {
    const summary = analyzeJtl(jtl([100, 200, 300, 400]), [
      { scope: "global", p95Ms: 500, maxErrorRate: 1 },
    ]);
    const pdf = await buildPdfReport({
      summary,
      thresholds: [{ scope: "global", p95Ms: 500, maxErrorRate: 1 }],
      apiName: "Demo API",
      testType: "smoke",
      threads: 1,
      loops: 1,
    });
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1000);
  });
  it("renders a baseline comparison table when provided", async () => {
    const candidateJtl = jtl([200, 200, 200, 200]);
    const summary = analyzeJtl(candidateJtl, [{ scope: "global", p95Ms: 500 }]);
    const comparison = compareJtl(jtl([100, 100, 100, 100]), candidateJtl, [], {}, {}, 10);
    const pdf = await buildPdfReport({
      summary,
      comparison,
      thresholds: [{ scope: "global", p95Ms: 500 }],
      apiName: "Demo API",
    });
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
describe("security and PR planning", () => {
  it("sanitizes paths and secrets", () => {
    expect(() => safeRelativePath("../secret")).toThrow();
    expect(redactSecrets("Authorization: Bearer abc token=xyz")).not.toContain("abc");
  });
  it("blocks execution by default", () => {
    const decision = evaluateExecution("https://example.test", presetModel("aiquaa_stress"), {
      authorized: false,
      destructive: false,
      aggressiveConfirmed: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.length).toBeGreaterThan(1);
  });
  it("creates deterministic safe draft plan", () => {
    const plan = planPullRequest(
      "NFR-18",
      "payments",
      [{ path: "tests/performance/x.txt", content: "token=secret" }],
      "safe",
    );
    expect(plan.branch).toBe("test/performance/nfr-18");
    expect(plan.draft).toBe(true);
    expect(plan.files[0]?.content).not.toContain("secret");
  });
});
