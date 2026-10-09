import SwiftUI

/// "Einstellungen": the same settings as the extension's options page.
/// Changes are written to `SettingsStore` on "Speichern" (removing a secret applies immediately).
struct SettingsView: View {
    private let store = SettingsStore()

    @State private var loaded = false
    @State private var mode: AIMode = .openrouter
    @State private var apiKeyInput = ""
    @State private var apiKeyHint: String?
    @State private var serverUrl = ""
    @State private var tokenInput = ""
    @State private var tokenHint: String?
    @State private var language: ListingLanguage = .de
    @State private var tone: Tone = .sachlich
    @State private var closingDe = ""
    @State private var closingEn = ""
    @State private var errorMessage: String?
    @State private var saveCount = 0
    @State private var justSaved = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("KI-Zugang", selection: $mode) {
                        ForEach(AIMode.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("KI-Zugang")
                } footer: {
                    Text(mode == .openrouter
                         ? "Anfragen gehen direkt an OpenRouter (Claude Haiku 5.5 für Fotos & Text, Jev Router fürs Klicken). Der Key bleibt nur auf diesem iPhone."
                         : "Alle KI-Anfragen gehen an deinen Server. Hier wird kein OpenRouter-Key gebraucht.")
                }

                if mode == .openrouter {
                    Section("OpenRouter-Key") {
                        SecretRows(placeholder: "sk-or-…", input: $apiKeyInput, hint: apiKeyHint) {
                            if store.setSecret(.apiKey, nil) { apiKeyHint = nil }
                        }
                    }
                } else {
                    Section {
                        TextField("https://dein-server.example", text: $serverUrl)
                            .keyboardType(.URL)
                            .textContentType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecretRows(placeholder: "Zugangstoken", input: $tokenInput, hint: tokenHint) {
                            if store.setSecret(.serverToken, nil) { tokenHint = nil }
                        }
                    } header: {
                        Text("Eigener Server")
                    } footer: {
                        Text("Die Adresse muss mit https:// beginnen.")
                    }
                }

                Section("Sprache") {
                    Picker("Sprache", selection: $language) {
                        ForEach(ListingLanguage.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                Section("Ton") {
                    Picker("Ton", selection: $tone) {
                        ForEach(Tone.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                Section {
                    TextField("Deutsch", text: $closingDe, axis: .vertical)
                        .lineLimit(2...6)
                    TextField("English", text: $closingEn, axis: .vertical)
                        .lineLimit(2...6)
                } header: {
                    Text("Schlusstext")
                } footer: {
                    Text("Optional. Wird in der jeweiligen Sprache unter die Beschreibung gesetzt.")
                }

                Section {
                    Button(action: save) {
                        Label(justSaved ? "Gespeichert" : "Speichern",
                              systemImage: justSaved ? "checkmark" : "square.and.arrow.down")
                            .frame(maxWidth: .infinity)
                            .fontWeight(.semibold)
                    }
                } footer: {
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Einstellungen")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern", action: save)
                }
            }
            .sensoryFeedback(.success, trigger: saveCount)
            .onAppear(perform: loadOnce)
        }
    }

    private func loadOnce() {
        guard !loaded else { return }
        loaded = true
        mode = store.mode ?? .openrouter
        apiKeyHint = store.secret(.apiKey).map(SettingsStore.masked)
        serverUrl = store.serverUrl ?? ""
        tokenHint = store.secret(.serverToken).map(SettingsStore.masked)
        language = store.language ?? .de
        tone = store.tone ?? .sachlich
        closingDe = store.closingTextDe ?? ""
        closingEn = store.closingTextEn ?? ""
    }

    private func save() {
        let url = serverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if !url.isEmpty, !Self.isHTTPS(url) {
            errorMessage = "Die Server-URL muss mit https:// beginnen."
            return
        }

        // Empty secret fields mean "keep the saved value".
        let key = apiKeyInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !key.isEmpty {
            guard store.setSecret(.apiKey, key) else { return keychainFailed() }
            apiKeyHint = SettingsStore.masked(key)
            apiKeyInput = ""
        }
        let token = tokenInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !token.isEmpty {
            guard store.setSecret(.serverToken, token) else { return keychainFailed() }
            tokenHint = SettingsStore.masked(token)
            tokenInput = ""
        }

        store.mode = mode
        store.serverUrl = url
        store.language = language
        store.tone = tone
        store.closingTextDe = closingDe
        store.closingTextEn = closingEn

        errorMessage = nil
        saveCount += 1
        justSaved = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            justSaved = false
        }
    }

    private func keychainFailed() {
        errorMessage = "Konnte nicht im Schlüsselbund speichern. Ist „Keychain Sharing“ für die App eingerichtet?"
    }

    private static func isHTTPS(_ string: String) -> Bool {
        guard let components = URLComponents(string: string) else { return false }
        return components.scheme?.lowercased() == "https" && !(components.host ?? "").isEmpty
    }
}

/// Saved-secret rows: masked hint ("••••abcd") with a remove button, then an entry field.
private struct SecretRows: View {
    let placeholder: String
    @Binding var input: String
    let hint: String?
    let onRemove: () -> Void

    var body: some View {
        if let hint {
            LabeledContent("Gespeichert") {
                Text(hint).monospaced()
            }
            Button("Entfernen", role: .destructive, action: onRemove)
        }
        SecureField(hint == nil ? placeholder : "Neuen Wert eingeben", text: $input)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
    }
}

#Preview {
    SettingsView()
}
