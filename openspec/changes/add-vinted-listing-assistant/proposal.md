# Proposal

## Why

Selling second-hand clothes on Vinted means, for every item: picking the right photos out of the camera roll, finding the size label, and writing a convincing German title and description. This is repetitive and slow when you sell dozens of items. A small app that takes a batch of photos, groups them per garment, reads the size and drafts the listing text would cut that work to a quick review per item.

## What Changes

- New native app ("Thrift Shop Publisher", working name) for **macOS first**, with an **iPhone version later via TestFlight** sharing the same core code.
- User selects a batch of photos (Photos library, Finder/Files, drag & drop). There is no automatic background import.
- The app **groups the photos per garment** automatically (capture time + visual similarity) and lets the user fix groups by dragging photos, merging or splitting.
- For each garment, a vision-capable AI model extracts **category, brand, size, colour, material, condition and notable details**. The size is read primarily from a photographed size/care label; when no size is visible the app says so instead of guessing.
- The app generates a **German Vinted listing**: title (≤ Vinted's title length), description, and suggested hashtags/keywords, plus a non-binding price hint.
- The user can **choose a tone** (e.g. sachlich, freundlich, locker/jung, hochwertig/edel), a length, and emoji on/off, regenerate, and edit everything by hand.
- Finished listings can be **copied to the clipboard per field** and exported (text + ordered photos) to a folder, ready to paste into the Vinted app or website. There is no automatic posting to Vinted.
- **Pluggable AI provider**: Anthropic Claude (default: Claude Haiku 5.5, upgrade option Claude Sonnet 5.5) and OpenAI, using the user's own API key stored in the system Keychain.
- Local history of drafts so work survives app restarts.

## Capabilities

### New Capabilities
- `photo-intake`: Selecting photos from supported sources and preparing them (orientation, downscaling, metadata) for grouping and analysis.
- `garment-grouping`: Automatically clustering a photo batch into one group per garment and letting the user correct the result.
- `garment-analysis`: Extracting structured garment attributes (incl. size) from a photo group with a vision model, with explicit confidence and "unknown" handling.
- `listing-generation`: Producing a German Vinted title, description and keywords from garment attributes, with configurable tone, length and emoji style, and regeneration.
- `listing-review-export`: Reviewing and editing drafts, persisting them locally, and copying/exporting the finished listing with its photos.
- `ai-provider-settings`: Choosing the AI provider and model, storing API keys securely, showing estimated cost, and handling provider errors.

### Modified Capabilities
<!-- None: greenfield project, no existing specs. -->

## Impact

- New Xcode project (SwiftUI multiplatform: macOS 14+, later iOS 17+), no server component.
- External dependencies: Anthropic Messages API and/or OpenAI API over HTTPS, paid per use with the user's own key (a Claude.ai Pro/Max chat subscription does **not** include API usage — see design.md).
- Apple frameworks: PhotosUI/PhotoKit, Vision (on-device text recognition and image feature prints), Security (Keychain), SwiftData (local storage).
- Distribution: macOS build runs locally (free Apple ID signing is enough); iPhone via TestFlight requires a paid Apple Developer Program membership (99 €/year).
- Privacy: photos leave the device only towards the selected AI provider, only when the user starts an analysis.
