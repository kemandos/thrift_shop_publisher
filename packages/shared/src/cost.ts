import type { Usage } from "./schemas";

export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

/**
 * USD per million tokens, used only when the provider does not report the cost itself
 * (OpenRouter does via usage.cost). Update when pricing changes.
 */
export const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

/** Rough conversion for display only. */
export const USD_TO_EUR = 0.92;

export function costEur(usage: Usage, model: string = DEFAULT_MODEL): number {
  if (usage.costUsd !== undefined) return usage.costUsd * USD_TO_EUR;
  const p = PRICING_USD_PER_MTOK[model] ?? PRICING_USD_PER_MTOK[DEFAULT_MODEL]!;
  const usd = (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000;
  return usd * USD_TO_EUR;
}

export function addUsage(a: Usage, b: Usage): Usage {
  const sum: Usage = { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
  if (a.costUsd !== undefined || b.costUsd !== undefined) sum.costUsd = (a.costUsd ?? 0) + (b.costUsd ?? 0);
  return sum;
}

/** "ca. 0,2 ct" or "ca. 1,35 €" (German formatting). */
export function formatEur(eur: number): string {
  if (eur < 0.01) {
    const ct = eur * 100;
    return `ca. ${ct.toLocaleString("de-DE", { maximumFractionDigits: ct < 0.1 ? 2 : 1, minimumFractionDigits: 1 })} ct`;
  }
  return `ca. ${eur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "4,82 $" (German formatting, US dollars as OpenRouter bills). */
export function formatUsd(usd: number): string {
  return `${usd.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

/** Below this, the extension warns that the OpenRouter balance is nearly used up. */
export const LOW_BALANCE_USD = 0.5;
