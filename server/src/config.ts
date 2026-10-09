import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_FORM_MAP, DEFAULT_MODEL, FormMap } from "@thrift/shared";

export interface ServerEnvConfig {
  anthropicApiKey: string;
  tokens: string[];
  autofillEnabled: boolean;
  model: string;
  formMap: FormMap;
  port: number;
  dataDir: string;
}

export const MIN_TOKEN_LENGTH = 24;

export class ConfigError extends Error {}

function parseBool(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(v)) return true;
  if (["false", "0", "no", "off"].includes(v)) return false;
  throw new ConfigError(`${name} must be true or false (got "${raw}")`);
}

/** Reads and validates the environment. Throws ConfigError with a readable message. */
export function loadConfig(env: NodeJS.ProcessEnv): ServerEnvConfig {
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!anthropicApiKey) throw new ConfigError("ANTHROPIC_API_KEY is not set");

  const tokens = (env.THRIFT_TOKENS ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) throw new ConfigError("THRIFT_TOKENS is not set (comma-separated, one per device)");
  tokens.forEach((t, i) => {
    if (t.length < MIN_TOKEN_LENGTH)
      throw new ConfigError(`THRIFT_TOKENS entry #${i + 1} is too short (min ${MIN_TOKEN_LENGTH} chars; use: openssl rand -hex 24)`);
    if (/\s/.test(t)) throw new ConfigError(`THRIFT_TOKENS entry #${i + 1} contains whitespace`);
  });
  if (new Set(tokens).size !== tokens.length) throw new ConfigError("THRIFT_TOKENS contains duplicates");

  let formMap: FormMap = DEFAULT_FORM_MAP;
  if (env.FORM_MAP_PATH?.trim()) {
    const path = resolve(env.FORM_MAP_PATH.trim());
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      throw new ConfigError(`FORM_MAP_PATH: cannot read ${path}: ${(e as Error).message}`);
    }
    const parsed = FormMap.safeParse(raw);
    if (!parsed.success) throw new ConfigError(`FORM_MAP_PATH: ${path} is not a valid form map: ${parsed.error.message}`);
    formMap = parsed.data;
  }

  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError(`PORT is invalid ("${env.PORT}")`);

  return {
    anthropicApiKey,
    tokens,
    autofillEnabled: parseBool("AUTOFILL_ENABLED", env.AUTOFILL_ENABLED, true),
    model: env.MODEL?.trim() || DEFAULT_MODEL,
    formMap,
    port,
    dataDir: resolve(env.DATA_DIR?.trim() || "./data"),
  };
}
