# AIQUAA Performance MCP Server

Servidor Model Context Protocol para convertir requisitos no funcionales, contratos de API, código y artefactos JMeter en automatización de rendimiento segura y trazable. Analiza cobertura, genera o amplía planes `.jmx`, evalúa `.jtl`, compara ejecuciones y prepara draft pull requests.

La capacidad no se infiere sólo desde el código. Todas las respuestas distinguen información observada, declarada, estimada y desconocida. Si falta carga suficiente, el servidor devuelve supuestos y una propuesta, nunca una carga “validada”.

## Quick start

Requiere Node.js 20+. Java 11+ y Apache JMeter 5.6+ sólo son obligatorios para ejecutar pruebas.

```bash
npx -y aiquaa-performance-mcp-server
```

El servidor publica:

- MCP Streamable HTTP: `http://localhost:3000/mcp`
- Health: `http://localhost:3000/health`

Configuración de un cliente MCP:

```json
{
  "mcpServers": {
    "aiquaa-performance": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Desarrollo local:

```bash
npm ci
npm run check
npm start
```

## Arquitectura

```text
MCP HTTP → schemas Zod → tools → dominio
                                ├─ análisis de requisito/repositorio
                                ├─ modelo de carga cerrado/abierto
                                ├─ parser/generador/validador/runner JMeter
                                ├─ JTL, thresholds y comparación
                                ├─ pipelines y GitHub draft PR
                                └─ adapters AIQUAA, CodeGraph y Engram
```

Las operaciones de lectura son puras. La generación devuelve archivos, pero no los escribe. `perf_ejecutar` y `perf_pr` concentran los efectos externos y están bloqueadas por defecto. La ejecución usa argumentos de proceso separados (`shell: false`); XML rechaza `DOCTYPE`/`ENTITY`; todas las rutas se normalizan y validan.

## Tools

| Tool              | Resultado                                                                            |
| ----------------- | ------------------------------------------------------------------------------------ |
| `perf_analizar`   | Endpoints, flujos, auth, datos, riesgos, JMeter/CI existentes, faltantes y confianza |
| `perf_requisitos` | `PerformanceRequirement` trazable desde NFR/SLA/SLO                                  |
| `perf_escenario`  | Modelo cerrado u abierto y su justificación                                          |
| `perf_cobertura`  | `covered`, `partially_covered`, `uncovered`, `outdated`, `unsafe` o `blocked`        |
| `perf_generar`    | JMX, CSV ficticio, properties y thresholds en modos `create`, `extend`, `modify`     |
| `perf_validar`    | XML, estructura, variables, CSV, plugins, listeners y secretos, sin ejecutar         |
| `perf_ejecutar`   | `validation_only`, `smoke` o `full`, sujeto a autorización y límites                 |
| `perf_resultados` | Muestras, errores, throughput, P50/P90/P95/P99, bytes y veredictos                   |
| `perf_comparar`   | Mejora, degradación, cambio no significativo o no comparable                         |
| `perf_pipeline`   | GitHub Actions o Azure Pipelines headless con artifacts y thresholds                 |
| `perf_cambios`    | Plan previo de archivos, cobertura estimada, riesgo y supuestos                      |
| `perf_pr`         | Plan dry-run o rama + archivos + draft PR mediante Octokit                           |
| `perf_informe`    | Informe PDF (portada, veredicto, percentiles, comparación, detalle por sampler)      |

Todas aceptan `response_format`: `json`, `markdown`, `files` o `patch`, salvo `perf_informe`,
que siempre devuelve el PDF embebido en base64 (`resource` con `mimeType: application/pdf`)
junto a un resumen en texto; el cliente decide si lo persiste.

## Modelos y presets

Un workload cerrado modela usuarios concurrentes que esperan una respuesta; uno abierto modela una tasa de llegada independiente. `perf_escenario` selecciona el segundo cuando el requisito declara `arrivalRate` o throughput y el primero cuando declara concurrencia.

Presets incluidos:

- `smoke`: 1 thread, 1 loop, ramp-up 1 s.
- `baseline`: 5 threads, 60 s, ramp-up 10 s.
- `load`, `stress`, `spike`, `endurance`, `soak`, `capacity`, `breakpoint`, `scalability`, `volume`: se derivan del requisito; sin datos, comienzan como propuesta mínima con confianza baja.
- `aiquaa_stress`: 1000 threads × 30 loops, ramp-up 0, think time 0. Está marcado como agresivo y nunca puede ejecutarse sin confirmación explícita.

## JMeter y archivos generados

Los planes usan JMeter 5.6.3, `HttpClient4`, HTTP defaults, cookies, headers, CSV UTF-8, assertions y Simple Data Writer. Evitan BeanShell, secretos y listeners gráficos. La ampliación preserva el XML existente e inserta sólo samplers cuyos nombres todavía no existen.

```text
tests/performance/
├── plans/P_<API>.jmx
├── data/D_<API>.csv
├── properties/<environment>.properties
├── thresholds/thresholds.json
└── README.md

