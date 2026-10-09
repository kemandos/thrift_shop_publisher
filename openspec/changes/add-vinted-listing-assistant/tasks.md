# Tasks

## 1. Project setup

- [ ] 1.1 Create Xcode project with macOS 14+ app target `ThriftShop-macOS` and local Swift package `ListingCore`; verify `xcodebuild -scheme ThriftShop-macOS build` and `swift test` in `ListingCore` both succeed
- [ ] 1.2 Add SwiftData model (`Batch`, `Group`, `Photo`, `Attributes` with per-field value/source/confidence, `Listing`) in `ListingCore`; verify a unit test creates, saves and reloads a batch with in-memory storage
- [ ] 1.3 Add README with build/run instructions and API-key setup; verify a clean checkout builds following only the README

## 2. AI provider settings (spec: ai-provider-settings)

- [ ] 2.1 Implement Keychain wrapper for API keys (save, read, delete, masked display); verify unit tests and that no key appears in UserDefaults or logs
- [ ] 2.2 Define `AIProvider` protocol and central model table (id, display name, prices); verify defaults resolve to Anthropic + `claude-haiku-5-5` in a unit test
- [ ] 2.3 Implement `AnthropicProvider` HTTP client (`POST /v1/messages`, image + text content, structured output) with Codable types; verify with `URLProtocol` stub tests for request shape and response parsing
- [ ] 2.4 Implement retry policy (408/429/5xx/network, max 3, backoff, `retry-after`) and German error mapping; verify stub tests for rate-limit retry and invalid-key error
- [ ] 2.5 Implement usage/cost tracker (per call tokens → EUR estimate, monthly total, confirmation threshold); verify unit tests for cost calculation
- [ ] 2.6 Implement `OpenAIProvider` behind the same protocol (vision input, JSON-schema output); verify `URLProtocol` stub tests for request shape and parsing, and one manual run with a real OpenAI key
- [ ] 2.7 Build Settings screen (provider, model, key field, "Verbindung testen", cost threshold, default tone, closing text); verify manually with a real key that test connection succeeds and an invalid key shows "API-Schlüssel ungültig"

## 3. Photo intake and grouping (specs: photo-intake, garment-grouping)

- [ ] 3.1 Implement Photos picker import (multi-select, limited access) and file/folder/drag-drop import with type filtering, 200-photo limit and duplicate detection; verify unit tests for limit/duplicates and manual import of a mixed folder
- [ ] 3.2 Implement image preparation (orientation, ≤1568 px long edge, JPEG 0.8, metadata stripped, thumbnail cache); verify a unit test that output has no GPS/EXIF and correct dimensions
- [ ] 3.3 Implement on-device OCR and label-photo detection with size-token parser (EU/international/W-L/kids); verify unit tests on a fixture set of label photos and size strings
- [ ] 3.4 Implement sequential grouping (time gap T, feature-print distance D, label photos attach to nearest group, "bitte prüfen" flags) in `ListingCore`; verify unit tests with synthetic timestamps/distances and a fixture batch
- [ ] 3.5 Collect a test set of ~50 real photos (≥10 garments) and tune T and D; verify ≥90 % of photos land in the correct group, recorded in `docs/grouping-eval.md`
- [ ] 3.6 Build grouping UI (photo strips, drag between groups, merge, split "Neuer Artikel", remove, cover/order, "Gruppen bestätigen"); verify manually that each correction action works and persists after restart

## 4. Garment analysis (spec: garment-analysis)

- [ ] 4.1 Write analysis system prompt (German, Vinted categories and condition scale, "unbekannt" rule) and JSON schema; verify the schema validates sample outputs in a unit test
- [ ] 4.2 Implement analysis use case: send group photos + OCR hint, merge result with label-parsed size (label wins) and keep manual overrides; verify unit tests for merge rules with stubbed provider
- [ ] 4.3 Implement batch analysis with progress, per-group failure and retry, and pre-run cost estimate; verify a stub test where one group fails and others succeed
- [ ] 4.4 Build attributes UI with source/confidence badges, highlight of low-confidence fields, "Größe fehlt" flag, manual edit and optional "Größe schätzen"; verify manually on 5 real garments
- [ ] 4.5 Run analysis on the test set with Haiku 5.5 and Sonnet 5.5; verify size accuracy on items with label photos is ≥95 % and no size is invented for items without one, recorded in `docs/analysis-eval.md`

## 5. Listing generation (spec: listing-generation)

- [ ] 5.1 Write writing prompt and tone resources (Sachlich, Freundlich, Locker & jung, Hochwertig) with length and emoji options; verify prompt rendering unit tests per option
- [ ] 5.2 Implement writing use case (text-only call, title length limit, closing text and per-item note appended verbatim, emoji stripping when off); verify unit tests with stubbed provider
- [ ] 5.3 Implement fact post-check (size/brand in text match attributes, unknown attributes not mentioned) with one automatic regeneration; verify unit tests with deliberately wrong stub outputs
- [ ] 5.4 Implement regenerate title/description independently with overwrite confirmation for manually edited text; verify manually
- [ ] 5.5 Show price hint labelled "Preisvorschlag (Schätzung)"; verify it appears for a generated listing

## 6. Review and export (spec: listing-review-export)

- [ ] 6.1 Build listing overview with status (Prüfen, Entwurf, Fertig, Eingestellt), sorting and filters; verify manually that items with missing size appear under "Prüfen" first
- [ ] 6.2 Build detail editor for all fields with live character counters and "Fertig" blocked when title is too long; verify manually
- [ ] 6.3 Implement copy buttons (Titel, Beschreibung, Keywords, Titel + Beschreibung); verify clipboard contents in a UI test
- [ ] 6.4 Implement folder export (01.jpg… with cover first, listing.txt with all fields, no API key or metadata); verify unit test on generated folder contents
- [ ] 6.5 Implement "Eingestellt" marking and hidden-by-default filter; verify manually and after app restart

## 7. End-to-end verification

- [ ] 7.1 Run a full session with a real batch of ≥20 photos from import to export, timing it; verify all spec scenarios marked manual pass and the total cost shown matches the provider's usage dashboard within ±20 %
- [ ] 7.2 Hand the app to the actual user for one real selling session and record feedback in `docs/feedback.md`; verify issues are triaged into follow-up changes

## Workflow follow-up

- Phase 2 (separate change): add the iOS target + TestFlight distribution.
- Archive this change with `openspec archive add-vinted-listing-assistant` once the MVP is accepted.
