import Foundation

/// 与网页 `streak.js` 相同的连续天数规则。
/// 一条破戒会重置连续天数，当且仅当它的类型里至少有一个被设为「重置」。
/// 自慰始终重置。没有类型的旧记录视为重置。
public enum Streak {
  public static let typeIDs = ["masturbation", "porn", "sex", "fantasy", "dream"]
  public static let locked: Set<String> = ["masturbation"]
  public static let day: Double = 86_400_000

  public static func defaultResetTypes() -> [String: Bool] {
    var o: [String: Bool] = [:]
    for id in typeIDs { o[id] = true }
    return o
  }

  public static func normalizeResetTypes(_ raw: [String: Bool]?) -> [String: Bool] {
    var o = defaultResetTypes()
    if let raw {
      for id in typeIDs {
        if locked.contains(id) {
          o[id] = true
          continue
        }
        if let value = raw[id] { o[id] = value }
      }
    }
    o["masturbation"] = true
    return o
  }

  public static func normalizeTypes(_ arr: [String]?) -> [String] {
    var out: [String] = []
    guard let arr else { return out }
    for id in arr {
      if typeIDs.contains(id), !out.contains(id) { out.append(id) }
    }
    if out.count > 5 { out = Array(out.prefix(5)) }
    return out
  }

  public static func relapseResets(types: [String]?, resetTypes: [String: Bool]?) -> Bool {
    let map = normalizeResetTypes(resetTypes)
    let types = normalizeTypes(types)
    if types.isEmpty { return true }
    for id in types where map[id] == true { return true }
    return false
  }

  public struct Input {
    public var createdAt: Double
    public var manualStreakStart: Double
    public var resetTypes: [String: Bool]
    public var relapses: [Event]
    public var bestStreakMs: Double
    public var streakStart: Double?

    public init(
      createdAt: Double,
      manualStreakStart: Double = 0,
      resetTypes: [String: Bool] = Streak.defaultResetTypes(),
      relapses: [Event] = [],
      bestStreakMs: Double = 0,
      streakStart: Double? = nil
    ) {
      self.createdAt = createdAt
      self.manualStreakStart = manualStreakStart
      self.resetTypes = resetTypes
      self.relapses = relapses
      self.bestStreakMs = bestStreakMs
      self.streakStart = streakStart
    }
  }

  public struct Event: Equatable {
    public var id: String
    public var ts: Double
    public var types: [String]
    public var streakMs: Double

    public init(id: String = "", ts: Double, types: [String] = [], streakMs: Double = 0) {
      self.id = id
      self.ts = ts
      self.types = types
      self.streakMs = streakMs
    }
  }

  public static func computeStreakStart(_ s: Input, now: Double = Date().timeIntervalSince1970 * 1000) -> Double {
    var latest: Double = 0
    for r in s.relapses {
      if r.ts > now + 60_000 { continue }
      if !relapseResets(types: r.types, resetTypes: s.resetTypes) { continue }
      if r.ts > latest { latest = r.ts }
    }
    let manual: Double = (s.manualStreakStart.isFinite && s.manualStreakStart > 0)
      ? min(s.manualStreakStart, now) : 0
    let created: Double = (s.createdAt.isFinite && s.createdAt > 0) ? s.createdAt : now
    var start = (manual > 0 && manual >= latest) ? manual : (latest > 0 ? latest : (manual > 0 ? manual : created))
    if start > now { start = now }
    return start
  }

  /// 开始时间对不上「安装时刻」也对不上任何破戒：当成用户手动调整过。
  public static func looksLikeManualStart(streakStart: Double?, createdAt: Double, relapses: [Event]) -> Bool {
    guard let streakStart else { return false }
    if abs(streakStart - createdAt) < 2000 { return false }
    for r in relapses where abs(r.ts - streakStart) < 2000 { return false }
    return true
  }

  /// 这次破戒之前，连续天数从哪一刻算起（不含这次本身）。
  public static func segmentStartBefore(_ s: Input, ts: Double, now: Double = Date().timeIntervalSince1970 * 1000) -> Double {
    let manual: Double = (s.manualStreakStart.isFinite && s.manualStreakStart > 0) ? min(s.manualStreakStart, now) : 0
    let created: Double = (s.createdAt.isFinite && s.createdAt > 0) ? s.createdAt : 0
    var prev = manual > 0 ? manual : created
    for r in s.relapses {
      if r.ts >= ts { continue }
      if !relapseResets(types: r.types, resetTypes: s.resetTypes) { continue }
      if r.ts > prev { prev = r.ts }
    }
    return prev > ts ? ts : prev
  }

  public static func endedStreakMs(_ s: Input, ts: Double, types: [String], ignoreId: String?) -> Double {
    if !relapseResets(types: types, resetTypes: s.resetTypes) { return 0 }
    let rels = s.relapses.filter { ignoreId == nil || $0.id != ignoreId }
    let prev = segmentStartBefore(
      Input(
        createdAt: s.createdAt,
        manualStreakStart: s.manualStreakStart,
        resetTypes: s.resetTypes,
        relapses: rels
      ),
      ts: ts
    )
    return max(0, ts - prev)
  }

  /// 已结束的间隔。不含「现在还在走的这一段」。
  public static func historicalBest(_ s: Input) -> Double {
    let times = s.relapses
      .filter { relapseResets(types: $0.types, resetTypes: s.resetTypes) }
      .map(\.ts)
      .sorted()
    var best = s.bestStreakMs > 0 ? s.bestStreakMs : 0
    if times.count >= 2 {
      for i in 1..<times.count {
        best = max(best, times[i] - times[i - 1])
      }
    }
    for r in s.relapses where r.streakMs > best { best = r.streakMs }
    return best
  }
}
