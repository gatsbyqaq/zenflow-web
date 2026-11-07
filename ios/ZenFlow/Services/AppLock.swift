import LocalAuthentication
import SwiftUI

enum LockGrace: String, Equatable, Hashable {
  case now, m1, m5

  var seconds: TimeInterval {
    switch self {
    case .now: return 0
    case .m1: return 60
    case .m5: return 300
    }
  }

  func label(_ lang: AppLanguage) -> String {
    switch self {
    case .now: return lang.t("立即", "Now")
    case .m1: return lang.t("1 分钟", "1 min")
    case .m5: return lang.t("5 分钟", "5 min")
    }
  }
}

@MainActor
@Observable
final class AppLockController {
  var enabled: Bool
  var grace: LockGrace
  var locked = false
  private var leftAt: Date?
  private var authenticating = false

  init() {
    let defaults = UserDefaults.standard
    enabled = defaults.bool(forKey: Keys.enabled)
    grace = LockGrace(rawValue: defaults.string(forKey: Keys.grace) ?? "") ?? .now
    if enabled { locked = true }
  }

  func setEnabled(_ on: Bool) async -> Bool {
    let ok = await authenticate()
    guard ok else { return false }
    enabled = on
    locked = false
    UserDefaults.standard.set(on, forKey: Keys.enabled)
    return true
  }

  func setGrace(_ next: LockGrace) {
    grace = next
    UserDefaults.standard.set(next.rawValue, forKey: Keys.grace)
  }

  func scene(_ phase: ScenePhase) {
    guard enabled else {
      locked = false
      return
    }
    switch phase {
    case .background:
      leftAt = Date()
      if grace == .now { locked = true }
    case .active:
      guard let left = leftAt else { return }
      let away = Date().timeIntervalSince(left)
      leftAt = nil
      if away >= grace.seconds { locked = true }
    default:
      break
    }
  }

  func unlock() async {
    guard locked, !authenticating else { return }
    authenticating = true
    let ok = await authenticate()
    authenticating = false
    if ok { locked = false }
  }

  private func authenticate() async -> Bool {
    let context = LAContext()
    context.localizedCancelTitle = AppLanguage.stored.t("取消", "Cancel")
    var error: NSError?
    let biometric = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    let policy: LAPolicy = biometric ? .deviceOwnerAuthenticationWithBiometrics : .deviceOwnerAuthentication
    guard context.canEvaluatePolicy(policy, error: &error) else { return false }
    let reason = AppLanguage.stored.t("用面容 ID 解锁", "Unlock with Face ID")
    return await withCheckedContinuation { continuation in
      context.evaluatePolicy(policy, localizedReason: reason) { ok, _ in
        continuation.resume(returning: ok)
      }
    }
  }

  private enum Keys {
    static let enabled = "zenflow_lock"
    static let grace = "zenflow_lock_grace"
  }
}
