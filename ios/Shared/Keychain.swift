import Foundation
import Security

/// Minimal generic-password Keychain wrapper shared by the app and the Safari extension.
///
/// No `kSecAttrAccessGroup` is passed: both targets list
/// `$(AppIdentifierPrefix)app.thrift.shared` as the *first* (and only) entry of their
/// `keychain-access-groups` entitlement, so new items go into that shared group by default,
/// and queries without an access group search all groups the process may access.
/// This avoids hard-coding the team ID prefix at runtime.
enum Keychain {
    static let service = "app.thrift.companion"

    static func string(for account: String) -> String? {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Stores `value`, or deletes the item when `value` is nil or empty. Returns false on failure.
    @discardableResult
    static func set(_ value: String?, for account: String) -> Bool {
        guard let value, !value.isEmpty else { return delete(account) }

        let attributes: [String: Any] = [
            kSecValueData as String: Data(value.utf8),
            // Device-only: never synced via iCloud Keychain, never in backups to other devices.
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(baseQuery(account) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            let addQuery = baseQuery(account).merging(attributes) { _, new in new }
            return SecItemAdd(addQuery as CFDictionary, nil) == errSecSuccess
        }
        return status == errSecSuccess
    }

    @discardableResult
    static func delete(_ account: String) -> Bool {
        let status = SecItemDelete(baseQuery(account) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    private static func baseQuery(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
