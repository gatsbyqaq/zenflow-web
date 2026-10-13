import Foundation

public struct Checkin: Equatable {
  public var mood: Int
  public var ts: Double
  public var note: String?
  public var editedAt: Double?

  public init(mood: Int, ts: Double, note: String? = nil, editedAt: Double? = nil) {
    self.mood = mood
    self.ts = ts
    self.note = note
    self.editedAt = editedAt
  }

  public var score: Double { max(ts, editedAt ?? 0) }
}

public struct Relapse: Equatable, Identifiable {
  public var id: String
  public var ts: Double
  public var triggers: [String]
  public var other: String
  public var note: String
  public var streakMs: Double
  public var types: [String]
  public var editedAt: Double?

  public init(
    id: String,
    ts: Double,
    triggers: [String] = [],
    other: String = "",
    note: String = "",
    streakMs: Double = 0,
    types: [String] = [],
    editedAt: Double? = nil
  ) {
    self.id = id
    self.ts = ts
    self.triggers = triggers
    self.other = other
    self.note = note
    self.streakMs = streakMs
    self.types = types
    self.editedAt = editedAt
  }
}

public struct Urge: Equatable, Identifiable {
  public var id: String
  public var ts: Double

  public init(id: String, ts: Double) {
    self.id = id
    self.ts = ts
  }
}

public struct Tombstones: Equatable {
  public var ids: [String: Double]
  public var reasons: [String: Double]
  public var checkins: [String: Double]

  public init(
    ids: [String: Double] = [:],
    reasons: [String: Double] = [:],
    checkins: [String: Double] = [:]
  ) {
    self.ids = ids
    self.reasons = reasons
    self.checkins = checkins
  }

  public var isEmpty: Bool { ids.isEmpty && reasons.isEmpty && checkins.isEmpty }
}

public struct AppState: Equatable {
  public var version: Int
  public var createdAt: Double
  public var streakStart: Double
  public var bestStreakMs: Double
  public var checkins: [String: Checkin]
  public var relapses: [Relapse]
  public var urges: [Urge]
  public var reasons: [String]
  public var goalDays: Int
  public var goalSetAt: Double
  public var displayName: String
  public var displayNameSetAt: Double
  public var avatarDataUrl: String
  public var avatarSetAt: Double
  public var resetTypes: [String: Bool]
  public var resetTypesSetAt: Double
  public var manualStreakStart: Double
  public var manualStreakStartSetAt: Double
  public var streakStartSetAt: Double
  public var removed: Tombstones

  public init(
    version: Int = 1,
    createdAt: Double,
    streakStart: Double,
    bestStreakMs: Double = 0,
    checkins: [String: Checkin] = [:],
    relapses: [Relapse] = [],
    urges: [Urge] = [],
    reasons: [String] = [],
    goalDays: Int = 30,
    goalSetAt: Double = 0,
    displayName: String = "",
    displayNameSetAt: Double = 0,
    avatarDataUrl: String = "",
    avatarSetAt: Double = 0,
    resetTypes: [String: Bool] = Streak.defaultResetTypes(),
    resetTypesSetAt: Double = 0,
    manualStreakStart: Double = 0,
    manualStreakStartSetAt: Double = 0,
    streakStartSetAt: Double = 0,
    removed: Tombstones = Tombstones()
  ) {
    self.version = version
    self.createdAt = createdAt
    self.streakStart = streakStart
    self.bestStreakMs = bestStreakMs
    self.checkins = checkins
    self.relapses = relapses
    self.urges = urges
    self.reasons = reasons
    self.goalDays = goalDays
    self.goalSetAt = goalSetAt
    self.displayName = displayName
    self.displayNameSetAt = displayNameSetAt
    self.avatarDataUrl = avatarDataUrl
    self.avatarSetAt = avatarSetAt
    self.resetTypes = resetTypes
    self.resetTypesSetAt = resetTypesSetAt
    self.manualStreakStart = manualStreakStart
    self.manualStreakStartSetAt = manualStreakStartSetAt
    self.streakStartSetAt = streakStartSetAt
    self.removed = removed
  }

