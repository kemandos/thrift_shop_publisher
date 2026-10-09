import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Usage } from "@thrift/shared";

/** Aggregated counters. Only numbers are stored — never photos, text or prompts. */
export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
}

/** month ("YYYY-MM") → token id (index in THRIFT_TOKENS) → totals */
export type UsageData = Record<string, Record<string, UsageTotals>>;

export interface UsageStore {
  add(tokenId: number, usage: Usage, costEur: number, month: string): void;
  /** Totals for one month, summed over all tokens. */
  month(month: string): UsageTotals;
}

const empty = (): UsageTotals => ({ requests: 0, inputTokens: 0, outputTokens: 0, costEur: 0 });

export class MemoryUsageStore implements UsageStore {
  constructor(protected data: UsageData = {}) {}

  add(tokenId: number, usage: Usage, costEur: number, month: string): void {
    const byToken = (this.data[month] ??= {});
    const t = (byToken[String(tokenId)] ??= empty());
    t.requests += 1;
    t.inputTokens += usage.inputTokens;
    t.outputTokens += usage.outputTokens;
    t.costEur += costEur;
  }

  month(month: string): UsageTotals {
    return Object.values(this.data[month] ?? {}).reduce((sum, t) => {
      sum.requests += t.requests;
      sum.inputTokens += t.inputTokens;
      sum.outputTokens += t.outputTokens;
      sum.costEur += t.costEur;
      return sum;
    }, empty());
  }

  snapshot(): UsageData {
    return structuredClone(this.data);
  }
}

/** JSON file persistence (low write volume: one write per AI request). Writes are atomic via rename. */
export class FileUsageStore extends MemoryUsageStore {
  constructor(private readonly path: string) {
    super(FileUsageStore.load(path));
    mkdirSync(dirname(path), { recursive: true });
  }

  private static load(path: string): UsageData {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as UsageData;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error(`Cannot read usage file ${path}: ${(e as Error).message}`, { cause: e });
    }
  }

  override add(tokenId: number, usage: Usage, costEur: number, month: string): void {
    super.add(tokenId, usage, costEur, month);
    try {
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      renameSync(tmp, this.path);
    } catch (e) {
      // Counting must never break a fill; keep the in-memory value and report.
      console.error(`[usage] could not write ${this.path}: ${(e as Error).message}`);
    }
  }
}
