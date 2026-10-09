# Tasks

## 1. Setup and form discovery

- [x] 1.1 Create pnpm monorepo (`packages/shared`, `extension/` with WXT, `server/`, `ios/` placeholder), TypeScript strict, Vitest, ESLint; verify `pnpm -r build` and `pnpm -r test` pass in the dev container
- [x] 1.2 Add GitHub Actions running build, lint and tests on push; verify the workflow passes
- [ ] 1.3 With the owner, record Vinted's upload form structure on desktop Chrome and iPhone Safari (fields, picker behaviour, photo preview elements) into `docs/vinted-form.md` and an initial form map JSON; verify both layouts are covered

## 2. Shared schemas (specs: listing-ai, vinted-form-autofill)

- [x] 2.1 Define Zod schemas for listing attributes, AI requests/responses and the form map in `packages/shared`; verify unit tests accept valid and reject invalid samples
- [x] 2.2 Write prompts (analyse, refine, rewrite, pick-element) for Deutsch/English and four tones with facts-only and size/brand-evidence rules; verify prompt-rendering unit tests per language and tone

## 3. AI client (spec: listing-ai, extension-settings)

- [x] 3.1 Implement AI client with two transports: OpenRouter (background worker, Claude Haiku 5.5 for text, Jev Router for navigation, provider-neutral `LlmClient`) and own-server HTTP; verify unit tests with mocked transport for schema validation, one retry, and error message on second failure
- [x] 3.2 Implement usage/cost tracking per fill and per month; verify unit test for cost calculation from `usage`
- [ ] 3.3 Run a live evaluation on 10 real items (with labels and without) using the owner's key; verify sizes from labels are correct, no size is invented when no label is visible, and record results in `docs/ai-eval.md`

## 4. Form filling (spec: vinted-form-autofill)

- [x] 4.1 Build the fixture upload page (our own markup mirroring the recorded structure, desktop and mobile variants); verify it renders in Playwright
- [x] 4.2 Implement content script mounting only on the upload URL with the Shadow-DOM "✨ Ausfüllen" control, enabled only when photos are present; verify Playwright tests on fixture and on a non-matching URL
- [x] 4.3 Implement photo reading (preview images → downscaled JPEG, metadata stripped; file-input fallback); verify unit test on output size/metadata and Playwright test on fixture
- [x] 4.4 Implement fillers for text, textarea, price, picker-tree, picker-list and search-select per form map, with human pacing and value verification; verify Playwright test that all fixture fields are set and no submit happens
- [x] 4.5 Implement AI element picking fallback and per-field copy-button fallback; verify Playwright tests with a deliberately broken form map (AI stubbed) and with AI failure
- [x] 4.6 Implement language/tone switch and "Neu schreiben" refilling text only; verify Playwright test that photos are not re-sent

- [x] 4.7 Enforce "only a human publishes" in one guard (element snapshot, option lists, AI answers, every click, submit lock during fill, built-in words a remote map cannot remove); verify unit tests and a Playwright test with a misbehaving model
- [x] 4.8 Make the panel responsive (iPhone portrait/landscape, iPad incl. split view, Mac small to wide windows; touch sizes; collapse/dock remembered; hidden while the keyboard is open); verify a Playwright matrix over 9 formats

- [x] 4.9 Adapt pickers to vinted.de's real structure (div rows, search box, suggestions with paths, reused rows, "Wähle …" placeholders, "(empfohlen)" labels), scope options to the opened picker, add the fill log; verify a Vinted-like fixture variant
- [x] 4.10 Show the OpenRouter balance in popup and panel with a low-balance warning; verify unit tests

- [x] 4.11 Confirm every picker choice in the field, retry inner targets, recognise shown (pre-rendered) pickers, human-paced clicks and typing; verify a Vinted-like size grid in the fixture
- [x] 4.12 Own instruction in addition to the tone (settings default, per item in the panel), clothing text only, links/e-mails stripped; verify prompt, schema and e2e tests

- [x] 4.13 Wait for Vinted's own category/brand detection; category by level-wise classification when not detected (no search, bounded); brand only on exact match; own instruction in the panel; closing text removed; faster pacing; verify fixture auto-detection and classification tests

- [x] 4.14 Analysis decides the category (Vinted's own choice kept only if it agrees); direct selection without extra AI calls (Vinted names in the path, similar-name matching, AI only per unmatched level); dependent fields only after the category; extra fields like "Rocklänge"; price typed and compared by amount; verify fixture tests for a wrong Vinted category, suggestions and extras

- [x] 4.15 From the vinted.de log: size tabs (ESP 42 → FR 42), brand links clickable without navigation, help rows excluded, radio/checkbox first, multi-select retried only while unticked, specific category leaf over "Sonstiges"; verify fixture mirrors and unit tests

- [x] 4.16 From the second vinted.de log: precise analysis prompt (labels in any language, material/colours in Vinted's German names, size with country codes, brand label vs company name, skort → Shorts), ESP/EUR → EU tab, prefixed size chips, size never guessed, brand searched even when the list starts empty, material from Vinted's suggestion without a label; verify tests

## 5. Settings and Chrome release (spec: extension-settings)

- [x] 5.1 Build popup (Artikel verkaufen, last cost, month total) and options page (AI mode, key with test, server URL/token, language and tone lists, closing texts); verify unit/UI tests and masked key display
- [x] 5.2 Implement the one-time notice gating the first fill; verify Playwright test
- [ ] 5.3 Package for Chrome and install unpacked on the owner's computer; verify a real listing is filled on vinted.de and uploaded by the owner, recorded in `docs/feedback.md`

## 6. iPhone (spec: ios-companion)

- [ ] 6.1 Convert the extension for Safari and create the minimal SwiftUI container app with App Group; verify it builds on the owner's Mac (or CI macOS runner)
- [ ] 6.2 Implement settings sharing via App Group and native messaging; verify on device that a key saved in the app is used by the Safari extension
- [ ] 6.3 Implement the setup guide with extension-enabled detection and "vinted.de öffnen"; verify on device
- [ ] 6.4 Test the mobile layout on the owner's iPhone; verify a real listing is filled in Safari and uploaded by the owner

## 7. Optional server on Oracle VM

- [ ] 7.1 Implement Hono server (`/analyze`, `/refine`, `/rewrite`, `/pick-element`, `/form-map`) with bearer-token auth, no persistence of photos/text, usage counts in a JSON file; verify unit tests and a local Docker run
- [ ] 7.2 Add Docker Compose with Caddy (HTTPS) and deploy notes for the Oracle VM in `server/README.md`; verify `curl` against the deployed `/form-map` with token succeeds and without token fails
- [ ] 7.3 Switch both devices to server mode; verify fills work and no OpenRouter key remains in the extension

## Workflow follow-up

- Archive with `openspec archive add-vinted-autofill-extension` once Chrome and iPhone are in regular use.
