import Foundation

public enum SyncChoice: String, Equatable {
  case local
  case remote
  case merge
}

public enum CloudMerge {
  public static func choose(
    local: AppState,
    remote: AppState?,
    lastUid: String?,
    uid: String,
    pullRemote: Bool,
    replaceAll: Bool
  ) -> SyncChoice {
    if replaceAll { return .local }
    if let lastUid, lastUid != uid { return remote == nil ? .local : .remote }
    if remote == nil { return .local }
    if pullRemote || (lastUid == nil && AppState.localLooksEmpty(local)) { return .remote }
    return .merge
  }

  public static func merge(_ a: AppState, _ b: AppState, now: Double = Clock.now()) -> AppState {
    let removed = Tombstones(
      ids: mergeTomb(a.removed.ids, b.removed.ids),
      reasons: mergeTomb(a.removed.reasons, b.removed.reasons),
      checkins: mergeTomb(a.removed.checkins, b.removed.checkins)
    )
    var checkins: [String: Checkin] = [:]
    for map in [a.checkins, b.checkins] {
      for (key, item) in map {
        if (removed.checkins[key] ?? 0) > 0, (removed.checkins[key] ?? 0) >= item.score { continue }
        if checkins[key] == nil || item.score > checkins[key]!.score { checkins[key] = item }
      }
    }
    for key in Array(checkins.keys) {
      if (removed.checkins[key] ?? 0) > 0, (removed.checkins[key] ?? 0) >= checkins[key]!.score {
        checkins.removeValue(forKey: key)
      }
    }
    let takeA = a.streakStartSetAt > b.streakStartSetAt
      || (a.streakStartSetAt == b.streakStartSetAt && a.streakStart >= b.streakStart)
    let goalA = a.goalSetAt >= b.goalSetAt
    let nameA = a.displayNameSetAt >= b.displayNameSetAt
    let avatarA = a.avatarSetAt >= b.avatarSetAt
    let resetA = a.resetTypesSetAt >= b.resetTypesSetAt
    let manualA = a.manualStreakStartSetAt >= b.manualStreakStartSetAt
    var merged = AppState(
      createdAt: min(a.createdAt, b.createdAt),
      streakStart: takeA ? a.streakStart : b.streakStart,
      bestStreakMs: max(a.bestStreakMs, b.bestStreakMs),
      checkins: checkins,
      relapses: byId(a.relapses, b.relapses, removed: removed.ids),
      urges: byIdUrge(a.urges, b.urges, removed: removed.ids),
      reasons: mergeReasons(a.reasons, b.reasons, removed: removed.reasons),
      goalDays: goalA ? a.goalDays : b.goalDays,
      goalSetAt: max(a.goalSetAt, b.goalSetAt),
      displayName: nameA ? a.displayName : b.displayName,
      displayNameSetAt: max(a.displayNameSetAt, b.displayNameSetAt),
      avatarDataUrl: avatarA ? a.avatarDataUrl : b.avatarDataUrl,
      avatarSetAt: max(a.avatarSetAt, b.avatarSetAt),
      resetTypes: resetA ? a.resetTypes : b.resetTypes,
      resetTypesSetAt: max(a.resetTypesSetAt, b.resetTypesSetAt),
      manualStreakStart: manualA ? a.manualStreakStart : b.manualStreakStart,
      manualStreakStartSetAt: max(a.manualStreakStartSetAt, b.manualStreakStartSetAt),
      streakStartSetAt: max(a.streakStartSetAt, b.streakStartSetAt),
      removed: removed
    )
    let computed = Streak.computeStreakStart(merged.streakInput(), now: now)
    if computed != merged.streakStart {
      merged.streakStart = computed
      merged.streakStartSetAt = max(merged.streakStartSetAt, now)
    }
    merged.bestStreakMs = Streak.historicalBest(merged.streakInput())
    return merged
  }

