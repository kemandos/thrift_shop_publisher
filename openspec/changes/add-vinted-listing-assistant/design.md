# Design

## Context

Greenfield repository; nothing exists yet besides OpenSpec scaffolding. See `proposal.md` for motivation and `specs/` for the behaviour contract.

Constraints that shape the design:

- One real user (a private Vinted seller) on a Mac; she takes the photos with an iPhone, and they reach the Mac through iCloud Photos.
- No server we operate. The app talks directly to an AI provider with the user's own API key.
- Running cost should stay at cents per batch.
- The iPhone version should be reachable later without a rewrite.

## Goals / Non-Goals

**Goals:**
- A Mac app that turns a pile of photos into reviewed, copy-ready German Vinted listings in a few minutes.
- Core logic (grouping, prompts, provider clients, data model) shared between macOS and iOS from day one.
- AI provider can be swapped (Anthropic / OpenAI) without touching UI code.

**Non-Goals:**
- Posting to Vinted, scraping Vinted, or automating the Vinted app or website. There is no public API, and automation would breach Vinted's terms.
- Background photo monitoring or automatic import.
- Multi-user accounts, sync between devices (beyond what iCloud Photos already does), Android, Windows.
- Image editing (background removal, light correction). This could be added later.

## Decisions

### D1 — Native SwiftUI multiplatform app, macOS first, iOS via TestFlight later

One Xcode project with a local Swift package `ListingCore` (models, grouping, image prep, prompts, provider clients) and two thin app targets (`ThriftShop-macOS`, later `ThriftShop-iOS`).

- **Why:** On-device Apple Vision gives free, offline OCR (size labels) and image similarity (grouping). PhotosUI gives a native Photos picker on both platforms. The Keychain stores keys properly. Distribution to a single Mac needs no paid account. For iPhone, TestFlight needs the Apple Developer Program (99 €/year). Without it, a free Apple ID can still install from Xcode, but the app expires after 7 days.
- **Alternatives considered:**
  - *Web app / PWA*: runs everywhere with no app store, but needs hosting and an exposed or proxied API key. Photos-library access and on-device OCR/similarity are much weaker. Rejected for the MVP; still the fallback if Android ever matters.
  - *Electron/Tauri*: cross-platform desktop, but no good iOS path and no free on-device Vision. Rejected.
  - *Python CLI/script*: fastest to build, but not usable by a non-technical user, and grouping corrections need a GUI. Rejected.
  - *No app, just a Claude.ai Project with custom instructions*: uses the existing Claude subscription at no extra cost and takes 10 minutes to set up. But photos must be grouped by hand and uploaded per item, and there is no persistence or export. It is a good **stopgap until the app exists**, and the prompts in D4 can be reused as its instructions. It does not meet the grouping and export specs.

### D2 — Use the AI provider's API with a personal API key; Claude subscription is not usable as the backend

A Claude.ai Pro/Max subscription covers the Claude apps and Claude Code. It does **not** include API access for third-party apps, and API usage is billed separately through the Anthropic Console (prepaid credits). "Claude Instant" is a retired model and is not an option. The app therefore uses the Messages API with a key stored in the Keychain.

- **Why:** This is the only supported way for our own app to call Claude. The cost at this scale is negligible (see D3).
- **Alternative:** OpenAI API with a vision-capable mini model. It is implemented behind the same protocol so the user can choose; the cost is in the same range.

### D3 — Default model: Claude Haiku 5.5; Claude Sonnet 5.5 as "Beste Qualität"

| Model | Input $/MTok | Output $/MTok | Est. cost per garment* |
|---|---|---|---|
| Claude Haiku 5.5 (`claude-haiku-5-5`) | 0.10 | 0.50 | ≈ $0.001 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | 2.00 | 10.00 | ≈ $0.02 |

*About 4 photos at ~1,500 input tokens each, plus prompt and ~800 output tokens for analysis and text.

- **Why:** Haiku 5.5 supports vision and structured outputs, and costs about 0.1 ct per garment, so 100 items cost about 10 ct. Sonnet 5.5 is offered for hard cases (blurry labels, unusual brands) and costs about 2 ct per garment. Model IDs live in one config table, so updating to newer models is a one-line change. Prices are shown from that table and must be checked against the provider's pricing page when it is updated.
- **Alternative:** Opus-tier models. Rejected: 40× the cost of Haiku with no meaningful gain for this task.

### D4 — Two-step AI pipeline: analyse once (with images), write many times (text only)

1. **Analyse** (per group, images + OCR hints → JSON): one Messages API call with the group's downscaled photos, the on-device OCR text, and a system prompt. The response is constrained to a JSON schema via structured outputs (`output_config.format`): category, item type, brand, size {value, system, source}, colours, material, pattern, condition, defects[], confidence per field, price range.
2. **Write** (per garment, attributes + style → text): a second, text-only call with the confirmed attributes, tone, length, emoji flag and seller notes. It returns JSON {title, description, keywords[]}.

