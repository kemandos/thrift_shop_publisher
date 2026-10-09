# Thrift Shop Publisher

A personal helper for selling clothes on **Vinted**, on the computer (Chrome) and the iPhone (Safari):

1. Open **vinted.de → Artikel verkaufen** and add your photos as usual.
2. Optionally type an own instruction in the panel (e.g. "Erwähne: Nichtraucherhaushalt"), then tap **✨ Ausfüllen**. The AI looks at the photos, reads the size from the label, and fills in title, description and price, in **German or English** and in your chosen tone. Vinted usually detects category and brand from that text; if not, Thrift picks the category level by level and the brand only on an exact match. Then size, condition, colour and material.
3. Check it and tap **Hochladen** yourself. Thrift never uploads on its own.

Models come from **OpenRouter**, with one key for both:

| Job | Default model | Alternative |
|---|---|---|
| Photos & text | Claude Haiku 5.5 (`anthropic/claude-haiku-5.5`) | Jev Router |
| Clicking & navigation (picking options, finding fields) | Jev Router (`typesafe/jev-router`) | Claude Haiku 5.5 |

No other models are offered. Cost is about 0.2 ct per item for the photo analysis with Haiku. The popup shows the exact cost that OpenRouter reports.

## Repository layout

| Path | What |
|---|---|
| `extension/` | The browser extension (TypeScript, WXT, Tailwind CSS). Same code for Chrome and Safari. |
| `packages/shared/` | Shared schemas, prompts, OpenRouter client and cost calculation. |
| `server/` | Optional own server (Hono, Docker + Caddy). See `server/README.md`. |
| `ios/` | iPhone container app that ships the Safari extension. See `ios/README.md`. |
| `openspec/` | Specs and plans ([OpenSpec](https://github.com/Fission-AI/OpenSpec)); the active change is `add-vinted-autofill-extension`. |

## Install on the computer (Chrome)

Prerequisites: Node 22 and pnpm (`corepack enable`).

```bash
pnpm install
pnpm --filter @thrift/extension build      # → extension/.output/chrome-mv3
```

1. Open `chrome://extensions` and switch on **Entwicklermodus** (Developer mode).
2. Click **Entpackte Erweiterung laden** and choose `extension/.output/chrome-mv3`.
3. Click the Thrift icon → **Einstellungen**. Paste your OpenRouter key (from [openrouter.ai/keys](https://openrouter.ai/keys)), then **Verbindung testen**.
4. Go to vinted.de → **Artikel verkaufen**, add photos, then tap **✨ Ausfüllen**.

The panel adapts to the window: a bottom sheet on iPhone, a card on iPad and Mac. Use ↑/↓ to move it and – to shrink it to a small "✨ Ausfüllen" pill if it covers something; Thrift remembers this per device.

After a code update, run the build again and click ↻ on the extension in `chrome://extensions`.

## Install on the iPhone (Safari)

You need a Mac with Xcode. See [`ios/README.md`](ios/README.md). In short:

1. Run `pnpm --filter @thrift/extension build:safari`.
2. In `ios/`, run `xcodegen`, open `Thrift.xcodeproj`, choose your Team, then Run on the iPhone.
3. On the iPhone: Einstellungen → Apps → Safari → Erweiterungen → **Thrift** on, and allow it on vinted.de.
4. Open the Thrift app → **Einstellungen**: enter your OpenRouter key (or server), language and tone.

With a free Apple ID the app has to be reinstalled from Xcode every 7 days.

## Optional: own server on Oracle

Not needed. If you want the key off your devices, see [`server/README.md`](server/README.md), then set **Eigener Server** in the extension settings.

## Development

```bash
pnpm lint && pnpm typecheck && pnpm test     # unit tests (shared, server, extension)
pnpm --filter @thrift/extension test:e2e    # Playwright: fixture form + real extension in Chromium
```

The end-to-end tests run against `extension/test/fixtures/upload.html`. This is our own test page that recreates the *structure* of an upload form. AI calls are stubbed, so no key or Vinted account is needed.

## Safety rules (built in)

- Thrift fills only the open "Artikel verkaufen" form, and only after you click.
- Only you publish. The AI (including Jev) never sees, chooses or clicks publish/save/delete controls, its answers are re-checked, and the form can't submit while Thrift is filling.
- It never clicks "Hochladen" or "Entwurf speichern". Any control with such a label is blocked in code, and the tests check this.
- It doesn't use the Vinted API, relist, message, or work in the background.
- Size and brand are only taken from a visible label or logo. Otherwise the field stays empty and is marked.
