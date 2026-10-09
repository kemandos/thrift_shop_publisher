import Foundation

enum AIMode: String, CaseIterable, Identifiable, Sendable {
    case direct, server
    var id: String { rawValue }
    var label: String {
        switch self {
        case .direct: "Eigener API-Key"
        case .server: "Eigener Server"
        }
    }
}

enum ListingLanguage: String, CaseIterable, Identifiable, Sendable {
    case de, en
    var id: String { rawValue }
    var label: String {
        switch self {
        case .de: "Deutsch"
        case .en: "English"
        }
    }
}

enum Tone: String, CaseIterable, Identifiable, Sendable {
    case sachlich, freundlich, locker, hochwertig
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

enum Secret: String, Sendable {
    case apiKey, serverToken
}

/// Settings shared between the app and the Safari extension handler.
///
/// Non-secret values live in the App Group's UserDefaults; `apiKey` and `serverToken`
/// live in the shared Keychain access group (see `Keychain`).
/// A value type with no cached state, so every read sees what the other process wrote.
struct SettingsStore {
    static let appGroupID = "group.app.thrift.companion"

    private enum Key {
        static let mode = "mode"
        static let serverUrl = "serverUrl"
        static let language = "language"
        static let tone = "tone"
        static let closingTextDe = "closingTextDe"
        static let closingTextEn = "closingTextEn"
        static let lastSeen = "lastSeen"
    }

    let defaults: UserDefaults

    init() {
        // Falls back to .standard only if the App Group entitlement is missing (misconfigured signing).
        defaults = UserDefaults(suiteName: Self.appGroupID) ?? .standard
    }

    // MARK: Non-secret settings

    var mode: AIMode? {
        get { defaults.string(forKey: Key.mode).flatMap(AIMode.init(rawValue:)) }
        nonmutating set { defaults.set(newValue?.rawValue, forKey: Key.mode) }
    }

    var language: ListingLanguage? {
        get { defaults.string(forKey: Key.language).flatMap(ListingLanguage.init(rawValue:)) }
        nonmutating set { defaults.set(newValue?.rawValue, forKey: Key.language) }
    }

    var tone: Tone? {
        get { defaults.string(forKey: Key.tone).flatMap(Tone.init(rawValue:)) }
        nonmutating set { defaults.set(newValue?.rawValue, forKey: Key.tone) }
    }

    var serverUrl: String? {
        get { text(Key.serverUrl) }
        nonmutating set { setText(newValue, Key.serverUrl) }
    }

    var closingTextDe: String? {
        get { text(Key.closingTextDe) }
        nonmutating set { setText(newValue, Key.closingTextDe) }
    }

    var closingTextEn: String? {
        get { text(Key.closingTextEn) }
        nonmutating set { setText(newValue, Key.closingTextEn) }
    }

    /// Last time the Safari extension sent a `heartbeat` native message.
    var lastSeen: Date? {
        get { defaults.object(forKey: Key.lastSeen) as? Date }
        nonmutating set { defaults.set(newValue, forKey: Key.lastSeen) }
    }

    // MARK: Secrets (Keychain)

    func secret(_ secret: Secret) -> String? {
        Keychain.string(for: secret.rawValue)
    }

    /// Saves (or, for nil/empty, deletes) a secret. Returns false if the Keychain refused.
    @discardableResult
    func setSecret(_ secret: Secret, _ value: String?) -> Bool {
        Keychain.set(value?.trimmingCharacters(in: .whitespacesAndNewlines), for: secret.rawValue)
    }

    /// "••••abcd" — only the last 4 characters of a saved secret are ever shown.
    static func masked(_ secret: String) -> String {
        "••••\(secret.suffix(4))"
    }

    // MARK: Native messaging payload

    /// The `settings` object returned for `{type: "getSettings"}`; only keys that are set.
    func nativeSettings() -> [String: String] {
        var settings: [String: String] = [:]
        settings["mode"] = mode?.rawValue
        settings["apiKey"] = secret(.apiKey)
        settings["serverUrl"] = serverUrl
        settings["serverToken"] = secret(.serverToken)
        settings["language"] = language?.rawValue
        settings["tone"] = tone?.rawValue
        settings["closingTextDe"] = closingTextDe
        settings["closingTextEn"] = closingTextEn
        return settings
    }

    // MARK: Helpers

    private func text(_ key: String) -> String? {
        guard let value = defaults.string(forKey: key), !value.isEmpty else { return nil }
        return value
    }

    /// Trims surrounding whitespace; nil or empty removes the key.
    private func setText(_ value: String?, _ key: String) {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmed.isEmpty {
            defaults.removeObject(forKey: key)
        } else {
            defaults.set(trimmed, forKey: key)
        }
    }
}
