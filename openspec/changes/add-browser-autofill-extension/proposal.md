# Proposal

## Why

The MVP (`add-iphone-listing-app`) hands listings to the Vinted app via a photo album and a custom keyboard. Photos still have to be picked by hand, and category, size, brand and condition must be chosen in Vinted's own pickers.

Vinted offers private sellers no API and no share target (tested 2026-10-09). The proven way competitors fill in *everything*, photos included, is a browser extension. It fills Vinted's web upload form in the user's own logged-in browser, and the user still clicks "Hochladen". The seller wants this on the computer (Chrome) and, if possible, on the iPhone (Safari).

## What Changes

- **One WebExtension** (TypeScript, Manifest V3) built for:
  - **Chrome** on Mac and Windows;
  - **Safari** on macOS;
  - **Safari on iPhone**, shipped inside the iOS app as a Safari Web Extension.
- On vinted.de's "Verkaufen" page, the extension shows the user's prepared listings. One click fills **photos (originals, in order), title, description, category, brand, size, condition, colour and price**.
- The extension **never submits**. The user reviews the form and clicks Vinted's own "Hochladen". The extension doesn't navigate, re-list, message, scrape other pages, or call Vinted APIs.
- **Listing sync:**
  - **Computer (Chrome/Safari macOS):** drafts (text and photos) sync from the iPhone app through our backend. This needs a user account (Sign in with Apple) and explicit opt-in. Photos are stored temporarily and deleted after "Hochgeladen" or after 14 days.
  - **iPhone Safari:** no sync is needed. The extension reads drafts directly from the app via native messaging (App Group).
- **Selector resilience:** Vinted's form selectors and category mappings live in remotely updatable configuration, so small site changes don't require a store release. A health check disables autofill and falls back to copy buttons when the form isn't recognised.
- **Opt-in and transparency:** autofill is an explicit setting. A one-time notice explains that it fills Vinted's form in the user's browser, that the user always submits, and that Vinted's terms restrict external tools.

## Capabilities

### New Capabilities
- `browser-autofill`: The browser extension that recognises Vinted's upload form and fills it with a prepared listing, including photos, without ever submitting.
- `listing-sync`: Opt-in, account-based sync of drafts (text and photos) from the iPhone app to the user's browsers, with retention limits and deletion.

### Modified Capabilities
<!-- None in openspec/specs yet. This change builds on the in-flight change add-iphone-listing-app (vinted-handoff, ai-backend), whose album/keyboard handoff stays the default. -->

## Impact

- **Depends on** `add-iphone-listing-app`: drafts, the backend and the iOS app.
- **New code:** `extension/` (TypeScript, WebExtension, built with Vite or WXT for Chrome and Safari). An iOS Safari Web Extension target and a macOS Safari Web Extension wrapper (Xcode).
- **Backend:**
  - Accounts: Supabase Auth with Sign in with Apple.
  - Draft and photo storage: Supabase Storage, EU region.
  - Deletion jobs.
- **Distribution:** Chrome Web Store (one-time $5 developer fee). Safari extensions ship through the App Store with the app.
- **Legal and risk:**
  - Form-filling stays a grey zone under Vinted's terms. Risk is reduced by user-initiated filling, no auto-submit, and human pace.
  - The privacy policy is updated for synced photos. GDPR covers storage and deletion.
