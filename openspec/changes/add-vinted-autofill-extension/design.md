# Design

## Context

See `proposal.md`. Constraints:
- Personal use by one household.
- The owner has an Oracle compute VM that can host a small service.
- vinted.de's upload form works in desktop browsers and in Safari on iPhone. On iPhone this was verified on 2026-10-09 by screenshot.
- Vinted's terms forbid unauthorised "external software tools". The design limits itself to filling the open form after a user click. The user always submits.

## Goals / Non-Goals

**Goals:**
- One TypeScript codebase for Chrome and Safari on iPhone.
- About 30 seconds from "photos added" to "ready to upload".
- Survives small changes to Vinted's UI without a release.

**Non-Goals:**
- Auto-submit, bulk listing, relisting, messaging, scraping.
- A headless or server-side browser holding the Vinted login (that is bot territory: account risk, and server IPs get blocked).
- Batch grouping of many photos into items. The user works one item at a time in Vinted's form. Grouping could come later.
- Subscriptions and multi-user support.

## Decisions

### V1 — TypeScript monorepo

- Layout: `pnpm` workspaces with `packages/shared`, `extension/`, `server/` and `ios/`.
  - `packages/shared` holds the Zod schemas for listing data, AI request/response and the form map. Extension and server import the same types.
- **Why TypeScript everywhere:** browsers only run JS/TS for extensions. Sharing types with the server avoids keeping two definitions in sync.
- **Alternatives considered:**
  - *Go server:* a single binary and very little RAM, but a second language and duplicated types.
  - *Rust:* overkill.
  - *Rust or Go compiled to WebAssembly in the extension:* adds glue for no gain, because DOM work stays in JS.

### V2 — Extension with WXT (Manifest V3)

- **Content script:** matches only `https://www.vinted.de/items/new*` (plus edit pages later). It mounts a small Shadow-DOM control: "✨ Ausfüllen · Deutsch · Freundlich", a status line, and copy buttons on fallback.
- **Popup and options page:** "Artikel verkaufen", settings and cost.
- **Styling:** Tailwind CSS v4 via `@tailwindcss/vite`, with the Atelier palette as theme tokens in `src/ui/tailwind.css` (paper, ink, muted, line, spruce; no orange or violet). Popup and options load it as a stylesheet. The panel injects the same build into its shadow root (`?inline`), so it neither leaks into nor inherits from vinted.de. Tailwind's `@property` rules are registered once on the page, because browsers ignore them inside shadow roots.
- **Background service worker:** makes the AI calls, so keys never live in the page context.
- **Safari:** the same build is converted with `xcrun safari-web-extension-converter` into the iOS container (V7).

### V3 — Reading photos and options

- **Photos:**
  1. The content script observes Vinted's photo grid. For each preview `<img>` (blob: or https URL from the page), it fetches the image in page context.
  2. It downscales the image to ≤1280 px on the long edge with `OffscreenCanvas`, re-encodes it as JPEG and strips metadata.
  3. It sends the result to the background worker. Originals stay in Vinted's form untouched.
  4. Fallback: capture `File` objects from the photo `<input type=file>` `change` event.
- **Options:** for each picker field (category tree, size, condition, colour, brand search), the filler opens it programmatically, reads the visible option labels, and closes it again.
  - The category is resolved first, because size options depend on it.
  - The AI therefore gets: photos, the top-level category list, and, after the category is chosen, the size, condition and colour options in a second, cheap text-only step.

### V4 — AI calls (OpenRouter: Claude Haiku 5.5 + Jev Router)

1. **Analyse.** One call with up to 6 photos (≈1.6K tokens each) and the category options. It returns structured output (`response_format: json_schema`, strict) with a JSON schema generated from the Zod schemas in `packages/shared`:
   - type, category path, brand, size, colours, material, condition, defects, price range;
   - title, description and hashtags in the chosen language and tone;
   - evidence flags ("size from label").
2. **Refine.** A text-only call after the category is set: map the found attributes to the exact size, condition and colour option labels.
3. **Rewrite.** On a language or tone change: a text-only call from the stored attributes.

**Cost:** ≈0.2 ct per item. Each fill's `usage` is shown in the popup and summed per month.

**Provider:** OpenRouter's OpenAI-compatible `/api/v1/chat/completions`, one key for both models. Images go as `image_url` data URLs; `provider.require_parameters` keeps routing to providers that honour `response_format`; `usage.include` returns the exact cost per call, which is what the popup shows.

