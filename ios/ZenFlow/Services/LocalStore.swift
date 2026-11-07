import Foundation

enum LocalStore {
  private static let stateName = "zenflow_v1.json"
  private static let themeKey = "zenflow_theme"
  private static let uidKey = "zenflow_cloud_uid"
  private static let syncKey = "zenflow_cloud_last_sync"
  private static let pullKey = "zenflow_pull_remote"

  static func loadState() -> AppState {
    guard let data = try? Data(contentsOf: fileURL()),
          let value = try? JSONValue.parse(data),
          let state = try? AppState.sanitize(value)
    else { return AppState.fresh() }
    return state
  }

  static func save(_ state: AppState) {
    guard let data = try? state.jsonValue().data() else { return }
    try? FileManager.default.createDirectory(at: directory(), withIntermediateDirectories: true)
    try? data.write(to: fileURL(), options: .atomic)
  }

  static func theme() -> ThemeChoice {
    guard let raw = UserDefaults.standard.string(forKey: themeKey) else { return .system }
    return ThemeChoice(rawValue: raw) ?? .system
  }

  static func setTheme(_ theme: ThemeChoice) {
    if theme == .system { UserDefaults.standard.removeObject(forKey: themeKey) }
    else { UserDefaults.standard.set(theme.rawValue, forKey: themeKey) }
  }

  static func lastUid() -> String? { UserDefaults.standard.string(forKey: uidKey) }
  static func setLastUid(_ uid: String) { UserDefaults.standard.set(uid, forKey: uidKey) }
  static func lastSync() -> Double { UserDefaults.standard.double(forKey: syncKey) }
  static func setLastSync(_ ms: Double) { UserDefaults.standard.set(ms, forKey: syncKey) }
  static func pullRemote() -> Bool { UserDefaults.standard.string(forKey: pullKey) == "1" }

  static func wipeDevice() {
    try? FileManager.default.removeItem(at: fileURL())
    let defaults = UserDefaults.standard
    for key in [themeKey, uidKey, syncKey, pullKey] { defaults.removeObject(forKey: key) }
    defaults.set("1", forKey: pullKey)
  }

  private static func directory() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? FileManager.default.temporaryDirectory
    return base.appendingPathComponent("ZenFlow", isDirectory: true)
  }

  private static func fileURL() -> URL {
    directory().appendingPathComponent(stateName)
  }
}
