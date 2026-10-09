# Design

## Context

Greenfield repository. See `proposal.md` for motivation and `specs/` for the behaviour contract. Research results (October 2026) that shape this design:

- **Vinted:** no listing API for private sellers. Vinted Pro Integrations exists, but it is business-only and allowlisted, and it needs public photo URLs. Vinted's terms ban unauthorised "external software tools (including … bots)", and Vinted uses DataDome bot detection; Crosslist reported 24-hour suspensions in 2026. iOS apps cannot fill in fields of another app. Vinted's `apple-app-site-association` file claims all paths, so any `https://www.vinted.de/...` link opens the Vinted app.
- **Competitors:**
  - PreLoved AI (iOS): £4.99 for 20 listings to £29.99 for 1,000 per month; hands off via the Vinted app.
  - VintyLook: €3.49 for 10 credits.
  - Fripio: planned at €7.99–49.99; not live.
  - None groups a whole batch of photos into items. None posts automatically.
- **Claude Haiku 5.5:** supports image input (high-resolution tier for Claude 4.7 and later models). Price: $0.10 per million input tokens and $0.50 per million output tokens. An image costs ⌈w/28⌉·⌈h/28⌉ tokens.
- **Apple Foundation Models (on-device):**
  - Needs iOS 26+ on Apple Intelligence devices (iPhone 15 Pro and later).
  - German is supported.
  - The context window is roughly 4K tokens. Apple's docs say 4,096; one sample shows 8,192.
  - Image input arrives in iOS 27.
  - It is weak on world knowledge, such as brand names.

## Goals / Non-Goals

**Goals:**
- A native iPhone app that a non-technical seller completes their first listing with, guided, in under 5 minutes.
- AI cost well below 1 ct per listing, and server cost close to zero at small scale.
- An architecture that can later add a Mac target without rework.

**Non-Goals:**
- Posting to Vinted, Vinted Pro Integrations, Vinted's private API, Safari/browser extensions that fill Vinted's web form.
- Android, web app.
- User accounts with e-mail/password.
- Image editing (background removal, virtual models). Possible later.

## Decisions

### D1 — Native Swift/SwiftUI, not Expo (and not "Expo first, Swift later")

- **Structure:** one Xcode project with three parts.
  - `ThriftShop` iOS app: iOS 26+, SwiftUI, SwiftData. iOS 27 features are gated with `#available`. Built with Xcode 27 / Swift 6.4, using buildable folders.
  - `ThriftKeyboard`: a keyboard extension.
  - `ThriftShare`: a share extension, "Inserat erstellen" from Photos.
  - `ListingCore`: a Swift package with models, grouping, image preparation, the API client and prompt and locale resources. The platform-neutral parts build and test on Linux (`swift test`). Details: `docs/ios27-research.md`.
- **Why native:**
  - About 40% of the product needs native iOS code whatever stack is chosen: the keyboard extension, on-device Vision OCR and feature prints, Foundation Models, PhotoKit album writing, App Attest/DeviceCheck and StoreKit.
  - In Expo, all of these would be Swift modules anyway, plus the bridging work between TypeScript and Swift.
  - Native gives the smoothest photo grids and drag & drop, and the smallest memory footprint for keyboard extensions. Keyboard extensions have a tight memory limit.
- **Alternatives considered:**
  - *Expo/React Native + EAS*: builds and ships to TestFlight from the cloud with no Mac. Fine performance for the screens (lists, forms, network). Rejected because of the native-heavy parts above.
  - *Expo MVP, then a Swift rewrite*: only the backend, prompts, schemas, specs and design work would carry over, about 30–40%. All UI, state and on-device logic would be written twice. Rejected: if Swift is the destination, start there.
  - *PWA*: no keyboard extension, no Photos album, weak native feel. Rejected.
- **Consequence:** Mac or CI builds are required (see D10).

### D2 — Hybrid AI: on-device first, cloud for vision analysis

