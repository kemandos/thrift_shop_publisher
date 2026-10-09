# Design

## Context

See `proposal.md`. This change builds on `add-iphone-listing-app`: drafts, the Supabase backend and the iOS app. Facts that shape the design:
- Vinted is not an iOS share target (tested on device, 2026-10-09).
- Vinted Pro Integrations is business-only.
- vinted.de has a web upload page at `/items/new` that requires login.
- Competitors (MyShopRender, SellMate, AutoLister, Crosslist drafts) fill this form from Chrome extensions.
- Vinted's terms (section 6) forbid unauthorised "external software tools". In practice, enforcement has hit auto-posting and relisting bots; user-submitted form-fills have only been reported as low-risk. This is from third-party reports **[U]**.

## Goals / Non-Goals

**Goals:**
- One TypeScript codebase for Chrome, Safari on macOS and Safari on iOS.
- One click fills the full form, photos included.
- A site change degrades gracefully to copy buttons.

**Non-Goals:**
- Auto-submit, bulk upload, relisting, bumping, messaging, price automation, scraping, or any Vinted API.
- Firefox and Edge for now (Edge can install Chrome extensions).

## Decisions

### E1 — WebExtension with WXT, Manifest V3

**Structure:**
- One `extension/` package using WXT (Vite-based) that targets Chrome MV3 and Safari.
- A content script, matched only on `https://www.vinted.*/items/new*`, renders a small Shadow-DOM panel.
- A background service worker handles auth and fetches drafts.
- Safari: Xcode wraps the same build (`safari-web-extension-converter`). The iOS target ships inside the existing app; the macOS target ships as a small Mac wrapper app.

**Alternatives considered:**
- *Userscript:* not installable by normal users.
- *In-app WKWebView:* login and photo upload are uncertain, and it carries App Review risk.

### E2 — Filling a modern React form

- **Text fields:** set the value through the native value setter, then dispatch `input` and `change` events.
- **Custom pickers** (category tree, brand search, size, condition, colour): scripted UI steps (open → type or search → select option), driven by a **remote JSON "form map"**. The map holds selectors, step sequences and our-category→Vinted-category mappings, fetched from our backend and versioned.
- **Photos:**
  1. Fetch the original JPEGs from storage (Chrome) or from native messaging (iOS Safari).
  2. Build `File` objects and assign them to the photo `<input type=file>` via `DataTransfer`, then dispatch `change`.
  3. Upload in batches, if Vinted's form expects that.
  4. Verify that thumbnails appear.

  This must be **validated on Safari/WebKit** in a spike (task 1.2) before committing to iOS.
- **Pacing:** steps run at human-like pace (100–300 ms between picker steps), triggered only by the user's click.

### E3 — Health check and fallback

Before showing "Einfügen", the content script checks that every required selector in the form map resolves. If any doesn't, autofill is disabled and the panel offers copy buttons plus "Fotos herunterladen" (a zip, or the album on iOS). An anonymous `{formMapVersion, ok:false, missing:[…]}` signal tells us to update the map. It contains no page content.

### E4 — Sync

**Computer (Chrome and Safari macOS):**
- Supabase Auth with Sign in with Apple, in both the iOS app and the extension. The extension uses OAuth via `chrome.identity.launchWebAuthFlow`.
- Ready drafts are uploaded: fields go to Postgres, originals go to Storage in eu-central.
- Row-level security restricts access to the owner.
- A scheduled Edge Function deletes data after "Auf Vinted", or 14 days after upload.

**iPhone Safari:**
- `browser.runtime.sendNativeMessage` reaches the extension's native handler (`SafariWebExtensionHandler`).
- The handler reads drafts and original photos from the App Group container.
- No network and no account are involved.

### E5 — Distribution and cost

- **Chrome Web Store:** $5 one-time developer fee. Review usually takes a few days.
- **Safari:** shipped with the iOS app and the Mac wrapper through the App Store, under the existing membership.
- The extension is included in the app subscription. Pricing is unchanged.

## Risks / Trade-offs

- **[Vinted changes the form]** → The remote form map is hot-fixed without a store release. The health check falls back to copy buttons.
- **[Vinted's terms / account restrictions]**
  - Mitigations: no auto-submit, user-initiated only, human pacing, opt-in notice, no Vinted API.
  - Monitoring: we watch user reports and can disable autofill remotely via a kill switch.
- **[Photo injection doesn't work in WebKit (Safari)]** → The iOS spike decides. If it fails, Safari fills text and pickers only, and photos keep using the album.
- **[vinted.de doesn't offer upload in mobile Safari]** → iOS Safari is dropped. Computer support is unaffected. This is checked in the first spike.
- **[Chrome Web Store or App Review rejects the extension]** → Single purpose, a clear description, minimal permissions (host permission for vinted.* only), and no remote *code*: the form map is data only.
- **[Storing photos in the cloud (GDPR)]** → Opt-in, EU region, short retention, deletion in-app, and a privacy policy update.

## Migration Plan

1. **Spike** (task 1): Chrome on desktop, then Safari on iPhone. This decides the iOS scope.
2. Chrome extension + sync, beta with the household user.
3. Safari macOS and iOS.
4. Public release with the remote kill switch ready.

## Open Questions

- Exact Vinted form structure, which gets mapped during the spike. It is configuration, not specification.
