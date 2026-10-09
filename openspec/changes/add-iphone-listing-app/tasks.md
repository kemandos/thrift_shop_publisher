# Tasks

## 1. Project setup and CI

- [ ] 1.1 Create Xcode project with iOS 26 app target `ThriftShop`, keyboard extension `ThriftKeyboard`, shared App Group, and local Swift package `ListingCore`; verify `xcodebuild -scheme ThriftShop -destination 'platform=iOS Simulator,name=iPhone 16' build` succeeds
- [ ] 1.2 Add GitHub Actions workflow: macOS job running `xcodebuild build test` for `ListingCore` and app, Linux job for backend tests; verify both jobs pass on a pushed commit
- [ ] 1.3 Add SwiftData model (Batch, Garment, Photo, Attributes with source/confidence, Listing) in `ListingCore`; verify a unit test saves and reloads a batch with in-memory storage
- [ ] 1.4 Set up String Catalogs (de, en) and listing-language resources (de, en); verify a unit test loads both language resources
- [ ] 1.5 Write README (architecture, build, CI, backend setup); verify a clean checkout builds by following only the README

## 2. Backend and AI proxy (spec: ai-backend)

- [ ] 2.1 Create Supabase project (EU region) with tables `users`, `entitlements`, `usage`, `config`, and migrations in repo; verify migrations apply to a fresh local Supabase
- [ ] 2.2 Implement App Attest verification in an Edge Function middleware; verify Deno tests accept a valid fixture assertion and reject a missing/invalid one
- [ ] 2.3 Implement `/analyze`: atomic reservation, Anthropic Messages call with structured output (model from config), schema validation with one retry, reservation release on failure; verify Deno tests with a mocked provider including the parallel-request scenario
- [ ] 2.4 Implement `/write` (text-only fallback) with the same checks but no quota decrement; verify Deno tests
- [ ] 2.5 Implement rate limit (30/min/user), usage/cost logging without content, and daily cost alert; verify tests and that logs contain no image or text payloads
- [ ] 2.6 Implement `ListingCore` API client with App Attest assertion, retry/backoff and German/English error messages; verify unit tests with `URLProtocol` stubs

## 3. Photo intake and grouping (specs: photo-intake, garment-grouping)

- [ ] 3.1 Implement PhotosPicker multi-select and in-app camera, 100-photo limit, duplicate detection; verify unit tests for limit/duplicates and manual test on device
- [ ] 3.2 Implement image preparation (orientation, ≤1280 px long edge, JPEG, metadata stripped); verify unit test that output has no GPS/EXIF and correct size
- [ ] 3.3 Implement on-device OCR + label detection + size parser (EU, international, W/L, kids); verify unit tests on fixture strings and ≥10 real label photos
- [ ] 3.4 Implement grouping (time gap + feature-print distance, label photos attach to nearest group, uncertainty flags); verify unit tests with synthetic data
- [ ] 3.5 Tune thresholds on a real set of ≥60 photos (≥12 garments); verify ≥90 % correct assignment, recorded in `docs/grouping-eval.md`
- [ ] 3.6 Build grouping UI (photo strips, drag between groups, merge, split, delete, reorder, cover, confirm); verify UI test for move and split, and persistence after relaunch

## 4. Analysis and listing text (specs: garment-analysis, listing-generation)

- [ ] 4.1 Write analysis prompt + JSON schema (Vinted categories, condition scale, "unknown" rule) in backend; verify schema tests against sample outputs
- [ ] 4.2 Implement analysis flow in app: progress, per-item failure/retry, merge rules (label OCR wins, manual values kept); verify unit tests with stubbed client
- [ ] 4.3 Build attribute UI with source/confidence badges, "Größe fehlt" flag and "Größe schätzen"; verify manually on 5 real garments
- [ ] 4.4 Implement on-device writer with Foundation Models (`@Generable` output, language/tone/length/emoji, footer) and cloud fallback via `/write`; verify unit tests for prompt rendering and that fallback triggers when the model is unavailable
- [ ] 4.5 Implement fact post-check (size/brand present and matching, unknowns absent) with one regeneration; verify unit tests with wrong stub outputs
- [ ] 4.6 Evaluate on 30 real items in DE and EN (cloud vs on-device writing); verify size accuracy ≥95 % where a label is photographed, zero invented sizes, and record text quality ratings in `docs/analysis-eval.md`

## 5. Editing and handoff (specs: listing-editing, vinted-handoff)

- [ ] 5.1 Build listing overview (status, sorting, filters) and detail editor with counters and language/tone switch; verify UI tests for status sorting and title limit
- [ ] 5.2 Implement "Veröffentlichen": write ordered photos to "Vinted" album (replacing previous content), write current listing to App Group, open Vinted link with App Store fallback; verify on device that album order is correct and Vinted opens
- [ ] 5.3 Implement keyboard extension (Titel/Beschreibung/Hashtags buttons, listing switcher, reference card, globe key, no network); verify on device that text is inserted into Vinted's fields and memory stays under the extension limit
- [ ] 5.4 Implement clipboard fallback buttons and the "Hochgeladen?" return prompt; verify UI test for clipboard content and manual test of the prompt
- [ ] 5.5 Verify the boundary: run a network capture during a full handoff and confirm no request to Vinted domains is made by app or keyboard

## 6. Onboarding and help (spec: onboarding-help)

- [ ] 6.1 Build first-run introduction (≤4 pages, skippable, DE/EN); verify UI test that it appears only on first launch
- [ ] 6.2 Implement coach marks for the first listing (TipKit + spotlight overlay); verify UI test that each step highlights the next control
- [ ] 6.3 Build keyboard setup guide with Settings deep link and activation detection; verify on device that "Tastatur ist aktiv" appears after enabling
- [ ] 6.4 Build first-handoff guide with recorded Vinted flow clips; verify it shows on first publish only and can be replayed from Help
- [ ] 6.5 Write FAQ content (DE/EN, topics from spec) and searchable Help screen; verify search finds "Größe" and "keyboard"

## 7. Billing (spec: subscription-billing)

- [ ] 7.1 Configure App Store Connect products (Basic/Pro monthly+yearly, 15-credit pack) and RevenueCat offerings; verify products load in sandbox
- [ ] 7.2 Implement trial grant with DeviceCheck bit and server-side allowance; verify on device that reinstall does not grant a second trial
- [ ] 7.3 Implement RevenueCat webhook → entitlements table (purchase, renewal, cancellation, credit pack); verify Deno tests with fixture webhooks
- [ ] 7.4 Build paywall (plans, terms, restore, privacy links) and usage display with low-balance notice; verify sandbox purchase and restore on device
- [ ] 7.5 Verify server-side enforcement: a request for a user with zero balance is rejected even when the app is modified to skip the client check

## 8. Release readiness

- [ ] 8.1 Write privacy policy, terms and Impressum (DE/EN), fill App Store privacy labels; verify links work from paywall and Help
- [ ] 8.2 Internal TestFlight with the first household user, one real selling session of ≥15 items; verify time per item and record feedback in `docs/feedback.md`
- [ ] 8.3 Closed beta with ~20 sellers; verify onboarding completion rate and trial-to-paid conversion are measured and reviewed

## Workflow follow-up

- Later changes: Mac target, more listing languages, on-device image analysis (iOS 27).
- Archive with `openspec archive add-iphone-listing-app` after launch.
