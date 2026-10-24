import SwiftUI

@main
struct ZenFlowApp: App {
  @State private var model = AppModel()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(model)
        .preferredColorScheme(model.theme.colorScheme)
        .tint(ZFColor.primary)
    }
  }
}