**Models (only these two):**
- `anthropic/claude-haiku-5.5` for photos → listing (analyse, rewrite). $0.10 / $0.50 per 1M tokens.
- `typesafe/jev-router` for clicking and navigation (choosing picker options, AI element picking). It picks the underlying model per request; cost comes from OpenRouter's reported `usage.cost`.
Both are switchable in the settings; nothing else is offered.

**Provider-neutral layer:** `packages/shared` defines an `LlmClient` (`structured()` → raw JSON, stop reason, tokens, cost). `openRouterLlm` is used by the extension; the optional server can also use `anthropicLlm` when only `ANTHROPIC_API_KEY` is set. Validation, the one retry and the evidence rules sit above it, identical for both.

**Key handling:** the OpenRouter key is the user's own and lives only on the user's device (extension local storage / iOS Keychain); calls run in the background worker, never in the page.

### V5 — Filling: form map first, AI element picking second

- **Form map:** versioned JSON validated by Zod. For each field it holds:
  - a selector strategy (label text, role, data-testid, placeholder);
  - the field type (text, textarea, picker-tree, picker-list, search-select, price);
  - an interaction recipe.

  It is bundled with the extension and, in server mode, refreshed from the server.
- **Text inputs:** use the native value setter, then dispatch `input` and `change`, so React-controlled fields register the value.
- **Pickers:** open, search or select, verify the displayed value, and close. Steps run 120–300 ms apart.
- **AI element picking (Jev-style fallback):** if a field can't be resolved, the filler builds a compact list of visible interactive elements (`[{id, role, label, text}]`, at most 150). It asks Haiku (text-only, effort low) which element is the target field or option, acts on that element, and verifies the result. Each picked element gets logged locally, so the map can be updated.
- **Last resort:** a copy button per unresolved field.

### V6 — Optional server on the Oracle VM

- **Stack:** Hono on Node 22, in Docker Compose with Caddy for automatic HTTPS (own domain or DuckDNS).
- **Endpoints:** `POST /analyze`, `POST /refine`, `POST /rewrite`, `POST /pick-element`, `GET /form-map`.
- **Auth:** a bearer token per device, set in the extension settings.
- **Storage:** none for photos or text, which are processed in memory only. Usage counts go to a small JSON file (`DATA_DIR/usage.json`).
- **What it adds:** the OpenRouter key lives only on the server; prompts and the form map update centrally; usage is tracked for both devices.

The extension works without it (direct mode). The server is added when wanted.

### V7 — iOS container app

- A minimal SwiftUI app with the converted Safari Web Extension target, sharing an App Group.
- **Screens:** setup guide (enable the extension, allow it on vinted.de, an "Open vinted.de/items/new" button) and settings (AI mode, key or server, language, tone, closing text).
- **Sharing settings:** the app saves them to the App Group. The extension reads them through native messaging (`browser.runtime.sendNativeMessage` → `SafariWebExtensionHandler`).
- **Install:** with a free Apple ID the app is installed from Xcode and expires every 7 days. With the Developer Program, installs last a year and TestFlight is available.

### V8 — Testing without a live Vinted account

- A **fixture page** in `extension/test/fixtures/` reproduces the *structure* of the upload form: a photo grid, text fields, a category tree, size, condition and colour pickers, brand search and price. It is our own markup and copies no Vinted code.
- Playwright (Chromium is available in CI and in the dev container) runs the content script against it.
- The AI is stubbed in tests, with one optional live test that uses the key from env.
- Real-site checks happen manually on the owner's account.

## Risks / Trade-offs

- **[Vinted changes the form]** → The form map is hot-fixed via the server. The AI element picking bridges gaps. Copy buttons are the last resort.
- **[Account restrictions under Vinted's terms]**
  - Mitigations: only after a user click, no submit, human pacing, no API calls, no background activity.
  - Remote kill switch in server mode.
- **[Safari on iOS behaves differently]** (no OffscreenCanvas in older versions, a different picker UI on the mobile layout) → Feature detection with a canvas fallback. A separate mobile form map. Early device test (task 1.3).
- **[API key in the extension (OpenRouter mode)]** → It is the user's own key, kept in local extension storage only. Server mode avoids it entirely.
- **[Free Apple ID: re-sign every 7 days on iPhone]** → Accepted for personal use, or the Developer Program can be bought later.

## Migration Plan

Not applicable (new). Rollout:
1. Chrome on the computer with direct mode.
2. Safari on iPhone.
3. Optionally, the server on the Oracle VM.

## Open Questions

- The exact Vinted form structure on desktop and mobile. It is recorded during task 1 into the form map. This is configuration, not specification.
