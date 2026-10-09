import SwiftUI
import UIKit

/// "Einrichtung": how to enable the Safari extension, plus a live status row.
struct SetupView: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var refreshID = UUID()

    private static let vintedURL = URL(string: "https://www.vinted.de/items/new")!
    /// iOS 17+: `x-safari-https://` opens the page in Safari even if another browser is the default.
    private static let vintedInSafariURL = URL(string: "x-safari-https://www.vinted.de/items/new")!

    var body: some View {
        NavigationStack {
            List {
                Section {
                    // Re-reads `lastSeen` from the App Group every 15 s and when the app comes back.
                    TimelineView(.periodic(from: .now, by: 15)) { context in
                        StatusRow(lastSeen: SettingsStore().lastSeen, now: context.date)
                    }
                    .id(refreshID)
                }

                Section {
                    StepRow(
                        number: 1, symbol: "puzzlepiece.extension",
                        title: "Erweiterung einschalten",
                        detail: "Einstellungen → Apps → Safari → Erweiterungen → „Thrift“ einschalten. (iOS 17: Einstellungen → Safari → Erweiterungen)"
                    )
                    StepRow(
                        number: 2, symbol: "checkmark.shield",
                        title: "vinted.de erlauben",
                        detail: "Unter „Thrift“ bei „Alle Websites“ oder „vinted.de“ „Erlauben“ wählen."
                    )
                    StepRow(
                        number: 3, symbol: "safari",
                        title: "Vinted in Safari öffnen",
                        detail: "Neuen Artikel anlegen, Fotos hinzufügen und auf „✨ Ausfüllen“ tippen. Hochladen tippst du selbst."
                    )
                    Button {
                        openURL(Self.vintedInSafariURL) { accepted in
                            if !accepted { openURL(Self.vintedURL) }
                        }
                    } label: {
                        Label("vinted.de/items/new öffnen", systemImage: "arrow.up.forward.app")
                    }
                } header: {
                    Text("In drei Schritten")
                }

                Section {
                    Button {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    } label: {
                        Label("Safari-Einstellungen öffnen", systemImage: "gear")
                    }
                } footer: {
                    Text("iOS erlaubt Apps keinen direkten Sprung zu den Safari-Erweiterungen. Die Taste öffnet die Einstellungen – von dort: Apps → Safari → Erweiterungen.")
                }
            }
            .navigationTitle("Einrichtung")
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { refreshID = UUID() }
            }
        }
    }
}

private struct StatusRow: View {
    let lastSeen: Date?
    let now: Date

    var body: some View {
        if let lastSeen {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Erweiterung aktiv")
                        .font(.headline)
                    Text("zuletzt gesehen \(Self.relative(lastSeen, now: now))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        } else {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Noch nicht aktiv")
                        .font(.headline)
                    Text("Erscheint, sobald Thrift in Safari auf vinted.de geladen wurde.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "circle.dashed")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private static func relative(_ date: Date, now: Date) -> String {
        if now.timeIntervalSince(date) < 60 { return "gerade eben" }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: now)
    }
}

private struct StepRow: View {
    let number: Int
    let symbol: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(Color.accentColor)
                .frame(width: 44, height: 44)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text("\(number). \(title)")
                    .font(.headline)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    SetupView()
}
