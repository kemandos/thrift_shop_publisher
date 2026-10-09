# Proposal

## Why

The app is for personal use: one household selling on Vinted, on the computer and on the iPhone. The simplest way to get photos *and* all fields into Vinted is to work where the listing actually happens, which is Vinted's own upload form in the browser:
1. The seller adds photos to Vinted's form.
2. A browser extension sends them to an AI model.
3. The extension fills in everything else.
4. The seller clicks "Hochladen".

This needs no separate app on the computer, no album and no keyboard.

Facts tested on 2026-10-09:
- Vinted is **not** an iOS share target.
- Vinted offers no API for private sellers.
- **vinted.de shows the full "Artikel verkaufen" form in Safari on iPhone** (screenshot: Fotos hinzufügen, Titel, Beschreibung, Artikeldetails). The same extension can therefore run on both the computer and the iPhone.

## What Changes

- **One WebExtension** (TypeScript, WXT, Manifest V3) for:
  - **Chrome** on the computer;
  - **Safari on iPhone**, and Safari on Mac if wanted.

  It is active only on Vinted's upload page.
- **"✨ Ausfüllen" after photos are added:**
  1. The extension reads the photos from Vinted's form.
  2. It collects the form's fields and options (categories, sizes, conditions, colours).
  3. It asks the AI (Claude Haiku 5.5 via OpenRouter) for the listing, constrained to those options.
  4. It fills title, description, category, brand, size, condition, colour and a price suggestion.
- **Robust filling ("Jev-style"):**
  - Known selectors (a remote form map) are tried first.
  - If Vinted's form changed, the AI picks the right element from a compact list of the page's interactive elements.
  - Copy buttons are the last resort.
- **Language and tone:** German or English, chosen from a list. Tone choices are Sachlich, Freundlich, Locker and Hochwertig. "Neu schreiben" rewrites the text without re-reading the photos.
- **Never submits.** The extension doesn't click "Hochladen", call Vinted APIs, relist or message. It runs only after an explicit user click, at human pace.
- **AI access, two modes:**
  - *OpenRouter:* the user's own OpenRouter key is stored in the extension (default). Only two models are offered: Claude Haiku 5.5 for photos and text, Jev Router for clicking and navigation. This works from day one.
  - *Via own server (optional):* a small TypeScript service on the owner's Oracle VM holds the key and serves prompts and the form map centrally.
- **iPhone container app** (Apple requires an app to ship a Safari extension): settings and a guide for enabling the extension. No fallback flow is needed, because the mobile form works. The fallback stays documented as a contingency.
- **Supersedes** the server-based extension idea. `add-iphone-listing-app` (the full native app with backend and subscriptions) stays parked for a possible public product.

## Capabilities

### New Capabilities
- `vinted-form-autofill`: Recognising Vinted's upload form, reading photos and options, filling fields (form map first, AI-guided element picking as fallback), never submitting, and failing safely.
- `listing-ai`: Turning the item photos into listing data and text with Claude Haiku 5.5 via OpenRouter (size from the label, facts only, German/English, tone).
- `extension-settings`: The AI mode (own key or own server), defaults (language, tone, closing text), the one-time notice, and cost display.
- `ios-companion`: The iPhone container app for the Safari extension, with setup and a guide for enabling it.

### Modified Capabilities
<!-- None: openspec/specs is empty. -->

## Impact

- **New code:**
  - `extension/`: TypeScript, WXT, Vitest/Playwright.
  - `server/` (optional): TypeScript with Hono on Node, in Docker with Caddy for HTTPS, on the Oracle VM.
  - `ios/`: a small SwiftUI container with a Safari Web Extension target that reuses the extension build.
- **Shared types:** `packages/shared` holds the listing schema and the form-map schema, used by the extension and the server.
- **External service:** OpenRouter's chat completions API (`openrouter.ai`), called from the extension's background worker with the user's key, or through the owner's server.
- **Distribution:**
  - Chrome: "Load unpacked" for personal use.
  - iPhone: installed from Xcode. With a free Apple ID it must be re-signed every 7 days; with the paid Developer Program it gets 1-year installs and TestFlight.
- **Risk:** filling Vinted's form is a grey zone under Vinted's terms ("external software tools"). It is kept minimal: user-initiated only, no auto-submit, human pace.
