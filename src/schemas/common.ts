import { z } from "zod";
import { TEST_TYPES } from "../types.js";

export const ResponseFormatSchema = z
  .enum(["json", "markdown", "files", "patch"])
  .default("markdown");
export const TestTypeSchema = z.enum(TEST_TYPES);
export const SourceReferenceSchema = z
  .object({
    kind: z.enum(["requirement", "repository", "openapi", "user", "estimated"]),
    reference: z.string().min(1),
  })
  .strict();
export const ThresholdSchema = z
  .object({
    scope: z.string().min(1).default("global"),
    maxErrorRate: z.number().min(0).max(100).optional(),
    averageMs: z.number().positive().optional(),
    p90Ms: z.number().positive().optional(),
    p95Ms: z.number().positive().optional(),
    p99Ms: z.number().positive().optional(),
    maxMs: z.number().positive().optional(),
  })
  .strict();
export const RequirementSchema = z
  .object({
    id: z.string().min(1),
    operationIds: z.array(z.string()).default([]),
    testType: TestTypeSchema,
    concurrentUsers: z.number().int().positive().optional(),
    arrivalRate: z.number().positive().optional(),
    durationSeconds: z.number().int().positive().optional(),
    rampUpSeconds: z.number().int().min(0).optional(),
    loops: z.number().int().positive().optional(),
    targetThroughput: z.number().positive().optional(),
    maxErrorRate: z.number().min(0).max(100).optional(),
    responseTimeThresholds: z
      .object({
        averageMs: z.number().positive().optional(),
        p90Ms: z.number().positive().optional(),
        p95Ms: z.number().positive().optional(),
        p99Ms: z.number().positive().optional(),
        maxMs: z.number().positive().optional(),
      })
      .strict()
      .default({}),
    source: SourceReferenceSchema,
    confidence: z.enum(["high", "medium", "low"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.concurrentUsers && value.arrivalRate)
      context.addIssue({
        code: "custom",
        message: "Use concurrentUsers (closed) o arrivalRate (open), no ambos.",
      });
  });
export const EndpointSchema = z
  .object({
    name: z.string().min(1),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
    path: z.string().startsWith("/"),
    body: z.string().optional(),
    expectedStatus: z.number().int().min(100).max(599).default(200),
  })
  .strict();
export const BaseInputSchema = z.object({ response_format: ResponseFormatSchema }).strict();