| Step | Where | Why |
|---|---|---|
| Photo grouping | On-device: capture time + Vision feature prints | Free, offline, private |
| Label OCR and size parsing | On-device: Vision `RecognizeTextRequest` / `RecognizeDocumentsRequest` | Free; an exact size from the label beats a model guess |
| Garment analysis (type, category, brand, colour, material, condition, defects, price) | **Cloud: Claude Haiku 5.5 via our backend**, photos + OCR text, structured JSON | Needs broad knowledge (brands, garment types), and must work on every iPhone |
| Writing title, description and hashtags; language, tone and length changes | **On-device Foundation Models** when available; otherwise cloud Haiku 5.5 (text-only) | Free regeneration; language switches never resend photos |

- **Analysis cost**, with images downscaled to ≤ 1280 px on the long edge (1280×960 ≈ 1,610 tokens):
  - Input: 4 photos ≈ 6.4K tokens, plus about 1.5K tokens of prompt and OCR text, ≈ 8K tokens ≈ $0.0008.
  - Output, including thinking: ≈ 800 tokens ≈ $0.0004.
  - A cloud writing call, when needed: ≈ $0.0005.
  - **Total ≈ 0.15–0.2 ct per listing.** A power user with 500 listings a month costs about €1.
- **Private Cloud Compute (iOS 27, `PrivateCloudComputeLanguageModel`)** is the preferred free server model for writing on eligible devices that lack enough on-device quality. It is free for Small Business Program developers with fewer than 2M downloads, needs a managed entitlement, and users have a daily quota. Request the entitlement after enrolling.
- **On-device image input (iOS 27)** is an experiment behind a feature flag. The analysis may move on-device for eligible devices once tests show it reaches the quality of the cloud model.

### D3 — Backend: Supabase Edge Functions + Postgres

- **Endpoints:** `POST /analyze` (images + OCR hints → attributes JSON) and `POST /write` (attributes + language/tone → text, used when Foundation Models is unavailable).
- **Request checks**, in order:
  1. Verify the App Attest assertion.
  2. Resolve the user from the RevenueCat app user ID.
  3. Atomically reserve 1 listing in Postgres with a row lock: `UPDATE … SET remaining = remaining - 1 WHERE remaining > 0`.
  4. Call Anthropic `POST /v1/messages` with structured output (`output_config.format`), model `claude-haiku-5-5`, effort `medium`.
  5. Validate the response against the schema and retry once.
  6. On failure, give the reservation back.
- **Configuration:** model and provider are read from a config table (ai-backend spec).
- **What is logged:** token counts and cost only, never images or text.
- **Why Supabase:** auth, Postgres and functions in one place, a free tier, an EU region (Frankfurt), and TypeScript/Deno functions that can be tested in a Linux container.
- **Alternative:** Cloudflare Workers + D1. Equally viable; rejected only to keep one vendor.

### D4 — Identity, trial and anti-abuse

- **Identity:** an anonymous RevenueCat app user ID stored in the Keychain. Keychain items survive a reinstall on the same device. No account and no e-mail.
- **One-time trial:** Apple **DeviceCheck** offers 2 persistent bits per device. Bit 0 means "trial granted". The backend sets the bit when it grants the 10 trial listings and refuses a second trial for that device even after a reinstall or a new Keychain.
- **App Attest:** every AI request carries an assertion, so scripts cannot use the proxy.

### D5 — Pricing (initial values, configured in App Store Connect)

| Product | Price | Allowance | Apple cut (15%, Small Business Program) | Max AI cost |
|---|---|---|---|---|
| Trial (one-time) | free | 10 listings | – | ≈ €0.02 |
| Basic monthly / yearly | €4.99 / €39.99 | 40 per month | €0.75 / €6.00 | ≈ €0.08 per month |
| Pro monthly / yearly | €9.99 / €79.99 | 500 per month (fair use) | €1.50 / €12.00 | ≈ €1 per month |
| Credit pack (consumable, never expires) | €2.99 | 15 listings | €0.45 | ≈ €0.03 |

- **Positioning:** below PreLoved AI's 250-listing plan at £12.99, and above throwaway credit apps.
- **Plumbing:** StoreKit 2 via **RevenueCat**, free up to $2.5k in monthly revenue. A RevenueCat webhook updates the plan and allowance in Postgres.
- **Why a trial of 10 listings, not 7 days:** AI cost is per listing, and 10 items is enough to show the value.
- **Why Apple's own purchases:** EU link-out payments would save part of the cut, but add Stripe, a web checkout and DMA paperwork. That is deferred until revenue justifies it.

