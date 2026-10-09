import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            SetupView()
                .tabItem { Label("Einrichtung", systemImage: "checklist") }
            SettingsView()
                .tabItem { Label("Einstellungen", systemImage: "gearshape") }
        }
    }
}

#Preview {
    ContentView()
        .tint(Color("AccentColor"))
}
