# Thrift – iPhone app (Safari extension container)

A small SwiftUI app that ships the Thrift Safari Web Extension to the iPhone. It shows a setup guide and
the same settings as the extension's options page. Settings are shared with the extension through native messaging.

| | |
|---|---|
| App | `app.thrift.companion`, display name "Thrift" |
| Safari extension | `app.thrift.companion.extension` |
| App Group | `group.app.thrift.companion` (non-secret settings, `lastSeen`) |
| Keychain group | `$(AppIdentifierPrefix)app.thrift.shared` (`apiKey`, `serverToken`) |
| Minimum iOS | 17.0 |

## Prerequisites

- A Mac with **Xcode 16 or newer**.
- **XcodeGen**: `brew install xcodegen`
- **Node 22 + pnpm**, used to build the web part of the extension: `corepack enable` or `brew install pnpm`
- An iPhone with iOS 17+ and a USB cable, or the same Wi-Fi as the Mac. On the iPhone, turn on **Developer Mode** under Settings → Privacy & Security.
- An Apple ID. The free one works (see "Signing" below).

## Build and run

```sh
# 1. From the repository root: build the Safari web extension → extension/.output/safari-mv3/
pnpm install
pnpm --filter @thrift/extension build:safari

# 2. Generate the Xcode project from project.yml
cd ios
xcodegen

# 3. Open it
open Thrift.xcodeproj
```

4. **Set the team.** Create `ios/Config/Signing.local.xcconfig` (it is gitignored) with:
   ```
   DEVELOPMENT_TEAM = ABCDE12345
   ```
   Your team ID is in Xcode → Settings → Accounts, or in the Signing & Capabilities tab after you pick the team there. Picking the team only in Xcode's UI also works, but `xcodegen` resets it on the next run.
5. Select the **Thrift** scheme and your iPhone, then press **Run** (⌘R).
6. On first install, the iPhone may block the app. Trust it under Settings → General → VPN & Device Management → *your Apple ID* → Trust.
7. Enable the extension. The app's **Einrichtung** tab walks through this:
   Settings → Apps → Safari → Extensions → **Thrift** → on, then set **All Websites** (or vinted.de) to **Allow**.
   On iOS 17 the path is Settings → Safari → Extensions; the "Apps" level was added in iOS 18.
8. Open `www.vinted.de/items/new` in Safari. The status row in the app shows "Erweiterung aktiv – zuletzt gesehen …" once the extension has sent its first heartbeat.

After every change to the extension code, run `pnpm --filter @thrift/extension build:safari` again, then build in Xcode.
Run `xcodegen` again only after changing `project.yml` or adding or removing Swift files.

## Signing with a free Apple ID

- Automatic signing with a **Personal Team** works. Both capabilities used here, **App Groups** and **Keychain Sharing**, are available to personal teams.
- Apps signed with a free Apple ID **expire after 7 days**. To renew, connect the iPhone and press Run again; your settings are kept. With the paid Developer Program, installs last a year and TestFlight is available.
- Bundle IDs and App Group IDs must be unique across all Apple accounts. If Xcode reports *"Failed to register bundle identifier"* or *"…App Group is not available"*, change these values together:
  - `PRODUCT_BUNDLE_IDENTIFIER` for both targets, plus the `bundleIdPrefix`, in `project.yml`. The extension ID must stay `<app id>.extension`.
  - The App Group in both `entitlements` blocks in `project.yml`, **and** `SettingsStore.appGroupID` in `Shared/SettingsStore.swift`.

  Then run `xcodegen` again. The web extension does not need any change, because Safari ignores the app ID passed to `sendNativeMessage`.

## How it fits together

