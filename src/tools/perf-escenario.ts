import type { z } from "zod";
import { ScenarioInputSchema } from "../schemas/tools.js";
import { deriveLoadModel, presetModel } from "../load-model/presets.js";
export function perfEscenario(input: z.infer<typeof ScenarioInputSchema>) {
  return input.requirement
    ? deriveLoadModel(input.requirement)
    : presetModel(input.preset ?? "smoke");
}
