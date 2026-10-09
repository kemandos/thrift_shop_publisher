import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { ConfigError, loadConfig } from "./config";
import { FileUsageStore } from "./usage";

function start() {
  const config = loadConfig(process.env);
  const app = createApp({
    anthropic: new Anthropic({ apiKey: config.anthropicApiKey }),
    tokens: config.tokens,
    autofillEnabled: config.autofillEnabled,
    model: config.model,
    formMap: config.formMap,
    usageStore: new FileUsageStore(join(config.dataDir, "usage.json")),
  });

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(
      `[server] listening on :${info.port} · model ${config.model} · ${config.tokens.length} token(s) · ` +
        `autofill ${config.autofillEnabled ? "on" : "OFF"} · form map ${config.formMap.version}`,
    );
  });

  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

try {
  start();
} catch (e) {
  console.error(`[server] ${e instanceof ConfigError ? "configuration error" : "startup failed"}: ${(e as Error).message}`);
  process.exit(1);
}
