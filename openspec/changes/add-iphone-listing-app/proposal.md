# Proposal

## Why

Private Vinted sellers spend 5–15 minutes per item: choosing photos, finding the size label, picking category and condition, and writing a title and description. Existing AI helpers work on one item at a time and are often browser-only. Most cannot split a whole camera-roll batch into items. None can legally post for you, because Vinted has no listing API for private sellers. An iPhone app can do all of this where the photos already are. It turns a batch of photos into finished listings and hands each one to the Vinted app with as few taps as possible.

## What Changes

- New **native iPhone app** (Swift/SwiftUI, iOS 26+) as the first platform. A Mac version comes later.
- User selects photos from the library (or takes them in-app). The app **groups photos per garment** on-device and lets the user fix the groups.
- AI **analyses each garment**: type, Vinted category, brand, **size (read from the label)**, colour, material, condition and defects. It answers "unknown" rather than guessing.
- AI **writes title, description and hashtags** in a **selectable language** (German and English at launch). The user can switch language and tone at any time and **edit the text**.
- **"Veröffentlichen" handoff:** one tap saves the photos in order to a "Vinted" album, prepares the text and opens the Vinted app. A built-in **keyboard extension** inserts title, description and hashtags into Vinted's fields with one tap each, so no copy-paste is needed. The user taps "Hochladen" in Vinted. The app never posts on its own.
- **Guided first run:** an interactive walkthrough shows where to tap at each step, including enabling the keyboard and the first handoff. A help/FAQ section is available any time.
- **Monetisation:** a **one-time free trial of 10 listings**, then auto-renewing subscriptions (Basic and Pro tiers) and an optional non-expiring credit pack, sold via Apple In-App Purchase.
- **Backend proxy** that holds the AI key, verifies the device and entitlement, and enforces quotas. Default model: Claude Haiku 5.5. On-device Apple frameworks handle OCR, grouping and, where available, text writing, to minimise cost.
- **Not included:** the Vinted Pro Integrations API (business-only and allowlisted), any use of Vinted's private API, browser automation, and auto-posting.

## Capabilities

### New Capabilities
- `photo-intake`: Selecting photos from the library or camera and preparing them for grouping and analysis.
- `garment-grouping`: On-device clustering of a photo batch into one group per garment, with manual correction.
- `garment-analysis`: AI extraction of structured garment attributes (incl. size from the label) with confidence and "unknown" handling.
- `listing-generation`: Writing title, description and hashtags in a selectable language and tone, with regeneration.
- `listing-editing`: Reviewing, editing, and persisting listing drafts and their status.
- `vinted-handoff`: The "Veröffentlichen" flow (ordered photo album, text preparation, opening Vinted) and the keyboard extension that inserts listing text into Vinted.
- `onboarding-help`: Guided first-run walkthrough, contextual coach marks, and the in-app help/FAQ.
- `subscription-billing`: One-time trial, subscription plans, credit packs, quota tracking, and paywall.
- `ai-backend`: Server proxy for AI calls, including device/user authentication, abuse protection, quota enforcement, provider selection, and data handling.

### Modified Capabilities
<!-- None: no existing specs. -->

## Impact

- New Xcode project: iOS app target, keyboard extension target, and a shared Swift package (`ListingCore`). A Mac target is planned for later.
- New backend: Supabase (Postgres + Edge Functions) as the AI proxy and quota store. Anthropic API account (pay-per-use).
- Apple services: App Store Connect (subscriptions, trial), StoreKit 2 via RevenueCat, App Attest/DeviceCheck, Apple Developer Program (99 €/year).
- Apple frameworks: PhotosUI/PhotoKit, Vision (OCR, feature prints), Foundation Models (on-device text generation on Apple Intelligence devices), SwiftData.
- Legal and compliance: privacy policy and AI-processing disclosure (GDPR), App Store privacy labels, Impressum, subscription terms.
- Building and installing on a device requires a Mac with Xcode, or Xcode Cloud for TestFlight builds.
