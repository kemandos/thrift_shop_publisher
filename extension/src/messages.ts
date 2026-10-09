import type {
  AnalyzeRequest,
  AnalyzeResult,
  ChooseRequest,
  ChooseResult,
  FormMap,
  ListingText,
  PickElementRequest,
  PickElementResult,
  RewriteRequest,
  Usage,
} from "@thrift/shared";
import type { z } from "zod";
import type { Settings } from "./settings";

/** Messages from content script / popup / options to the background worker. */
export type Request =
  | { type: "ai"; op: "analyze"; payload: z.input<typeof AnalyzeRequest> }
  | { type: "ai"; op: "rewrite"; payload: z.input<typeof RewriteRequest> }
  | { type: "ai"; op: "choose"; payload: z.input<typeof ChooseRequest> }
  | { type: "ai"; op: "pickElement"; payload: z.input<typeof PickElementRequest> }
  | { type: "getSettings" }
  | { type: "getFormMap" }
  | { type: "getUsage" }
  | { type: "testConnection" }
  | { type: "getBalance" }
  | { type: "heartbeat" };

export interface AiResults {
  analyze: AnalyzeResult;
  rewrite: ListingText;
  choose: ChooseResult;
  pickElement: PickElementResult;
}

export type Response<T> = { ok: true; data: T } | { ok: false; error: string; kind?: string };

export interface UsageSummary {
  last: { usage: Usage; costEur: number; at: number } | null;
  month: { key: string; usage: Usage; costEur: number };
}

/** OpenRouter credit balance in USD (null in server mode or when it cannot be read). */
export interface Balance {
  remainingUsd: number;
  /** "credits": account balance; "key-limit": remaining limit of this key. */
  source: "credits" | "key-limit";
}

export interface ResponseMap {
  getBalance: Balance | null;
  getSettings: Settings;
  getFormMap: FormMap;
  getUsage: UsageSummary;
  testConnection: { ok: true };
  heartbeat: { ok: true };
}
