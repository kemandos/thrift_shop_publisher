import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const isTest = process.env.THRIFT_TEST === "1";

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: ".",
  manifest: ({ browser }) => ({
    name: "Thrift – Vinted Ausfüller",
    short_name: "Thrift",
    description: "Füllt das Vinted-Verkaufsformular aus deinen Fotos aus. Hochladen klickst du selbst.",
    version: "0.1.0",
    permissions: ["storage", ...(browser === "safari" ? ["nativeMessaging"] : [])],
    host_permissions: [
      "https://www.vinted.de/*",
      "https://openrouter.ai/*",
      ...(isTest ? ["http://127.0.0.1/*", "http://localhost/*"] : []),
    ],
    action: { default_title: "Thrift" },
    ...(browser === "safari"
      ? { browser_specific_settings: { safari: { strict_min_version: "17.0" } } }
      : {}),
  }),
  vite: () => ({ plugins: [tailwindcss()] }),
  webExt: { disabled: true },
});
