import SwiftUI
import UIKit

@main
struct ThriftApp: App {
    init() {
        // Serif display face for the large navigation titles only. SwiftUI's `.fontDesign(.serif)`
        // does not reach the UIKit navigation bar, and applying it to the stack would turn every
        // row serif, so the large title is styled through the bar appearance instead.
        let largeTitle = UIFont.preferredFont(forTextStyle: .largeTitle)
        if let serif = largeTitle.fontDescriptor.withDesign(.serif)?.withSymbolicTraits(.traitBold) {
            UINavigationBar.appearance().largeTitleTextAttributes = [.font: UIFont(descriptor: serif, size: 0)]
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .tint(Color("AccentColor"))
        }
    }
}