```
ios/
  project.yml                  XcodeGen spec (targets Thrift + ThriftExtension)
  Config/Signing.xcconfig      DEVELOPMENT_TEAM (+ optional Signing.local.xcconfig)
  App/                         SwiftUI app: ThriftApp, ContentView (tabs), SetupView, SettingsView, Assets
  Shared/                      compiled into BOTH targets: SettingsStore, Keychain
  Extension/                   SafariWebExtensionHandler (native messaging)
  scripts/copy-web-extension.sh  pre-build phase of ThriftExtension
```

- **Generated files.** `xcodegen` writes `Thrift.xcodeproj`, both `Info.plist` files and both `.entitlements` files from `project.yml`. They are gitignored, so edit `project.yml` instead.
- **Web extension resources.** The `ThriftExtension` target has a pre-build *Run Script* phase that runs `scripts/copy-web-extension.sh`. The script copies the contents of `extension/.output/safari-mv3/` into the **root** of `ThriftExtension.appex`, which is where Safari looks for `manifest.json`. A folder reference is not used, because it would put the files in a subfolder of the bundle where Safari does not look. If the build is missing, the script fails with an error that names the pnpm command to run. To use another build folder, set `WEB_EXTENSION_DIR`. User script sandboxing is turned off for this target, because the script reads outside `ios/`.
- **Native messaging.** The extension's background script calls `browser.runtime.sendNativeMessage("app.thrift.companion.extension", msg)`, which Safari passes to `SafariWebExtensionHandler`:
  - `{type:"getSettings"}` → `{settings:{mode?, apiKey?, serverUrl?, serverToken?, language?, tone?, closingTextDe?, closingTextEn?}}`. Only keys that are set are included.
  - `{type:"heartbeat"}` → stores `lastSeen` in the App Group and replies `{ok:true}`. The app's status row reads this value. iOS has no API that tells an app whether its Safari extension is turned on, so the heartbeat is the only signal.
  - Anything else → `{error:"unknown_message"}`.
- **Storage.**
  - `apiKey` and `serverToken` are kept in the Keychain with `AfterFirstUnlockThisDeviceOnly`, so they are never synced or restored to another device. Only the last 4 characters are ever shown.
  - Everything else is kept in `UserDefaults(suiteName: "group.app.thrift.companion")`.
  - The Keychain code passes no explicit access group. The shared group is the first entry in `keychain-access-groups` in both targets, so it is the default group for new items.
- **Settings button.** iOS cannot deep-link to Safari's Extensions page. "Safari-Einstellungen öffnen" opens the Settings app at Thrift's own page, and the user goes from there to Apps → Safari → Extensions.

## Troubleshooting

- **Build fails with "Safari web extension build not found".** Run `pnpm install && pnpm --filter @thrift/extension build:safari` from the repo root, then build again.
- **"Thrift" doesn't show up under Safari → Extensions.**
  - Make sure you ran the **Thrift** app scheme and not only the extension.
  - Open the app once.
  - Check that `ThriftExtension.appex` contains `manifest.json` at its root: in the Products group, right-click `Thrift.app` → Show in Finder → Show Package Contents → PlugIns.
  - Restart Settings, or the iPhone.
- **The extension is on, but nothing happens on vinted.de.**
  - In Safari, tap **AA** (or the puzzle icon) → Thrift → **Always Allow on This Website**, or set "vinted.de" / "All Websites" to **Allow** in Settings.
  - Private tabs need the extension enabled separately ("Allow in Private Browsing").
- **The status stays at "Noch nicht aktiv".** The extension sends its heartbeat only when it runs on vinted.de. Open `www.vinted.de/items/new` in Safari, then come back to the app.
- **Settings saved in the app don't reach the extension.**
  - Both targets must have the **same** App Group and Keychain Sharing group. Check under Signing & Capabilities.
  - The error "Konnte nicht im Schlüsselbund speichern" means the keychain-access-groups entitlement was not applied.
- **App won't launch after a week.** The free-team certificate expired. Run it from Xcode again.
- **"Untrusted Developer".** Trust the profile under Settings → General → VPN & Device Management.
