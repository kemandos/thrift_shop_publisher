# iOS 27 research: what to do and how

As of 2026-10-09. Compiled from four parallel research passes covering design, APIs, tooling and App Store/legal. Items marked **[U]** were not verified against a primary source. Nothing here is legal advice.

## 1. Platform and toolchain

| Topic | Decision | Why / source |
|---|---|---|
| Minimum iOS | **iOS 26**, with iOS 27 features behind `#available(iOS 27, *)` | iOS 26 ran on 79% of all iPhones in June 2026 (Apple via MacRumors). iOS 27 supports the same devices **[U]** |
| Xcode / Swift | Xcode 27.0 (Sept 2026), Swift 6.4, Swift 6 language mode | Xcode 27 needs macOS Tahoe 26.6 or later on Apple silicon |
| Concurrency | App target: Approachable Concurrency + default actor isolation `MainActor`. `ListingCore` package: default isolation stays nonisolated, `Sendable` types, `@concurrent` for background work | New Xcode templates already set these |
| Project file | Create the `.xcodeproj` once on the Mac with **buildable folders**. Logic lives in the local SwiftPM package `ListingCore` | Adding files then never touches the pbxproj, so most edits can happen from Linux |
| Linux testing | `ListingCore` (grouping algorithm, size parser, prompt builder, API client models) builds and tests with `swift test` on Linux. Use `#if canImport(UIKit)` and `#if canImport(FoundationNetworking)`; swift-crypto instead of CryptoKit | Claude Code on the web can run these tests directly |
| Tests | Swift Testing for unit tests, XCTest/XCUIAutomation for UI tests, `.storekit` configuration file for local purchase tests | |
| CI | GitHub Actions: `ubuntu-latest` + `swift:6.x` container for `ListingCore`, `macos-26` (Xcode 26.6, iOS 26 simulators) for the app with `CODE_SIGNING_ALLOWED=NO`. Xcode 27 exists only as the preview runner label `xcode-27` | macOS minutes cost $0.062/min on private repos; public repos are free |

### Free Apple ID (until the 99 € membership)

- **Limits:** profiles expire after 7 days, 3 devices, 10 App IDs per 7 days. Each extension counts as its own App ID.
- **Works:** App Groups, Keychain Sharing, keyboard extension (no special entitlement).
- **Does not work:** In-App Purchase, **App Attest**, iCloud, Sign in with Apple, Push, TestFlight.
- **Consequence:**
  - Debug builds use a **development mode**: the backend accepts a dev token in place of App Attest, only for allow-listed dev installs.
  - Purchases are tested with the `.storekit` file in the Simulator.
  - Real IAP, App Attest and TestFlight are tested after enrolling.

## 2. Design (iOS 27 Liquid Glass)

- **What changed:** iOS 27 refines the iOS 26 Liquid Glass look. Blur is stronger, edges are darker, and users get a system slider (More Clear / Default / More Tinted). The app must look right at every slider position and with Reduce Transparency and Increase Contrast.
- **Brand placement:** keep controls standard (system tab bar and toolbars). Put the brand in the content layer: photos, accent colour on primary actions.
- **Navigation:** tabs *Entwürfe*, *Auf Vinted* and *Einstellungen*, plus a prominent **"+ Neues Inserat"** tab (`Tab(role: .prominent)`). A `tabViewBottomAccessory` can show "3 Artikel werden analysiert …" **[U]**.
- **Photo grids:** `LazyVGrid`. On iOS 27, use `.reorderable()` / `.reorderContainer` for drag between garment groups; on iOS 26, use a custom drag & drop fallback. Zoom transitions from grid to detail. Every drag needs an accessibility action alternative ("Nach links/rechts verschieben", "In anderen Artikel verschieben").
- **Editing:** grouped `Form` with standard pickers. AI values are editable and carry a source badge.
- **App icon:** layered icon built with Icon Composer, in Default/Dark/Clear/Tinted variants.
- **Paywall:** `SubscriptionStoreView`, which covers price, terms and restore, plus the plan's listing allowance stated clearly.
- **Keyboard:** the system wraps third-party keyboards in glass. Avoid an opaque full background **[U]**. Show the globe key when `needsInputModeSwitchKey` is true.

Design directions: see the canvas "Thrift Shop – iPhone Designvorschläge" (A Klar / B Nachtschicht / C Etikett).

## 3. APIs worth using