### D6 — "Veröffentlichen" handoff and keyboard extension

1. **Write the photos:** PhotoKit writes the item's photos in order to the album "Vinted". The album is emptied first, and only its album membership is removed; the user's original photos are never deleted.
2. **Hand the listing to the keyboard:** the current listing (title, description, hashtags, reference values) is written to the **App Group** container that the keyboard reads.
3. **Open Vinted:** `UIApplication.open(URL("https://www.vinted.de/items/new"))` uses the universal link, which opens the Vinted app. If the app does not land on the Sell screen, the guide tells the user to tap "Verkaufen". If the link cannot be opened, fall back to the App Store page.
4. **Keyboard:** buttons Titel, Beschreibung, Hashtags, a listing switcher and a reference card. It uses `textDocumentProxy.insertText`, which is standard keyboard behaviour, so to Vinted it looks like typing. A globe key switches back to the system keyboard. The keyboard has no network access and no logging.
5. **Return:** when the app becomes active again after a handoff, it asks "Hochgeladen?".

The keyboard must read the App Group container. That requires **"Allow Full Access"**, and iOS shows a privacy warning for it. App Review guideline 4.4.1 requires the keyboard to keep working without Full Access. It is therefore a complete QWERTZ/QWERTY typing keyboard with a listing bar on top. Without Full Access, the bar explains how to enable it instead of inserting text. The keyboard never opens other apps. The onboarding explains why: "the keyboard only reads your prepared listings and sends nothing". The privacy policy says the same.

### D6b — Adding photos

A single "Fotos hinzufügen" button (a glass button in the toolbar, and the empty-state button) opens a menu with three entries:
- **Aus Mediathek:** `PhotosPicker`, multi-select.
- **Foto aufnehmen:** the in-app camera.
- **Einfügen:** SwiftUI `PasteButton`, accepting `Image`/`Data` from the pasteboard. The system paste control needs no "allow paste" prompt.

Two more paths:
- **Drag and drop** (`.dropDestination(for: Data.self)`) onto the batch or a group.
- **Share extension** "Inserat erstellen" from Photos (D1).

### D7 — Onboarding implementation

- The introduction is a paged SwiftUI view.
- Coach marks use TipKit (`Tip` with rules for "first listing" events) and a custom spotlight overlay.
- The keyboard setup screen deep-links to the app's Settings page (`UIApplication.openSettingsURLString`). It detects activation by checking `UITextInputMode.activeInputModes` for our bundle.
- The handoff guide uses short looping screen recordings of the Vinted flow, recorded with Vinted's UI. These must be re-recorded if Vinted's UI changes.
- FAQ content is a localized Markdown resource, so it can be updated without code changes.

### D7b — Visual design rules (Liquid Glass, iOS 26/27)

These rules come from the HIG (Materials, Color, Layout, Generative AI), NN/g and measured iOS 26 values. The mockups are on the design canvas, page "Liquid Glass (neu)".

