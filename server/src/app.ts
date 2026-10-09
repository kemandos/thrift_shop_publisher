import { createHash, timingSafeEqual } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import {
  AiError,
  analyze,
  AnalyzeRequest,
  API_PATHS,
  choose,
  ChooseRequest,
  costEur,
  DEFAULT_MODEL,
  type AiOptions,
  type AiResponse,
  type FormMap,
  monthKey,
  pickElement,
  PickElementRequest,
  rewrite,
  RewriteRequest,
  type ServerConfig,
} from "@thrift/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { z } from "zod";
import type { UsageStore } from "./usage";

/** Anything with `messages.parse` — the real SDK client or a test fake. */
export type AnthropicLike = { messages: Pick<Anthropic["messages"], "parse"> };

export interface AppDeps {
  anthropic: AnthropicLike;
  /** One bearer token per device; the index is the token id used for usage counts. */
  tokens: string[];
  autofillEnabled: boolean;
  model?: string;
  formMap: FormMap;
  usageStore: UsageStore;
  /** Injected for tests. */
  now?: () => Date;
}

/** Photos arrive base64 encoded (max 6, downscaled by the extension). */
export const MAX_BODY_BYTES = 15 * 1024 * 1024;

const EXTENSION_ORIGIN = /^(chrome-extension|safari-web-extension):\/\/[A-Za-z0-9-]+$/;

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time lookup: compares against every token, no early exit. Returns the token id or -1. */
function makeTokenMatcher(tokens: string[]) {
  const digests = tokens.map(digest);
  return (candidate: string): number => {
    const d = digest(candidate);
    let found = -1;
    digests.forEach((t, i) => {
      if (timingSafeEqual(t, d) && found === -1) found = i;
    });
    return found;
  };
}

type AiRunner<S extends z.ZodTypeAny, R> = (client: Anthropic, input: z.output<S>, opts: AiOptions) => Promise<AiResponse<R>>;

export function createApp(deps: AppDeps) {
  const model = deps.model ?? DEFAULT_MODEL;
  const now = deps.now ?? (() => new Date());
  const matchToken = makeTokenMatcher(deps.tokens);
  const app = new Hono<{ Variables: { tokenId: number } }>();

  app.use(
    "*",
    cors({
      origin: (origin) => (EXTENSION_ORIGIN.test(origin) ? origin : null),
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 600,
    }),
  );

  // Registered before the auth middleware, so it answers without a token.
  app.get(API_PATHS.health, (c) => c.json({ ok: true }));

  app.use("/v1/*", async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(\S+)$/.exec(header);
    const tokenId = m ? matchToken(m[1]!) : -1;
    if (tokenId < 0) return c.json({ error: "unauthorized" }, 401);
    c.set("tokenId", tokenId);
    await next();
  });

  app.get(API_PATHS.config, (c) =>
    c.json({ autofillEnabled: deps.autofillEnabled, formMapVersion: deps.formMap.version } satisfies ServerConfig),
  );

  app.get(API_PATHS.formMap, (c) => c.json({ formMap: deps.formMap }));

  app.get(API_PATHS.usage, (c) => {
    const month = monthKey(now());
    const { inputTokens, outputTokens, costEur } = deps.usageStore.month(month);
    return c.json({ month, inputTokens, outputTokens, costEur });
  });

  const limit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "Request body too large", kind: "too_large" }, 413),
  });

  function aiRoute<S extends z.ZodTypeAny, R>(path: string, schema: S, run: AiRunner<S, R>) {
    app.post(path, limit, async (c) => {
      const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) {
        // Only paths and messages, never the submitted values.
        const error = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
          .join("; ");
        return c.json({ error: error || "Invalid request body", kind: "bad_request" }, 400);
      }
      try {
        const { result, usage } = await run(deps.anthropic as Anthropic, parsed.data, { model });
        deps.usageStore.add(c.get("tokenId"), usage, costEur(usage, model), monthKey(now()));
        return c.json({ result, usage });
      } catch (e) {
        if (e instanceof AiError) return c.json({ error: e.message, kind: e.kind }, 502);
        throw e;
      }
    });
  }

  aiRoute(API_PATHS.analyze, AnalyzeRequest, analyze);
  aiRoute(API_PATHS.rewrite, RewriteRequest, rewrite);
  aiRoute(API_PATHS.choose, ChooseRequest, choose);
  aiRoute(API_PATHS.pickElement, PickElementRequest, pickElement);

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    // Message only — request bodies and images are never logged.
    console.error(`[server] ${c.req.method} ${c.req.path}: ${err.message}`);
    return c.json({ error: "internal error", kind: "internal" }, 500);
  });

  return app;
}