| Need | API | Notes |
|---|---|---|
| On-device text writing (DE/EN, tone) | Foundation Models `LanguageModelSession` + `@Generable` | Apple Intelligence devices only (iPhone 15 Pro and later). Context is about 4K tokens, though one Apple sample prints 8K: read `contextSize` and `tokenCount(for:)` at runtime |
| On-device image understanding (experiment) | iOS 27: `Attachment(image)` inside the prompt, plus system tools (barcode, OCR **[U]**) | Good enough for coarse fields (type, colour, pattern). Brand and size come from OCR. Feature-flagged; measure with the Evaluations framework |
| Free server model (option) | iOS 27 `PrivateCloudComputeLanguageModel` (32K context, reasoning) | Needs a managed entitlement. Free for developers in the Small Business Program with fewer than 2M downloads. Users have a daily quota. Doesn't work in the Simulator. **Could replace the paid cloud writing call entirely on eligible devices** |
| Label OCR | Vision `RecognizeTextRequest` (or `RecognizeDocumentsRequest`, iOS 26) | Runs on all devices |
| Grouping | Vision `GenerateImageFeaturePrintRequest` + capture time | Unchanged in iOS 27 |
| Background cut-out (later) | iOS 27 `GenerateIterativeSegmentationRequest` | Possible "cleaner photo" feature later |
| Persistence | SwiftData | iOS 27 adds sectioned `@Query`, `ResultsObserver` and Codable attributes. Gate them; don't depend on them |
| Entry from Photos | **Share Extension** "Inserat erstellen" writing images into the App Group | No App Intent receives Photos share-sheet items. Visual Intelligence integration is not a fit for creating content **[U]** |
| Subscriptions | StoreKit 2 via RevenueCat | New in iOS 26.4+: an annual plan billed monthly. Check RevenueCat support **[U]** |
| Coach marks | TipKit | No iOS 27 changes found |

## 4. App Store review and EU law: required changes to the plan

1. **5.1.2(i), third-party AI:** before the first photo upload, show an explicit consent screen that names Anthropic and explains what is sent. Store the consent and make it revocable.
2. **4.4.1, keyboards:**
   - The keyboard must work as a real keyboard **without Full Access**: letter keys, a globe key, no network use.
   - It must not open other apps.
   - Without Full Access it cannot read the App Group, so the listing buttons show "Vollzugriff erlauben, um Inserate einzufügen" and typing still works.
   - Explain the reason for Full Access in the UI and in the review notes.
3. **5.2.1 / 2.3.7, trademarks:**
   - Don't use "Vinted" in the app name, subtitle or icon, and don't show Vinted's logo or UI in screenshots.
   - Factual mentions like "für Inserate auf Vinted" in the description are acceptable.
   - The handoff mockups use a neutral placeholder for this reason.
4. **3.1.2, subscriptions:** the paywall shows price, period, auto-renewal, listing allowance, Terms and Privacy links, and Restore. A 10-listing trial without purchase is common practice; Apple's sanctioned trial pattern is time-based, so state clearly what happens after 10 **[U]**.
5. **Credits:** never expire.
6. **"Abo verwalten/kündigen":** an in-app entry that opens Apple's manage-subscriptions sheet. This is low-cost mitigation for §312k BGB (cancellation button) and §356a BGB (withdrawal button, since 19 June 2026). Whether these apply when Apple is the merchant of record is unresolved **[U]**.
7. **EU AI Act Art. 50 (applies since 2 Aug 2026):** label generated text "KI-generiert" in the app. Assess with a lawyer whether 50(2) machine-readable marking applies to text the user pastes into a third-party app, or whether the editing exception applies.
8. **GDPR:**
   - Anthropic DPA (part of its Commercial Terms) and SCCs.
   - Privacy policy naming the controller, purposes, legal basis, recipients (Anthropic, Supabase, Apple), the US transfer, retention and user rights.
   - A record of processing activities and a short transfer impact assessment.
   - EXIF/GPS stripped from photos.
9. **DSA trader declaration and Impressum:** a seller address is shown publicly. Decide on an individual vs. business address before launch.
10. **App Privacy label:**
    - Photos and Other User Content: App Functionality.
    - Purchases: App Functionality.
    - Identifiers: User/Device ID.
    - Diagnostics: only if collected.
    - Tracking: none.
11. **Review notes:** a demo path that works without the trial limit, a working backend, and the reason for the keyboard's Full Access.

## 5. Competitive note

A competitor, VintRapid, claims to "open Vinted with the form pre-filled" **[U]**. Check how before launch: it may be using the same album + keyboard/clipboard approach.
