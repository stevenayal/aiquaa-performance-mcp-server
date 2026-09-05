import { XMLParser, XMLValidator } from "fast-xml-parser";

/** An HTTP sampler's declared verb and path, keyed by its JMeter test name. */
export interface SamplerRequest {
  name: string;
  method: string;
  path: string;
}
export interface JmxInventory {
  valid: boolean;
  errors: string[];
  samplers: string[];
  requests: SamplerRequest[];
  threadGroups: number;
  csvDataSets: number;
  extractors: string[];
  listeners: string[];
  variables: string[];
  plugins: string[];
}
export function parseJmx(xml: string): JmxInventory {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    return empty(["DOCTYPE/ENTITY está prohibido para evitar XXE."]);
  const validation = XMLValidator.validate(xml);
  if (validation !== true) return empty([validation.err.msg]);
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    allowBooleanAttributes: false,
    parseTagValue: false,
  });
  const document = parser.parse(xml) as unknown;
  const inventory = empty([]);
  inventory.valid = true;
  visit(document, (name, value) => {
    const record = asRecord(value);
    const label = stringAttr(record, "@_testname");
    if (name === "HTTPSamplerProxy") {
      const samplerName = label || "HTTP Request";
      inventory.samplers.push(samplerName);
      inventory.requests.push({
        name: samplerName,
        method: stringProp(record, "HTTPSampler.method"),
        path: stringProp(record, "HTTPSampler.path"),
      });
    }
    if (/ThreadGroup$/.test(name)) inventory.threadGroups += 1;
    if (name === "CSVDataSet") inventory.csvDataSets += 1;
    if (/Extractor$/.test(name)) inventory.extractors.push(label || name);
    if (name === "ResultCollector") inventory.listeners.push(label || name);
    if (
      name.includes("kg.apc") ||
      name.includes("ConcurrencyThreadGroup") ||
      name.includes("ArrivalsThreadGroup")
    )
      inventory.plugins.push(name);
  });
  inventory.variables = [
    ...new Set([...xml.matchAll(/\$\{([A-Za-z_][\w.]*)\}/g)].map((m) => m[1] ?? "")),
  ].filter(Boolean);
  return inventory;
}
function empty(errors: string[]): JmxInventory {
  return {
    valid: false,
    errors,
    samplers: [],
    requests: [],
    threadGroups: 0,
    csvDataSets: 0,
    extractors: [],
    listeners: [],
    variables: [],
    plugins: [],
  };
}
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function stringAttr(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === "string" ? value[key] : "";
}
/** Reads a `<stringProp name="key">value</stringProp>` child of a parsed element. */
function stringProp(element: Record<string, unknown>, key: string): string {
  const raw = element["stringProp"];
  const props = Array.isArray(raw) ? raw : [raw];
  for (const prop of props) {
    const record = asRecord(prop);
    if (stringAttr(record, "@_name") !== key) continue;
    const text = record["#text"];
    return typeof text === "string" ? text : "";
  }
  return "";
}
function visit(value: unknown, action: (name: string, value: unknown) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, action));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(child)) child.forEach((item) => action(name, item));
    else action(name, child);
    visit(child, action);
  }
}
