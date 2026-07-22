import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"], coverage: { provider: "v8", reporter: ["text", "json-summary"], include: ["src/{analyzers,comparison,jmeter,load-model,results,security,thresholds}/**/*.ts"], thresholds: { lines: 70, functions: 70, statements: 70, branches: 60 } } } });