  public static func fresh(now: Double = Date().timeIntervalSince1970 * 1000) -> AppState {
    AppState(
      createdAt: now,
      streakStart: now,
      resetTypes: Streak.defaultResetTypes(),
      streakStartSetAt: now
    )
  }

  public func streakInput() -> Streak.Input {
    Streak.Input(
      createdAt: createdAt,
      manualStreakStart: manualStreakStart,
      resetTypes: resetTypes,
      relapses: relapses.map { Streak.Event(id: $0.id, ts: $0.ts, types: $0.types, streakMs: $0.streakMs) },
      bestStreakMs: bestStreakMs,
      streakStart: streakStart
    )
  }

  public func jsonValue() -> JSONValue {
    var checkinMap: [String: JSONValue] = [:]
    for (key, item) in checkins {
      var row: [String: JSONValue] = [
        "mood": .number(Double(item.mood)),
        "ts": .number(item.ts)
      ]
      if let note = item.note, !note.isEmpty { row["note"] = .string(note) }
      if let edited = item.editedAt, edited > 0 { row["editedAt"] = .number(edited) }
      checkinMap[key] = .object(row)
    }
    let relapseRows: [JSONValue] = relapses.map { r in
      var row: [String: JSONValue] = [
        "id": .string(r.id),
        "ts": .number(r.ts),
        "triggers": .array(r.triggers.map { .string($0) }),
        "other": .string(r.other),
        "note": .string(r.note),
        "streakMs": .number(r.streakMs),
        "types": .array(r.types.map { .string($0) })
      ]
      if let edited = r.editedAt, edited > 0 { row["editedAt"] = .number(edited) }
      return .object(row)
    }
    let urgeRows: [JSONValue] = urges.map {
      .object(["id": .string($0.id), "ts": .number($0.ts)])
    }
    func tomb(_ map: [String: Double]) -> JSONValue {
      .object(map.mapValues { .number($0) })
    }
    var reset: [String: JSONValue] = [:]
    for (k, v) in resetTypes { reset[k] = .bool(v) }
    return .object([
      "version": .number(Double(version)),
      "createdAt": .number(createdAt),
      "streakStart": .number(streakStart),
      "bestStreakMs": .number(bestStreakMs),
      "checkins": .object(checkinMap),
      "relapses": .array(relapseRows),
      "urges": .array(urgeRows),
      "reasons": .array(reasons.map { .string($0) }),
      "goalDays": .number(Double(goalDays)),
      "goalSetAt": .number(goalSetAt),
      "displayName": .string(displayName),
      "displayNameSetAt": .number(displayNameSetAt),
      "avatarDataUrl": .string(avatarDataUrl),
      "avatarSetAt": .number(avatarSetAt),
      "resetTypes": .object(reset),
      "resetTypesSetAt": .number(resetTypesSetAt),
      "manualStreakStart": .number(manualStreakStart),
      "manualStreakStartSetAt": .number(manualStreakStartSetAt),
      "streakStartSetAt": .number(streakStartSetAt),
      "removed": .object([
        "ids": tomb(removed.ids),
        "reasons": tomb(removed.reasons),
        "checkins": tomb(removed.checkins)
      ])
    ])
  }

  public func stable() -> String { jsonValue().stable() }

