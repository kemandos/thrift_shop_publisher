# Proposal

## Why

The app is for personal use: one household selling on Vinted, on the computer and on the iPhone. The simplest way to get photos *and* all fields into Vinted is to work where the listing actually happens, which is Vinted's own upload form in the browser:
1. The seller uploads the photos into Vinted's form.
2. A browser extension sends them to an AI model.
3. The extension fills in everything else.
4. The seller clicks "Hochladen".

This needs no server, no account, no sync and no separate app on the computer. Tests on 2026-10-09 showed that Vinted is not an iOS share target and offers no API for private sellers.

## What Changes

- **One WebExtension** (TypeScript, Manifest V3) for **Chrome** (computer) and **Safari** (iPhone, and Mac if wanted), active only on Vinted's upload page.
- **"✨ Ausfüllen" after photos are added:**
  1. The extension reads the photos the user put into Vinted's form.
  2. It reads the options the form offers (categories, sizes, conditions, colours).
  3. It asks Claude for the listing, constrained to those options.
  4. It fills title, description, category, brand, size, condition, colour and a price suggestion.
- **Language and tone:** German or English, chosen from a list. Tone choices are Sachlich, Freundlich, Locker and Hochwertig. A "Neu schreiben" button rewrites the text without re-reading the photos.
- **Never submits.** The user reviews the form and clicks Vinted's "Hochladen". The extension doesn't call Vinted APIs, navigate, relist or message.
- **Own API key:** the user enters their own Anthropic API key once. Calls go directly from the browser to Claude (default model: Claude Haiku 5.5, about 0.2 ct per item). There is no backend.
- **iPhone companion app** (required by Apple to ship a Safari extension) with:
  - setup: API key, language, tone, closing text, and a guide to enabling the Safari extension;
  - **fallback mode, only if vinted.de doesn't offer listing in mobile Safari:** pick photos → AI listing → photos saved to a "Vinted" album and text copied → Vinted app opens.
- **Supersedes** the earlier server-based browser-extension idea.
- `add-iphone-listing-app` (the full native app with backend and subscriptions) stays parked for a possible public product later.

## Capabilities

### New Capabilities
- `vinted-form-autofill`: Recognising Vinted's upload form, reading the photos and available options, filling the fields, never submitting, and failing safely when the form changes.
- `listing-ai`: Turning the item photos into listing data and text with Claude (size from the label, facts only, German/English, tone), using the user's own key.
- `extension-settings`: The API key, defaults (language, tone, closing text), the one-time notice, and cost display.
- `ios-companion`: The iPhone container app for the Safari extension, with setup and, conditionally, the album/clipboard fallback flow.

### Modified Capabilities
<!-- None: openspec/specs is empty. -->

## Impact

- **New code:**
  - `extension/`: TypeScript, WXT, Vitest/Playwright. Builds for Chrome and Safari.
  - `ios/`: a small SwiftUI container app with a Safari Web Extension target, which reuses the extension build.
- **External services:** the Anthropic Messages API, called directly from the browser with the user's key (`anthropic-dangerous-direct-browser-access` header). Nothing else.
- **Distribution:**
  - Chrome: "Load unpacked" for personal use. A Chrome Web Store listing ($5 one-time) is optional.
  - iPhone: installed from Xcode with a free Apple ID (re-sign every 7 days). The paid Developer Program (99 €/year) gives TestFlight and 1-year installs.
- **Risk:** filling Vinted's form is a grey zone under Vinted's terms ("external software tools"). It is kept minimal: user-initiated only, no auto-submit, human pace.
