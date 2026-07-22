# Architecture decisions

## Reuse analysis

The original JMeter skill is an artifact-oriented workflow with strong naming conventions and useful JMX/CSV/report examples. Its fixed 1000 × 30 workload is retained only as the aggressive `aiquaa_stress` compatibility preset. The Playwright MCP supplies the service boundary: strict Zod schemas, stateless Streamable HTTP, isolated adapters, structured responses and non-shell process spawning.

## Components

- `schemas/`: public tool contracts.
- `analyzers/`: requirements and bounded repository discovery.
- `load-model/`: closed/open decisions and presets.
- `jmeter/`: XXE-safe parsing, generation, validation and authorized runner.
- `results/`, `thresholds/`, `comparison/`: deterministic offline calculations.
- `security/`: host/load policy, redaction and path containment.
- `github/`, `aiquaa/`, `codegraph/`, `memory/`: optional external adapters.
- `tools/`: one handler per required MCP tool and central registration.

## Implementation sequence

1. Contracts and domain types.
2. Pure requirement/load/JMX/JTL functions.
3. Central security policy and side-effect adapters.
4. MCP registration and HTTP transport.
5. Fixtures, coverage gates, Docker, CI and npm OIDC publication.

The implementation deliberately keeps analysis/generation pure so clients can inspect `files` and `patch` responses before any external mutation.
