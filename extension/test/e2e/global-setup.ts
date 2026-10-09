import { build } from "esbuild";
import { fileURLToPath } from "node:url";

export default async function globalSetup() {
  const here = fileURLToPath(new URL(".", import.meta.url));
  await build({
    entryPoints: [`${here}harness.ts`],
    bundle: true,
    format: "iife",
    platform: "browser",
    outfile: `${here}.harness.js`,
    logLevel: "warning",
  });
}
