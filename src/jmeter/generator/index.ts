import type { GeneratedFile, LoadModel, ThresholdDefinition } from "../../types.js";
import { parseJmx } from "../parser/index.js";
import { redactSecrets } from "../../security/policy.js";

export interface Endpoint {
  name: string;
  method: string;
  path: string;
  body?: string | undefined;
  expectedStatus: number;
}
export interface GeneratePlanOptions {
  mode: "create" | "extend" | "modify";
  apiName: string;
  baseUrl: string;
  endpoints: Endpoint[];
  model: LoadModel;
  existingJmx?: string | undefined;
  csvColumns: string[];
  thresholds: ThresholdDefinition[];
}
const esc = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const slug = (value: string): string =>
  value
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase() || "API";
export function generatePerformanceFiles(options: GeneratePlanOptions): GeneratedFile[] {
  const api = slug(options.apiName);
  const url = new URL(options.baseUrl);
  const existing = options.existingJmx;
  const inventory = existing ? parseJmx(existing) : undefined;
  const missing = options.endpoints.filter((e) => !inventory?.samplers.includes(e.name));
  const endpointXml = (existing ? missing : options.endpoints).map(samplerXml).join("\n");
  let jmx =
    existing && options.mode !== "create"
      ? injectBeforeThreadGroupEnd(existing, endpointXml)
      : planXml(options, url, endpointXml);
  jmx = redactSecrets(jmx);
  const files: GeneratedFile[] = [
    { path: `tests/performance/plans/P_${api}.jmx`, content: jmx, encoding: "utf8" },
  ];
  if (options.csvColumns.length)
    files.push({
      path: `tests/performance/data/D_${api}.csv`,
      content: exampleCsv(options.csvColumns),
      encoding: "utf8",
    });
  files.push({
    path: "tests/performance/thresholds/thresholds.json",
    content: JSON.stringify(toThresholdObject(options.thresholds), null, 2) + "\n",
    encoding: "utf8",
  });
  files.push({
    path: `tests/performance/properties/local.properties`,
    content: `protocol=${url.protocol.slice(0, -1)}\nhost=${url.hostname}\nport=${url.port || (url.protocol === "https:" ? "443" : "80")}\nthreads=${options.model.threads ?? 1}\narrivalRate=${options.model.arrivalRate ?? 1}\nrampUp=${options.model.rampUpSeconds}\nduration=${options.model.durationSeconds ?? 60}\nloops=${options.model.loops ?? 1}\n`,
    encoding: "utf8",
  });
  return files;
}
function planXml(o: GeneratePlanOptions, url: URL, samplers: string): string {
  const threads = o.model.threads ?? 1;
  const loops = o.model.loops ?? -1;
  const duration = o.model.durationSeconds ?? 60;
  const csv = o.csvColumns.length
    ? `<CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="CSV Data Set Config" enabled="true"><stringProp name="filename">\${__P(csvFile,tests/performance/data/D_${slug(o.apiName)}.csv)}</stringProp><stringProp name="fileEncoding">UTF-8</stringProp><stringProp name="variableNames">${esc(o.csvColumns.join(","))}</stringProp><stringProp name="delimiter">,</stringProp><boolProp name="quotedData">true</boolProp><boolProp name="recycle">true</boolProp><boolProp name="stopThread">false</boolProp><stringProp name="shareMode">shareMode.all</stringProp></CSVDataSet><hashTree/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3"><hashTree><TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${esc(o.apiName)} Performance Plan" enabled="true"><boolProp name="TestPlan.functional_mode">false</boolProp><boolProp name="TestPlan.serialize_threadgroups">false</boolProp><elementProp name="TestPlan.user_defined_variables" elementType="Arguments"><collectionProp name="Arguments.arguments"/></elementProp></TestPlan><hashTree>
<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP Request Defaults" enabled="true"><elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments"/></elementProp><stringProp name="HTTPSampler.domain">\${__P(host,${esc(url.hostname)})}</stringProp><stringProp name="HTTPSampler.port">\${__P(port,${url.port || (url.protocol === "https:" ? "443" : "80")})}</stringProp><stringProp name="HTTPSampler.protocol">\${__P(protocol,${url.protocol.slice(0, -1)})}</stringProp><stringProp name="HTTPSampler.implementation">HttpClient4</stringProp><stringProp name="HTTPSampler.connect_timeout">10000</stringProp><stringProp name="HTTPSampler.response_timeout">30000</stringProp></ConfigTestElement><hashTree/>
<CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager" enabled="true"><collectionProp name="CookieManager.cookies"/><boolProp name="CookieManager.clearEachIteration">false</boolProp></CookieManager><hashTree/>
<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true"><collectionProp name="HeaderManager.headers"><elementProp name="Content-Type" elementType="Header"><stringProp name="Header.name">Content-Type</stringProp><stringProp name="Header.value">application/json</stringProp></elementProp></collectionProp></HeaderManager><hashTree/>
${workloadXml(o.model, threads, loops, duration)}<hashTree>${csv}${samplers}
<ResultCollector guiclass="SimpleDataWriter" testclass="ResultCollector" testname="Simple Data Writer" enabled="true"><boolProp name="ResultCollector.error_logging">false</boolProp><objProp><name>saveConfig</name><value class="SampleSaveConfiguration"><time>true</time><latency>true</latency><timestamp>true</timestamp><success>true</success><label>true</label><code>true</code><message>true</message><bytes>true</bytes><threadCounts>true</threadCounts><connectTime>true</connectTime><responseData>false</responseData></value></objProp><stringProp name="filename">\${__P(jtlFile,test-results/performance/R_${slug(o.apiName)}.jtl)}</stringProp></ResultCollector><hashTree/>
</hashTree></hashTree></hashTree></jmeterTestPlan>\n`;
}
function workloadXml(model: LoadModel, threads: number, loops: number, duration: number): string {
  if (model.kind === "open") {
    const arrivalRate = model.arrivalRate ?? 1;
    return `<com.blazemeter.jmeter.threads.arrival.ArrivalsThreadGroup guiclass="com.blazemeter.jmeter.threads.arrival.ArrivalsThreadGroupGui" testclass="com.blazemeter.jmeter.threads.arrival.ArrivalsThreadGroup" testname="${esc(model.testType)} open workload" enabled="true"><stringProp name="TargetLevel">\${__P(arrivalRate,${arrivalRate})}</stringProp><stringProp name="RampUp">\${__P(rampUp,${model.rampUpSeconds})}</stringProp><stringProp name="Steps">1</stringProp><stringProp name="Hold">\${__P(duration,${duration})}</stringProp><stringProp name="ConcurrencyLimit">\${__P(concurrencyLimit,${Math.max(10, Math.ceil(arrivalRate * 10))})}</stringProp><stringProp name="LogFilename"></stringProp><stringProp name="Iterations"></stringProp></com.blazemeter.jmeter.threads.arrival.ArrivalsThreadGroup>`;
  }
  return `<ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${esc(model.testType)} closed workload" enabled="true"><stringProp name="ThreadGroup.num_threads">\${__P(threads,${threads})}</stringProp><stringProp name="ThreadGroup.ramp_time">\${__P(rampUp,${model.rampUpSeconds})}</stringProp><boolProp name="ThreadGroup.scheduler">${model.durationSeconds ? "true" : "false"}</boolProp><stringProp name="ThreadGroup.duration">\${__P(duration,${duration})}</stringProp><elementProp name="ThreadGroup.main_controller" elementType="LoopController"><boolProp name="LoopController.continue_forever">${loops === -1 ? "true" : "false"}</boolProp><stringProp name="LoopController.loops">\${__P(loops,${loops})}</stringProp></elementProp></ThreadGroup>`;
}
function samplerXml(e: Endpoint): string {
  const body = e.body
    ? `<boolProp name="HTTPSampler.postBodyRaw">true</boolProp><elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments"><elementProp name="" elementType="HTTPArgument"><boolProp name="HTTPArgument.always_encode">false</boolProp><stringProp name="Argument.value">${esc(e.body)}</stringProp><stringProp name="Argument.metadata">=</stringProp></elementProp></collectionProp></elementProp>`
    : "";
  return `<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${esc(e.name)}" enabled="true"><stringProp name="HTTPSampler.path">${esc(e.path)}</stringProp><stringProp name="HTTPSampler.method">${e.method}</stringProp>${body}<boolProp name="HTTPSampler.follow_redirects">true</boolProp><boolProp name="HTTPSampler.use_keepalive">true</boolProp></HTTPSamplerProxy><hashTree><ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Status ${e.expectedStatus}" enabled="true"><collectionProp name="Asserion.test_strings"><stringProp name="status">${e.expectedStatus}</stringProp></collectionProp><stringProp name="Assertion.test_field">Assertion.response_code</stringProp><boolProp name="Assertion.assume_success">false</boolProp><intProp name="Assertion.test_type">8</intProp></ResponseAssertion><hashTree/></hashTree>`;
}
function injectBeforeThreadGroupEnd(xml: string, samplers: string): string {
  if (!samplers) return xml;
  const marker = "</hashTree></hashTree></hashTree></jmeterTestPlan>";
  const index = xml.lastIndexOf(marker);
  if (index < 0) throw new Error("No se encontró un punto seguro para ampliar el Thread Group.");
  return `${xml.slice(0, index)}${samplers}\n${xml.slice(index)}`;
}
function exampleCsv(columns: string[]): string {
  const values = columns.map((c) =>
    c.toLowerCase().includes("password")
      ? "example-password"
      : c.toLowerCase().includes("token")
        ? "example-token"
        : `example-${c}-001`,
  );
  return `${columns.join(",")}\n${values.join(",")}\n`;
}
function toThresholdObject(values: ThresholdDefinition[]): object {
  const global = values.find((v) => v.scope === "global") ?? {};
  return {
    global,
    operations: Object.fromEntries(
      values.filter((v) => v.scope !== "global").map((v) => [v.scope, v]),
    ),
  };
}
