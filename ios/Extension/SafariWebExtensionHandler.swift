import Foundation
import SafariServices
import os

/// Answers `browser.runtime.sendNativeMessage(...)` calls from the extension's background script.
///
/// Messages:
/// - `{type: "getSettings"}` → `{settings: {...}}` (only keys that are set; see `SettingsStore.nativeSettings()`)
/// - `{type: "heartbeat"}`   → stores `lastSeen` in the App Group, replies `{ok: true}`
/// - anything else          → `{error: "unknown_message"}`
///
/// Safari ignores the application-id argument of `sendNativeMessage` and always routes to
/// the containing app's extension, so the id only has to be a non-empty string.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let logger = Logger(subsystem: "app.thrift.companion.extension", category: "native-messaging")

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        let type = message?["type"] as? String

        let store = SettingsStore()
        let reply: [String: Any]
        switch type {
        case "getSettings":
            reply = ["settings": store.nativeSettings()]
        case "heartbeat":
            store.lastSeen = Date()
            reply = ["ok": true]
        default:
            reply = ["error": "unknown_message"]
        }

        // Never log the reply: it may contain the API key or server token.
        logger.debug("Native message: \(type ?? "<none>", privacy: .public)")

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