- **Why:** Changing the tone or regenerating text never re-sends photos, so it is nearly free and fast. User-edited attributes become the source of truth for writing, which enforces "only facts present in the attributes" (listing-generation spec). The analysis prompt explicitly says to return `"unbekannt"` instead of guessing.
- **Settings:** analysis at effort `medium` (Haiku 5.5's default), writing at effort `low`. Thinking stays adaptive (the default). Calls are non-streaming with `max_tokens` around 4,000; they are short structured responses.
- **Alternative:** a single call that does everything. Rejected because every tone change would re-upload images and mix facts with style.

### D5 — On-device Vision for OCR and grouping

- **OCR:** `VNRecognizeTextRequest` (languages de, en; accurate mode) runs on every photo at import. Photos with dense label-like text (size tokens matching patterns such as `XS–XXL`, `EU 34–52`, `W\d{2} L\d{2}`, kids' sizes `50–176`, or "cm", "%", "Baumwolle", "Polyester") are tagged as *label photos*. The extracted text goes into the analysis call as a hint, and a regex-parsed size from a label wins over a model guess. Source = "Etikett".
- **Grouping:** this is a sequential clustering over capture-time order.
  1. Start a new group when the time gap to the previous photo is greater than *T* (default 90 s) **or** the Vision feature-print distance (`VNGenerateImageFeaturePrintRequest`) to the current group's centroid is greater than *D*.
  2. Label photos never start a group. They attach to the time-nearest garment group.
  3. Photos whose distance is close to *D* (within 15 %) or close to two groups are flagged "bitte prüfen".
  4. *T* and *D* are tuned on a test set of the user's real photos (task 3.5) and can be adjusted in settings.
- **Why:** This is free, offline and fast, and it matches how people shoot ("all photos of one item, then the next").
- **Alternative:** ask the LLM to group all thumbnails. Rejected for the MVP because of cost and latency with 100+ photos, and because it is non-deterministic. It could become an optional "KI-Gruppierung prüfen" button later.

### D6 — Image preparation

Before upload, each photo is EXIF-orientation corrected, downscaled so the long edge is ≤ 1,568 px, and re-encoded as JPEG (quality 0.8). All metadata (GPS, device, timestamps) is stripped, and the image is sent base64-encoded inline. Originals are never modified. This keeps token cost predictable, which matters because image tokens scale with pixel count, and satisfies the data-minimisation requirement.

### D7 — Persistence: SwiftData + app-container image cache

- **Model:** `Batch` → `Group` (garment) → `Photo`. Each garment also holds `Attributes` (per-field value/source/confidence) and `Listing` (title, description, keywords, tone, status, price, isManuallyEdited flags).
- **Photos:** Photos-library items are referenced by `PHAsset` local identifier. File imports are copied into the app container. A downscaled copy and a thumbnail are cached in both cases.
- **Why:** This is the platform-native choice with zero setup. CloudKit sync can be switched on later if the iPhone app needs shared drafts.

### D8 — Provider abstraction over raw HTTPS

The protocol is `AIProvider { analyse(group) async throws -> Attributes; write(attributes, style) async throws -> ListingText; testConnection() }`. It has two implementations, `AnthropicProvider` (`POST /v1/messages`) and `OpenAIProvider`, both on `URLSession`. Neither provider ships an official Swift SDK, so we use plain REST with Codable request/response types. One retry policy covers both: retry on 408/429/5xx/network errors, up to 3 attempts with exponential backoff, honouring `retry-after`. The policy is unit-tested with `URLProtocol` stubs. Each call records token usage from the response for the cost tracker.

### D9 — Prompts as versioned resources

System prompts (German instructions, tone definitions, few-shot examples of good Vinted listings) live as text resources in `ListingCore/Resources/Prompts/`, with a version number stored alongside each listing. Tone definitions are data (name, description, example sentence), so new tones need no code changes.

### D10 — UI shape (macOS)

A three-column `NavigationSplitView`:

1. **Batches / filters** (Prüfen, Entwurf, Fertig, Eingestellt).
2. **Garment groups** as photo strips, with drag & drop between groups.
3. **Detail:** photo carousel, attributes with confidence badges, tone/length/emoji controls, editable title and description with counters, and copy/export buttons.

Toolbar: "Fotos hinzufügen", "Gruppen bestätigen", "Alle analysieren (≈ x €)".

## Risks / Trade-offs

- [Grouping errors when items are shot in an interleaved way or against the same background] → Similarity plus time with conservative thresholds; "bitte prüfen" flags; fast drag & drop correction; thresholds tuned on real photos.
- [Size label not photographed] → Explicit "Größe fehlt" status; an in-app hint during onboarding, "Immer ein Foto vom Etikett machen"; a manual size picker.
- [Model invents facts in descriptions] → Writing only sees confirmed attributes; the prompt forbids additions; a post-check verifies that size/brand in the text match the attributes and regenerates once on mismatch.
- [Model names/prices change] → Central model table; prices only used for estimates and labelled "ca.".
- [API key leaked] → Keychain only; never logged; excluded from exports and crash logs.
- [Vinted title/description limits or categories change] → Limits and category list are configuration, not code.
- [Apple Developer fee for iPhone] → The Mac MVP needs no fee; the iOS phase is optional and decided later.

## Migration Plan

Not applicable (new app). Rollout:

1. Build the macOS MVP (Anthropic as default, OpenAI as an alternative).
2. Use it with real batches and tune grouping and prompts.
3. Optional: iOS target + TestFlight, as a separate change.

## Open Questions

- Exact current Vinted title/description length limits and category tree. These are configuration values and can be filled in during implementation without changing specs.
- Final app name and icon.
- Whether the Developer Program membership is worth it for the iPhone phase. This is decided after the Mac MVP is in use.