  public static func sanitize(_ value: JSONValue, now: Double = Date().timeIntervalSince1970 * 1000) throws -> AppState {
    guard let o = value.object else { throw ZenFlowError.format("格式不正确") }
    guard let streak = o["streakStart"]?.number, streak.isFinite else {
      throw ZenFlowError.format("缺少有效的 streakStart")
    }
    var s = AppState.fresh(now: now)
    s.streakStart = min(streak, now)
    s.createdAt = positive(o["createdAt"]) ?? s.streakStart
    if let best = o["bestStreakMs"]?.number, best.isFinite, best >= 0 { s.bestStreakMs = best }
    else { s.bestStreakMs = 0 }

    if let map = o["checkins"]?.object {
      var checkins: [String: Checkin] = [:]
      for (key, raw) in map {
        guard key.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              let c = raw.object,
              let mood = c["mood"]?.number, mood >= 1, mood <= 5
        else { continue }
        var item = Checkin(mood: Int(mood.rounded()), ts: c["ts"]?.number ?? 0)
        if let note = c["note"]?.string, !note.isEmpty { item.note = String(note.prefix(500)) }
        if let edited = c["editedAt"]?.number, edited.isFinite, edited > 0 { item.editedAt = edited }
        checkins[key] = item
      }
      s.checkins = checkins
    }

    if let rows = o["relapses"]?.array {
      s.relapses = rows.compactMap { raw -> Relapse? in
        guard let r = raw.object, let ts = r["ts"]?.number, ts.isFinite else { return nil }
        let triggers = (r["triggers"]?.array ?? []).compactMap(\.string).prefix(10).map { String($0) }
        var row = Relapse(
          id: r["id"]?.string.map { String($0) } ?? ID.make(now: now),
          ts: ts,
          triggers: Array(triggers),
          other: r["other"]?.string.map { String($0.prefix(40)) } ?? "",
          note: r["note"]?.string.map { String($0.prefix(1000)) } ?? "",
          streakMs: r["streakMs"]?.number ?? 0,
          types: Streak.normalizeTypes((r["types"]?.array ?? []).compactMap(\.string))
        )
        if let edited = r["editedAt"]?.number, edited.isFinite, edited > 0 { row.editedAt = edited }
        return row
      }
    }

    if let rows = o["urges"]?.array {
      s.urges = rows.compactMap { raw -> Urge? in
        guard let u = raw.object, let ts = u["ts"]?.number, ts.isFinite else { return nil }
        return Urge(id: u["id"]?.string ?? ID.make(now: now), ts: ts)
      }
    }

    if let reasons = o["reasons"]?.array {
      s.reasons = Array(reasons.compactMap(\.string).filter { !$0.isEmpty }.prefix(50))
    }

    if let g = o["goalDays"]?.number {
      let rounded = Int(g.rounded())
      s.goalDays = (rounded >= 1 && rounded <= 3650) ? rounded : 30
    } else {
      s.goalDays = 30
    }
    s.goalSetAt = positive(o["goalSetAt"]) ?? 0
    s.displayName = o["displayName"]?.string.map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(20)) } ?? ""
    s.displayNameSetAt = positive(o["displayNameSetAt"]) ?? 0
    if let avatar = o["avatarDataUrl"]?.string, avatar.hasPrefix("data:image/"), avatar.count <= 180_000 {
      s.avatarDataUrl = avatar
      s.avatarSetAt = positive(o["avatarSetAt"]) ?? 0
    } else {
      s.avatarDataUrl = ""
      s.avatarSetAt = 0
    }
    s.streakStartSetAt = (o["streakStartSetAt"]?.number?.isFinite == true) ? (o["streakStartSetAt"]?.number ?? 0) : 0

    var rawReset: [String: Bool] = [:]
    if let map = o["resetTypes"]?.object {
      for id in Streak.typeIDs {
        if let b = map[id]?.bool { rawReset[id] = b }
      }
    }
    s.resetTypes = o["resetTypes"] == nil ? Streak.defaultResetTypes() : Streak.normalizeResetTypes(rawReset)
    s.resetTypesSetAt = positive(o["resetTypesSetAt"]) ?? 0

    if let manual = o["manualStreakStart"]?.number, manual.isFinite, manual > 0 {
      s.manualStreakStart = min(manual, now)
      s.manualStreakStartSetAt = positive(o["manualStreakStartSetAt"]) ?? 0
    } else if o["manualStreakStart"] == nil,
              Streak.looksLikeManualStart(
                streakStart: s.streakStart,
                createdAt: s.createdAt,
                relapses: s.relapses.map { Streak.Event(id: $0.id, ts: $0.ts, types: $0.types) }
              ) {
      s.manualStreakStart = s.streakStart
      s.manualStreakStartSetAt = s.streakStartSetAt > 0 ? s.streakStartSetAt : (s.streakStart > 0 ? s.streakStart : 1)
    } else {
      s.manualStreakStart = 0
      s.manualStreakStartSetAt = positive(o["manualStreakStartSetAt"]) ?? 0
    }

    s.removed = Tombstones(
      ids: readTomb(o["removed"]?.object?["ids"]),
      reasons: readTomb(o["removed"]?.object?["reasons"]),
      checkins: readTomb(o["removed"]?.object?["checkins"])
    )
    return s
  }

  public static func currentMs(_ state: AppState, now: Double = Date().timeIntervalSince1970 * 1000) -> Double {
    max(0, now - state.streakStart)
  }

  public static func bestMs(_ state: AppState, now: Double = Date().timeIntervalSince1970 * 1000) -> Double {
    max(state.bestStreakMs, currentMs(state, now: now))
  }

  @discardableResult
  public static func applyStreak(_ state: inout AppState, touchSetAt: Bool, now: Double = Date().timeIntervalSince1970 * 1000) -> Bool {
    let next = Streak.computeStreakStart(state.streakInput(), now: now)
    let changed = next != state.streakStart
    state.streakStart = next
    state.bestStreakMs = Streak.historicalBest(state.streakInput())
    if touchSetAt && changed { state.streakStartSetAt = now }
    return changed
  }

  public static func endedStreakMs(_ state: AppState, ts: Double, types: [String], ignoreId: String?) -> Double {
    Streak.endedStreakMs(state.streakInput(), ts: ts, types: types, ignoreId: ignoreId)
  }

  public static func previewStart(_ state: AppState, ts: Double, types: [String], now: Double = Date().timeIntervalSince1970 * 1000) -> Double {
    var input = state.streakInput()
    input.relapses.append(Streak.Event(ts: ts, types: types))
    return Streak.computeStreakStart(input, now: now)
  }

  public static func fmtDays(_ ms: Double) -> String {
    let d = ms / Streak.day
    if d >= 10 { return String(Int(floor(d))) }
    return String(floor(d * 10) / 10)
  }

  public static func dateKey(_ ms: Double) -> String {
    let date = Date(timeIntervalSince1970: ms / 1000)
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = .current
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
  }

  public static func fmtDT(_ ms: Double) -> String {
    let date = Date(timeIntervalSince1970: ms / 1000)
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = .current
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy/MM/dd HH:mm"
    return f.string(from: date)
  }

  public static func localLooksEmpty(_ s: AppState) -> Bool {
    if !s.checkins.isEmpty { return false }
    if !s.relapses.isEmpty { return false }
    if !s.urges.isEmpty { return false }
    if !s.reasons.isEmpty { return false }
    if !s.displayName.isEmpty || !s.avatarDataUrl.isEmpty { return false }
    if s.goalSetAt > 0 || s.resetTypesSetAt > 0 || s.manualStreakStartSetAt > 0 || s.bestStreakMs > 0 { return false }
    if !s.removed.ids.isEmpty || !s.removed.reasons.isEmpty || !s.removed.checkins.isEmpty { return false }
    return true
  }

  private static func positive(_ value: JSONValue?) -> Double? {
    guard let n = value?.number, n.isFinite, n > 0 else { return nil }
    return n
  }

  private static func readTomb(_ value: JSONValue?) -> [String: Double] {
    guard let map = value?.object else { return [:] }
    var out: [String: Double] = [:]
    for key in map.keys.prefix(5000) {
      let clipped = String(key.prefix(200))
      if let n = map[key]?.number, n.isFinite { out[clipped] = n }
    }
    return out
  }
}

public enum ID {
  public static func make(now: Double = Date().timeIntervalSince1970 * 1000) -> String {
    let stamp = String(Int(now), radix: 36)
    let rand = String(Int.random(in: 0..<(36 * 36 * 36 * 36 * 36)), radix: 36)
    return stamp + rand
  }
}

public enum Clock {
  public static func now() -> Double { Date().timeIntervalSince1970 * 1000 }
}
