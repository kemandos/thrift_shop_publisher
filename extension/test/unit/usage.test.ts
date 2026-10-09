import { recordCall, summary, type KV } from "@/src/usageStore";

function memKV(): KV {
  const data: Record<string, unknown> = {};
  return { get: async (k) => ({ [k]: data[k] }), set: async (items) => void Object.assign(data, items) };
}

describe("usage store", () => {
  it("sums calls per month and keeps the last fill total", async () => {
    const kv = memKV();
    const oct = new Date("2026-10-09T10:00:00Z");
    await recordCall(kv, { inputTokens: 8000, outputTokens: 800 }, { inputTokens: 8000, outputTokens: 800 }, oct);
    await recordCall(kv, { inputTokens: 500, outputTokens: 50 }, { inputTokens: 8500, outputTokens: 850 }, oct);
    const s = await summary(kv, oct);
    expect(s.month.usage).toEqual({ inputTokens: 8500, outputTokens: 850 });
    expect(s.last?.usage).toEqual({ inputTokens: 8500, outputTokens: 850 });
    expect(s.month.costEur).toBeGreaterThan(0);
    const nov = await summary(kv, new Date("2026-11-02T10:00:00Z"));
    expect(nov.month.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
