import { addUsage, costEur, monthKey, type Usage } from "@thrift/shared";
import type { UsageSummary } from "./messages";

export interface KV {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const KEY = "usage";

interface Stored {
  months: Record<string, Usage>;
  last: { usage: Usage; at: number } | null;
}

async function read(kv: KV): Promise<Stored> {
  const raw = (await kv.get(KEY))[KEY] as Stored | undefined;
  return raw ?? { months: {}, last: null };
}

/**
 * Records one AI call: adds it to the month total and sets "last fill" to the running total
 * of the fill this call belongs to.
 */
export async function recordCall(kv: KV, call: Usage, fillTotal: Usage, now = new Date()): Promise<void> {
  const s = await read(kv);
  const key = monthKey(now);
  s.months[key] = addUsage(s.months[key] ?? { inputTokens: 0, outputTokens: 0 }, call);
  s.last = { usage: fillTotal, at: now.getTime() };
  await kv.set({ [KEY]: s });
}

export async function summary(kv: KV, now = new Date()): Promise<UsageSummary> {
  const s = await read(kv);
  const key = monthKey(now);
  const month = s.months[key] ?? { inputTokens: 0, outputTokens: 0 };
  return {
    last: s.last ? { ...s.last, costEur: costEur(s.last.usage) } : null,
    month: { key, usage: month, costEur: costEur(month) },
  };
}