  public static func mergeTomb(_ a: [String: Double], _ b: [String: Double]) -> [String: Double] {
    var out: [String: Double] = [:]
    for map in [a, b] {
      for (key, value) in map {
        if out[key] == nil || abs(value) > abs(out[key]!) { out[key] = value }
      }
    }
    return out
  }

  private static func byId(_ x: [Relapse], _ y: [Relapse], removed: [String: Double]) -> [Relapse] {
    var map: [String: Relapse] = [:]
    var order: [String] = []
    for r in x + y {
      if map[r.id] == nil {
        order.append(r.id)
        map[r.id] = r
      } else if (r.editedAt ?? 0) > (map[r.id]?.editedAt ?? 0) {
        map[r.id] = r
      }
    }
    return order
      .filter { (removed[$0] ?? 0) <= 0 }
      .compactMap { map[$0] }
      .sorted { $0.ts < $1.ts }
  }

  private static func byIdUrge(_ x: [Urge], _ y: [Urge], removed: [String: Double]) -> [Urge] {
    var map: [String: Urge] = [:]
    var order: [String] = []
    for r in x + y {
      if map[r.id] == nil {
        order.append(r.id)
        map[r.id] = r
      }
    }
    return order
      .filter { (removed[$0] ?? 0) <= 0 }
      .compactMap { map[$0] }
      .sorted { $0.ts < $1.ts }
  }

  private static func mergeReasons(_ a: [String], _ b: [String], removed: [String: Double]) -> [String] {
    var reasons: [String] = []
    for r in a + b where !reasons.contains(r) && (removed[r] ?? 0) <= 0 {
      reasons.append(r)
    }
    return reasons
  }
}

public struct ZenFlowExport: Equatable {
  public var app: String
  public var exportedAt: String
  public var source: String
  public var profile: ProfileSnapshot
  public var data: AppState
  public var theme: String
  public var note: String?

  public init(
    app: String = "ZenFlow",
    exportedAt: String,
    source: String,
    profile: ProfileSnapshot,
    data: AppState,
    theme: String,
    note: String? = nil
  ) {
    self.app = app
    self.exportedAt = exportedAt
    self.source = source
    self.profile = profile
    self.data = data
    self.theme = theme
    self.note = note
  }

  public func jsonValue() -> JSONValue {
    var profile: [String: JSONValue] = [
      "display_name": .string(self.profile.displayName),
      "handle": .string(self.profile.handle),
      "avatar_url": .string(self.profile.avatarURL)
    ]
    if let created = self.profile.createdAt { profile["created_at"] = .string(created) }
    else { profile["created_at"] = .null }
    var root: [String: JSONValue] = [
      "app": .string(app),
      "exportedAt": .string(exportedAt),
      "source": .string(source),
      "profile": .object(profile),
      "data": data.jsonValue(),
      "settings": .object(["theme": .string(theme)])
    ]
    if let note, !note.isEmpty { root["note"] = .string(note) }
    return .object(root)
  }
}

public struct ProfileSnapshot: Equatable {
  public var displayName: String
  public var handle: String
  public var avatarURL: String
  public var createdAt: String?

  public init(displayName: String = "", handle: String = "", avatarURL: String = "", createdAt: String? = nil) {
    self.displayName = displayName
    self.handle = handle
    self.avatarURL = avatarURL
    self.createdAt = createdAt
  }
}

public enum ImportPack {
  public static func parse(_ value: JSONValue, now: Double = Clock.now()) throws -> (state: AppState, theme: String?) {
    let root = value.object
    let data = root?["data"] ?? value
    let state = try AppState.sanitize(data, now: now)
    var theme: String?
    if let raw = root?["settings"]?.object?["theme"]?.string, ["system", "light", "dark"].contains(raw) {
      theme = raw
    }
    return (state, theme)
  }
}

public enum HandleRules {
  public static let pattern = #"^[a-z0-9_]{3,20}$"#

  public static func normalize(_ raw: String) -> String {
    var s = raw
    while s.hasPrefix("@") { s.removeFirst() }
    s = s.lowercased()
    s = s.unicodeScalars.filter { scalar in
      (scalar.value >= 97 && scalar.value <= 122) || (scalar.value >= 48 && scalar.value <= 57) || scalar.value == 95
    }.map { Character($0) }.reduce(into: "") { $0.append($1) }
    return String(s.prefix(20))
  }

