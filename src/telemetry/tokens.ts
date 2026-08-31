export interface ToolTokenStat {
  tool: string;
  calls: number;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}
export interface TokenLedger {
  startedAt: string;
  perTool: Record<string, ToolTokenStat>;
}

const CHARS_PER_TOKEN = 4;

/** Rough chars/4 proxy, not a real tokenizer count. */
export function estimateTokens(text: string): number {
  return text.length === 0 ? 0 : Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

function createLedger(): TokenLedger {
  return { startedAt: new Date().toISOString(), perTool: {} };
}

let ledger: TokenLedger = createLedger();

export function recordToolUsage(tool: string, inputText: string, outputText: string): ToolTokenStat {
  const entry = ledger.perTool[tool] ?? {
    tool,
    calls: 0,
    inputTokensEstimate: 0,
    outputTokensEstimate: 0,
  };
  entry.calls += 1;
  entry.inputTokensEstimate += estimateTokens(inputText);
  entry.outputTokensEstimate += estimateTokens(outputText);
  ledger.perTool[tool] = entry;
  return entry;
}

export function getTokenLedger(): TokenLedger {
  return ledger;
}

export function resetTokenLedger(): void {
  ledger = createLedger();
}
