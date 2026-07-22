import { parseJmx } from "../parser/index.js";

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  inventory: ReturnType<typeof parseJmx>;
}
export function validateJmx(xml: string, filePaths: string[] = []): ValidationReport {
  const inventory = parseJmx(xml);
  const errors = [...inventory.errors];
  const warnings: string[] = [];
  if (inventory.threadGroups === 0) errors.push("No existe Thread Group.");
  if (inventory.samplers.length === 0) warnings.push("No existen HTTP samplers.");
  if (/View Results Tree|Graph Results|Aggregate Graph/i.test(xml))
    warnings.push("Listener gráfico/pesado detectado; deshabilítelo durante carga.");
  if (/BeanShell/i.test(xml)) warnings.push("BeanShell detectado; prefiera JSR223 con Groovy.");
  if (/<(?:stringProp|Argument.value)[^>]*>[^<]*(?:password|token|secret)[=:][^$<]+/i.test(xml))
    errors.push("Posible secreto hardcodeado.");
  for (const variable of inventory.variables)
    if (
      !xml.includes(`__P(${variable},`) &&
      !xml.includes(`name="${variable}"`) &&
      !filePaths.some((p) => p.endsWith(".csv"))
    )
      warnings.push(`Variable posiblemente no definida: ${variable}`);
  if (inventory.plugins.length)
    warnings.push(`Plugins requeridos: ${inventory.plugins.join(", ")}`);
  return { valid: inventory.valid && errors.length === 0, errors, warnings, inventory };
}