  public static func problem(_ handle: String) -> String? {
    if handle.isEmpty { return "请设置一个 @ID" }
    if handle.count < 3 { return "@ID 至少 3 位" }
    if handle.range(of: pattern, options: .regularExpression) == nil {
      return "@ID 只能使用小写字母、数字或下划线"
    }
    return nil
  }
}

public enum InviteRules {
  public static func normalize(_ raw: String) -> String {
    raw.replacingOccurrences(of: "\\s+", with: "", options: .regularExpression).uppercased()
  }

  public static func formatOK(_ code: String) -> Bool {
    code.range(of: #"^[A-Z0-9-]{6,32}$"#, options: .regularExpression) != nil
  }
}

public enum AuthCopy {
  public static func message(text: String, code: String = "") -> String {
    let m = text
    let both = m + code
    if m.range(of: "HANDLE_TAKEN") != nil { return "@ID 已被占用" }
    if m.range(of: "HANDLE_INVALID") != nil { return "@ID 需为 3–20 位小写字母、数字或下划线" }
    if m.range(of: "Database error saving new user|INVITE_INVALID", options: .regularExpression) != nil {
      return "邀请码无效、已过期或已使用"
    }
    if m.range(of: "Invalid login credentials", options: .caseInsensitive) != nil || code == "invalid_credentials" {
      return "邮箱或密码不正确"
    }
    if m.range(of: "Email not confirmed", options: .caseInsensitive) != nil { return "邮箱还没确认" }
    if both.range(of: "already registered|already been registered|user_already_exists", options: [.regularExpression, .caseInsensitive]) != nil {
      return "邮箱已注册，请登录"
    }
    if both.range(of: "Password should be|weak_password|password.*(short|characters)", options: [.regularExpression, .caseInsensitive]) != nil {
      return "密码至少 8 位"
    }
    if code == "otp_expired" || both.range(of: "otp_expired|token has expired or is invalid|invalid otp|otp.*invalid", options: [.regularExpression, .caseInsensitive]) != nil {
      return "验证码错误或已过期"
    }
    if both.range(of: "rate limit|too many|over_(email|sms)_send_rate_limit|only request this after|429", options: [.regularExpression, .caseInsensitive]) != nil {
      return "操作太频繁"
    }
    if both.range(of: "captcha", options: .caseInsensitive) != nil { return "请完成验证" }
    if both.range(of: "invalid.*email|email.*invalid|validation_failed", options: [.regularExpression, .caseInsensitive]) != nil {
      return "邮箱格式不正确"
    }
    if both.range(of: "signups? not allowed|signup_disabled", options: [.regularExpression, .caseInsensitive]) != nil {
      return "服务器已关闭注册"
    }
    if m.range(of: "Failed to fetch|NetworkError|Load failed|network", options: [.regularExpression, .caseInsensitive]) != nil {
      return "网络失败"
    }
    if m.range(of: "ADMIN_CANNOT_DELETE") != nil { return "管理员账号不能注销" }
    if m.range(of: "NOT_AUTHENTICATED") != nil { return "请先登录" }
    if m.range(of: "payload too large|exceeded the maximum|file size|entity too large", options: [.regularExpression, .caseInsensitive]) != nil {
      return "图片超过 2MB"
    }
    if m.range(of: "mime type|invalid_mime|content type.*not allowed", options: [.regularExpression, .caseInsensitive]) != nil {
      return "只支持 PNG、JPG、WebP 或 GIF"
    }
    if m.range(of: "INVITE_INVALID") != nil { return "邀请码无效、已过期或已被使用" }
    if m.range(of: "JWT|session|refresh_token", options: [.regularExpression, .caseInsensitive]) != nil {
      return "登录已过期"
    }
    if m.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "出现未知错误" }
    return m
  }
}
