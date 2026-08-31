import { JMETER_VERSION } from "../constants.js";
import type { GeneratedFile } from "../types.js";

const slug = (v: string): string =>
  v
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

/**
 * The generated JMX references `${__P(protocol,...)}`, `${__P(host,...)}` and
 * `${__P(port,...)}` (see jmeter/generator/index.ts), not a combined base URL,
 * so PERF_BASE_URL has to be split into those three -J properties before
 * invoking jmeter — passing it through as -JbaseUrl is silently ignored.
 * Lines are joined with the caller's own indent so the block stays valid
 * inside either a GitHub Actions `run: |` or an Azure Pipelines `script: |`.
 */
function splitBaseUrlSh(indent: string): string {
  return [
    `proto=$(echo "$PERF_BASE_URL" | sed -E 's#^(https?)://.*#\\1#')`,
    `host=$(echo "$PERF_BASE_URL" | sed -E 's#^https?://([^:/]+).*#\\1#')`,
    `port=$(echo "$PERF_BASE_URL" | sed -E 's#^https?://[^:/]+:([0-9]+).*#\\1#')`,
    `if [ "$port" = "$PERF_BASE_URL" ]; then`,
    `  if [ "$proto" = "https" ]; then port=443; else port=80; fi`,
    `fi`,
  ].join(`\n${indent}`);
}

export function generatePipeline(
  target: "github_actions" | "azure_pipelines",
  apiName: string,
  planPath: string,
  datasetPath: string | undefined,
  thresholdsPath: string,
): GeneratedFile {
  const api = slug(apiName);
  const datasetArg = datasetPath ? ` -JcsvFile=${datasetPath}` : "";
  const jmeterProps = `-Jprotocol="$proto" -Jhost="$host" -Jport="$port"${datasetArg}`;
  if (target === "github_actions") {
    const runIndent = "          ";
    return {
      path: `.github/workflows/Y_${api}_jmeter.yml`,
      encoding: "utf8",
      content: `name: JMeter ${api}\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  performance:\n    runs-on: ubuntu-latest\n    timeout-minutes: 45\n    steps:\n      - uses: actions/checkout@v5\n      - uses: actions/setup-java@v5\n        with:\n          distribution: temurin\n          java-version: '17'\n      - name: Install JMeter\n        run: |\n          curl --fail --location --silent --show-error https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz -o jmeter.tgz\n          tar -xzf jmeter.tgz\n      - name: Run headless\n        env:\n          PERF_BASE_URL: \${{ secrets.PERF_BASE_URL }}\n        run: |\n          ${splitBaseUrlSh(runIndent)}\n          mkdir -p test-results/performance/dashboard\n          apache-jmeter-${JMETER_VERSION}/bin/jmeter -n -t ${planPath} -l test-results/performance/R_${api}.jtl -e -o test-results/performance/dashboard ${jmeterProps}\n      - name: Evaluate thresholds\n        run: npx -y aiquaa-performance-mcp-server --evaluate test-results/performance/R_${api}.jtl ${thresholdsPath}\n      - uses: actions/upload-artifact@v4\n        if: always()\n        with:\n          name: jmeter-${api}\n          path: test-results/performance\n`,
    };
  }
  const scriptIndent = "      ";
  return {
    path: `azure-pipelines/Y_${api}_jmeter.yml`,
    encoding: "utf8",
    content: `trigger: none\npool:\n  vmImage: ubuntu-latest\nsteps:\n  - task: JavaToolInstaller@0\n    inputs:\n      versionSpec: '17'\n      jdkArchitectureOption: x64\n      jdkSourceOption: PreInstalled\n  - script: |\n      curl --fail --location --silent --show-error https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz -o jmeter.tgz\n      tar -xzf jmeter.tgz\n      ${splitBaseUrlSh(scriptIndent)}\n      mkdir -p $(Build.ArtifactStagingDirectory)/performance/dashboard\n      apache-jmeter-${JMETER_VERSION}/bin/jmeter -n -t ${planPath} -l $(Build.ArtifactStagingDirectory)/performance/R_${api}.jtl -e -o $(Build.ArtifactStagingDirectory)/performance/dashboard ${jmeterProps}\n    displayName: Run JMeter headless\n    env:\n      PERF_BASE_URL: $(PERF_BASE_URL)\n  - script: npx -y aiquaa-performance-mcp-server --evaluate $(Build.ArtifactStagingDirectory)/performance/R_${api}.jtl ${thresholdsPath}\n    displayName: Evaluate thresholds\n  - task: PublishPipelineArtifact@1\n    condition: always()\n    inputs:\n      targetPath: $(Build.ArtifactStagingDirectory)/performance\n      artifact: jmeter-${api}\n`,
  };
}