**Glass and colour**
- Glass is used only on the navigation layer: the floating tab bar, toolbar circles and sheets. Content, cards and list cells never use glass.
- One tinted control per screen, which is the primary action. Everything else is monochrome.
- The accent is system blue (#0088FF). Orange and violet are never used.
- Photos provide the colour.

**Navigation and layout**
- Large title (34 pt bold) and system inset-grouped lists: 26 pt corner radius, 52 pt rows, 16 pt margins, sentence-case section headers.
- Floating tab bar: Entwürfe, Auf Vinted, Einstellungen. A separate prominent "+" opens the add-photos menu: Mediathek, Foto aufnehmen, Einfügen.
- One main task per screen. Secondary options sit in menus or sheets: language and tone are lists with checkmarks in a "Text anpassen" sheet. Details sit behind chevrons.

**AI text**
- One quiet "KI-Vorschlag" line per listing, with an "Anpassen" link.
- Uncertain items get a small "?" badge, not coloured boxes.

**Keyboard**
- A system-like keyboard: German layout, globe key, 44 pt keys.
- On top, one row of capsules: Titel, Beschreibung, Hashtags, and an info button for the reference values.

### D8 — Localization

- **Listing languages:** exactly **Deutsch and English**, chosen from a list with a checkmark in Settings (default) and per listing. Each language is data in `ListingCore/Resources/Languages`: a prompt template, a title pattern, a size-label vocabulary and hashtag style.
- **App UI** is localized with String Catalogs (de, en).
- **Language preferences:** the default listing language follows the user's setting, which is initially the device language. It is stored per listing.

### D9 — Data model (SwiftData, on device)

- `Batch` → `Garment` → `Photo`. A photo holds a PHAsset identifier plus a cached downscaled copy.
- `Attributes`: each field has a value, a source and a confidence.
- `Listing`: language, tone, title, description, hashtags, edited flags and status.
- **Backups:** none on our servers. Drafts are in the user's device backups (iCloud).

### D10 — Build, test and CI without relying on one local Mac

- **CI (GitHub Actions):**
  - The macOS job runs `xcodebuild build test` for `ListingCore` and the app on the iOS Simulator for every push. This lets cloud-based development (including Claude Code on the web) see compile and test results.
  - A Linux job runs Deno unit tests for the Edge Functions.
- **TestFlight:** Xcode Cloud, with 25 hours per month included in the Developer Program, or local Xcode on the owner's Mac.
- **Free Apple ID phase:** In-App Purchase, App Attest and TestFlight are unavailable. Debug builds use an allow-listed development token in place of App Attest, purchases are tested with a `.storekit` file in the Simulator, and device installs are re-signed every 7 days.
- **What needs a physical iPhone:** testing the keyboard, the Vinted handoff, App Attest and purchases. The Simulator cannot do App Attest or real purchases.

## Risks / Trade-offs

- [Vinted changes its app, its link handling or its policy on helper apps] → The app never touches Vinted, so policy risk is low. Handoff guides and the Vinted link are remote config, and the clipboard fallback always works.
- [Users dislike the "Full Access" warning for the keyboard] → Clear explanation in onboarding. The clipboard fallback keeps the app usable without the keyboard.
- [Foundation Models quality in German is weak or unavailable on older iPhones] → Automatic fallback to cloud writing at about 0.05 ct per call. A quality gate in tests compares on-device and cloud output.
- [Size wrong or invented] → The label OCR value wins. "Unknown" instead of a guess. A "Größe fehlt" flag.
- [Model invents facts] → Text is written only from confirmed attributes. A post-check verifies size and brand in the text.
- [Trial abuse across devices] → DeviceCheck stops reinstall abuse. Multiple devices are an accepted, low-cost risk (≈ €0.02 per trial).
- [App Review rejection: "spam"/"minimum functionality", or the keyboard's purpose] → A clear single purpose, a privacy explanation, and a keyboard that is useful by itself.
- [App Review: trademark (5.2.1) or third-party AI consent (5.1.2(i))] → No "Vinted" in the app name, subtitle or icon, and no Vinted UI in screenshots. An explicit AI consent screen naming Anthropic.
- [EU AI Act Art. 50 transparency, and §312k/§356a BGB buttons for in-app subscriptions] → A "KI-generiert" label in the app and an in-app "Abo verwalten / kündigen" entry. Get legal review before launch.
- [Swift needs a Mac or CI for every build] → GitHub Actions macOS CI. The owner's Mac handles device runs.
- [Prices or models change] → Model config lives on the server, and prices are App Store configuration.

## Migration Plan

New product; staged rollout:

1. **Internal MVP (TestFlight, owner's household):** intake, grouping, cloud analysis, writing, editing, handoff with clipboard and keyboard, and onboarding. Billing is stubbed with unlimited internal use.
2. **Closed beta (TestFlight, about 20 sellers):** billing live in sandbox, trial, and tuning of analytics on drop-off points in onboarding.
3. **App Store launch (DE/AT/CH):** prices as in D5.
4. **Later:** Mac target, on-device image analysis on iOS 27.

## Open Questions

- Exact title and description length limits on Vinted, and the current category tree for the reference card. These are configuration values.
- Whether the `/items/new` universal link lands on Vinted's Sell screen. To be tested on a device; only the guide wording depends on it.
- App name, icon and App Store keywords.
- Legal entity, Impressum and the tax treatment of app revenue. This is a business decision outside this change.
