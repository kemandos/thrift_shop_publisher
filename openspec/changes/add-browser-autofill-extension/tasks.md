# Tasks

## 1. Feasibility spikes (decide scope before building)

- [ ] 1.1 On a logged-in vinted.de in desktop Chrome, prototype a content script that fills title, description, one picker (condition) and 2 photos via `DataTransfer`; verify the item preview shows all values and photos without submitting, and record the form structure in `docs/vinted-form-map.md`
- [ ] 1.2 On iPhone Safari, check whether vinted.de offers the upload form when logged in, and run the same prototype as a Safari Web Extension; verify text and photo filling, and record go/no-go for iOS in `docs/vinted-form-map.md`

## 2. Extension foundation (spec: browser-autofill)

- [ ] 2.1 Create `extension/` with WXT (TypeScript, MV3), targets Chrome and Safari; verify `npm run build` produces both bundles and unit tests run with Vitest
- [ ] 2.2 Implement content script limited to `vinted.*/items/new*` with Shadow-DOM draft panel; verify via unit tests that the panel never mounts on other URLs
- [ ] 2.3 Implement remote form map loader (versioned JSON, schema-validated, data only) and health check; verify tests for valid map, missing selector → fallback, invalid map rejected
- [ ] 2.4 Implement fillers: text (native setter + events), pickers (step sequences), photos (`DataTransfer`, order, ≤20); verify with a local fixture page that mimics the recorded form and a Playwright test that asserts all fields set and no submit click
- [ ] 2.5 Implement fallback panel (copy buttons, photo download) and "Als hochgeladen markieren"; verify Playwright test on fixture with broken selectors
- [ ] 2.6 Implement opt-in notice and remote kill switch; verify tests that autofill stays off until consent and when the kill switch is set

## 3. Sync (spec: listing-sync)

- [ ] 3.1 Add Supabase Auth with Sign in with Apple to iOS app and extension; verify sign-in on both with the same Apple ID yields the same user
- [ ] 3.2 Add tables/storage with row-level security for synced drafts (EU region); verify tests that another user cannot read a draft
- [ ] 3.3 Implement iOS "Am Computer einstellen" toggle and upload of ready drafts (fields + originals); verify only "Fertig" drafts upload and nothing uploads when off
- [ ] 3.4 Implement deletion: on "Auf Vinted", on draft delete, 14-day job, and "Konto und Daten löschen"; verify Deno tests and a manual check of storage
- [ ] 3.5 Update privacy policy (DE/EN) for synced photos; verify link from the sync toggle

## 4. Safari (iOS and macOS)

- [ ] 4.1 Wrap the extension for Safari iOS inside the app; implement `SafariWebExtensionHandler` native messaging reading drafts/photos from the App Group; verify on device that drafts appear without network
- [ ] 4.2 Wrap for Safari macOS (small Mac container app) using account sync; verify on a Mac
- [ ] 4.3 Add onboarding in the iOS app explaining how to enable the Safari extension (Settings → Apps → Safari → Erweiterungen); verify the guide shows when the extension is not enabled

## 5. Release

- [ ] 5.1 Household beta: list ≥15 items via Chrome and (if 1.2 is go) iPhone Safari; verify fill success rate ≥90 % and record issues in `docs/feedback.md`
- [ ] 5.2 Publish to Chrome Web Store (single purpose, vinted.* host permission only) and ship Safari extensions with the app update; verify store approval and install from store

## Workflow follow-up

- Archive after release with `openspec archive add-browser-autofill-extension`.