test-results/performance/
├── R_<API>.jtl
├── dashboard/
├── summary.json
├── comparison.json
└── INFORME_PERF_<API>.pdf
```

Los CSV generados contienen valores ficticios. Configure `recycle`, `stopThread` y sharing mode según si los datos son reutilizables, únicos, consumibles o requieren cleanup. No versionar credenciales ni datos reales.

## Thresholds y resultados

```json
{
  "global": { "maxErrorRate": 1, "p95Ms": 1500 },
  "operations": {
    "POST /payments": { "maxErrorRate": 0.1, "p95Ms": 2000, "p99Ms": 3500 }
  }
}
```

Los veredictos son `PASS`, `FAIL`, `INCONCLUSIVE` y `NOT_EXECUTED`. Falta de thresholds, pocas muestras o ambiente inestable producen `INCONCLUSIVE`. La comparación devuelve `not_comparable` si difieren carga, duración, dataset, ambiente, infraestructura, versión o warm-up.

Un pipeline puede evaluar resultados con:

```bash
npx -y aiquaa-performance-mcp-server --evaluate test-results/performance/R_API.jtl tests/performance/thresholds/thresholds.json
```

## Seguridad de ejecución

`perf_ejecutar` usa `validation_only` por defecto. Para una ejecución real se requieren simultáneamente:

1. `PERF_ALLOW_EXECUTION=true`;
2. host exacto en `PERF_ALLOWED_HOSTS`;
3. `authorized=true` en la llamada;
4. carga bajo los máximos configurados;
5. confirmación adicional para producción, carga agresiva o pruebas destructivas.

Variables:

| Variable                                                                 | Uso                                  |
| ------------------------------------------------------------------------ | ------------------------------------ |
| `PORT`, `MCP_PATH`                                                       | Servidor HTTP                        |
| `JMETER_HOME`, `JAVA_HOME`                                               | Ejecución local                      |
| `PERF_ALLOWED_HOSTS`, `PERF_PRODUCTION_HOSTS`                            | Allowlist y protección de producción |
| `PERF_MAX_THREADS`, `PERF_MAX_DURATION_SECONDS`, `PERF_MAX_ARRIVAL_RATE` | Límites duros                        |
| `PERF_ALLOW_EXECUTION`                                                   | Kill switch; `false` por defecto     |
| `GITHUB_TOKEN`, `GITHUB_API_URL`                                         | Draft PR                             |
| `AIQUAA_API_BASE_URL`, `AIQUAA_ACCESS_TOKEN`                             | Adapter AIQUAA                       |
| `CODEGRAPH_BIN`, `CODEGRAPH_ALLOWED_ROOTS`                               | Contexto estructural opcional        |
| `ENGRAM_BIN`, `ENGRAM_PROJECT_PREFIX`                                    | Memoria opcional por proyecto        |

La API HTTP limita cuerpos a 10 MB; los runners tienen timeout y cancelación. Tokens, passwords, API keys y secretos se redactan antes de producir archivos o PR. No se permite path traversal.

## GitHub PR

`perf_pr` siempre usa rama `test/performance/<requirement-or-flow>`, título `test(perf): add load coverage for <flow>` y draft PR. `dry_run=true` es el default y devuelve el plan completo sin mutar GitHub. Con `dry_run=false`, Octokit crea la rama desde `base`, escribe cada archivo y abre el draft.

El body proporcionado debe documentar requisito, tipo/modelo, endpoints, carga, duración, ramp-up, dataset, thresholds, supuestos, riesgos, comandos, variables, impacto, ejecución y checklist de seguridad.

## AIQUAA, CodeGraph y Engram

- AIQUAA centraliza rutas para obtener requisitos y guardar planes, ejecuciones y vínculos de PR. El adapter es opcional y no registra contratos inventados más allá de esas rutas configurables.
- CodeGraph puede construir contexto estructural sólo dentro de `CODEGRAPH_ALLOWED_ROOTS`; ejecute `codegraph init -i` en cada repositorio antes de usarlo.
- Engram queda aislado mediante `ENGRAM_PROJECT_PREFIX + projectId`. Guardar únicamente thresholds, decisiones, ambientes y resultados curados; nunca credenciales o datasets sensibles.

## Docker y CI

El `Dockerfile` construye TypeScript con Node 20 y ejecuta sobre Java 17 con JMeter 5.6.3. GitHub Actions valida lint, build, pruebas, cobertura mínima de 70%, paquete npm y build de imagen. La publicación npm se dispara desde releases, usa OIDC/trusted publishing y `--provenance`; no necesita un token npm persistente.

## Ejemplo de flujo MCP

> Analizá el repositorio y NFR-018. El requisito establece 150 usuarios concurrentes, P95 < 2 s y error rate < 0,5%. Revisá auth, JMX y baseline; no dupliques samplers. Planificá cambios, ampliá el plan, generá CSV ficticio, thresholds y diff. Después prepará el draft PR. No ejecutes la prueba.

Orden recomendado: `perf_analizar` → `perf_requisitos` → `perf_escenario` → `perf_cobertura` → `perf_cambios` → `perf_generar` → `perf_validar` → `perf_pr`.

## Reutilización y diferencias respecto a las referencias

De `aiquaa-labs/jmeter-skill` se conservaron nombres `P_`, `D_`, `R_`, generación JMX/CSV, ejecución non-GUI, dashboard, CI, reparación y reporting. El cambio deliberado es que 1000×30 dejó de ser universal y pasó a `aiquaa_stress` con riesgo explícito. El diseño del informe PDF (`perf_informe`: portada, banda de estadísticas, percentiles, veredicto, comparación con línea base, detalle por sampler, top errores) reproduce el de `reporter/jmeter_report.py` de ese repo, mismo layout pero reimplementado en TypeScript con `pdfkit` para no requerir Python/pandas/reportlab en el servidor MCP.

De `aiquaa-playwright-mcp-server` se reutilizó el patrón de `McpServer` + Streamable HTTP sin estado, schemas Zod estrictos, adaptadores AIQUAA/CodeGraph/Engram, respuestas estructuradas y procesos sin shell. Performance agrega policy centralizada, análisis XML/JTL, comparabilidad y efectos externos bloqueados por defecto.

## Limitaciones

- El modelo abierto genera `ArrivalsThreadGroup` y requiere instalar JMeter Plugins Custom Thread Groups; `perf_validar` lo declara como dependencia antes de ejecutar.
- El análisis estático local detecta señales, no capacidad real ni topología desplegada.
- Los percentiles se calculan en memoria; aplique límites externos para JTL muy grandes.
- `perf_informe` genera el PDF con `pdfkit` (sin dependencias de Python) a partir de lo que ya calcula `perf_resultados`/`perf_comparar`; el dashboard HTML de JMeter (`-e -o`) sigue siendo aparte, vía los pipelines de `perf_pipeline`.
- La ampliación localizada usa nombres de sampler como clave de identidad; renombres manuales pueden requerir revisión.
