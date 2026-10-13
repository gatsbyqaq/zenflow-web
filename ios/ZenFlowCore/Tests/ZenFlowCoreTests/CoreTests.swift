import XCTest
@testable import ZenFlowCore

final class CoreTests: XCTestCase {
  let ms = Streak.day
  var epoch: Double = {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(secondsFromGMT: 0)!
    return cal.date(from: DateComponents(year: 2026, month: 1, day: 1))!.timeIntervalSince1970 * 1000
  }()

  func base(_ over: ((inout Streak.Input) -> Void)? = nil) -> Streak.Input {
    var s = Streak.Input(createdAt: self.epoch, manualStreakStart: 0, relapses: [], bestStreakMs: 0)
    over?(&s)
    return s
  }

  func testResetNormalization() {
    XCTAssertEqual(Streak.normalizeResetTypes(nil), Streak.defaultResetTypes())
    XCTAssertEqual(Streak.normalizeResetTypes(["masturbation": false, "dream": false])["masturbation"], true)
    XCTAssertEqual(Streak.normalizeResetTypes(["dream": false])["dream"], false)
    XCTAssertEqual(Streak.normalizeResetTypes([:])["porn"], true)
  }

  func testRelapseResets() {
    XCTAssertTrue(Streak.relapseResets(types: [], resetTypes: Streak.defaultResetTypes()))
    XCTAssertFalse(Streak.relapseResets(types: ["dream"], resetTypes: ["dream": false, "masturbation": true]))
    XCTAssertTrue(Streak.relapseResets(types: ["dream", "masturbation"], resetTypes: ["dream": false]))
    XCTAssertFalse(Streak.relapseResets(types: ["porn", "fantasy"], resetTypes: ["porn": false, "fantasy": false]))
    XCTAssertTrue(Streak.relapseResets(types: ["masturbation"], resetTypes: ["masturbation": false]))
  }

  func testComputeStreakStart() {
    let onlyDream = base {
      $0.resetTypes = Streak.normalizeResetTypes(["dream": false])
      $0.relapses = [.init(ts: self.epoch + 10 * self.ms, types: ["dream"])]
    }
    XCTAssertEqual(Streak.computeStreakStart(onlyDream, now: self.epoch + 12 * self.ms), self.epoch)

    let dreamThenMast = base {
      $0.resetTypes = Streak.normalizeResetTypes(["dream": false])
      $0.relapses = [
        .init(ts: self.epoch + 3 * self.ms, types: ["dream"]),
        .init(ts: self.epoch + 8 * self.ms, types: ["masturbation"])
      ]
    }
    XCTAssertEqual(Streak.computeStreakStart(dreamThenMast, now: self.epoch + 12 * self.ms), self.epoch + 8 * self.ms)

    let manualAfter = base {
      $0.manualStreakStart = self.epoch + 10 * self.ms
      $0.relapses = [.init(ts: self.epoch + 4 * self.ms, types: ["porn"])]
    }
    XCTAssertEqual(Streak.computeStreakStart(manualAfter, now: self.epoch + 12 * self.ms), self.epoch + 10 * self.ms)

    let manualBefore = base {
      $0.manualStreakStart = self.epoch + 2 * self.ms
      $0.relapses = [.init(ts: self.epoch + 6 * self.ms, types: ["sex"])]
    }
    XCTAssertEqual(Streak.computeStreakStart(manualBefore, now: self.epoch + 12 * self.ms), self.epoch + 6 * self.ms)
  }

  func testLooksLikeManual() {
    XCTAssertTrue(Streak.looksLikeManualStart(streakStart: self.epoch + 5 * self.ms, createdAt: self.epoch, relapses: [.init(ts: self.epoch + self.ms)]))
    XCTAssertFalse(Streak.looksLikeManualStart(streakStart: self.epoch, createdAt: self.epoch, relapses: []))
    XCTAssertFalse(Streak.looksLikeManualStart(streakStart: self.epoch + 4 * self.ms, createdAt: self.epoch, relapses: [.init(ts: self.epoch + 4 * self.ms + 500)]))
  }

  func testBestAndEnded() {
    let gaps = base {
      $0.resetTypes = Streak.normalizeResetTypes(["dream": false, "fantasy": false])
      $0.relapses = [
        .init(ts: self.epoch + 2 * self.ms, types: ["porn"]),
        .init(ts: self.epoch + 3 * self.ms, types: ["dream"]),
        .init(ts: self.epoch + 9 * self.ms, types: ["porn"])
      ]
    }
    XCTAssertEqual(Streak.historicalBest(gaps), 7 * self.ms)

    let ended = Streak.endedStreakMs(
      base { $0.relapses = [.init(id: "a", ts: self.epoch + 2 * self.ms, types: ["porn"])] },
      ts: self.epoch + 5 * self.ms,
      types: ["fantasy"],
      ignoreId: nil
    )
    XCTAssertEqual(ended, 3 * self.ms)
    XCTAssertEqual(Streak.endedStreakMs(base(), ts: self.epoch + 5 * self.ms, types: ["porn"], ignoreId: nil), 5 * self.ms)
    XCTAssertEqual(
      Streak.endedStreakMs(
        base { $0.resetTypes = Streak.normalizeResetTypes(["dream": false]) },
        ts: self.epoch + 5 * self.ms,
        types: ["dream"],
        ignoreId: nil
      ),
      0
    )
  }

  func testChooseSyncAndEmpty() {
    let empty = AppState.fresh(now: self.epoch)
    XCTAssertTrue(AppState.localLooksEmpty(empty))
    var filled = empty
    filled.checkins["2026-01-01"] = Checkin(mood: 3, ts: self.epoch)
    XCTAssertFalse(AppState.localLooksEmpty(filled))
    let remote = AppState.fresh(now: 1)
    XCTAssertEqual(CloudMerge.choose(local: empty, remote: remote, lastUid: nil, uid: "u", pullRemote: true, replaceAll: false), .remote)
    XCTAssertEqual(CloudMerge.choose(local: empty, remote: remote, lastUid: nil, uid: "u", pullRemote: false, replaceAll: false), .remote)
    XCTAssertEqual(CloudMerge.choose(local: filled, remote: remote, lastUid: nil, uid: "u", pullRemote: false, replaceAll: false), .merge)
    XCTAssertEqual(CloudMerge.choose(local: filled, remote: remote, lastUid: "old", uid: "u", pullRemote: false, replaceAll: false), .remote)
    XCTAssertEqual(CloudMerge.choose(local: filled, remote: nil, lastUid: "old", uid: "u", pullRemote: false, replaceAll: false), .local)
    XCTAssertEqual(CloudMerge.choose(local: empty, remote: nil, lastUid: nil, uid: "u", pullRemote: true, replaceAll: false), .local)
    XCTAssertEqual(CloudMerge.choose(local: filled, remote: remote, lastUid: "u", uid: "u", pullRemote: false, replaceAll: true), .local)
  }

  func testMergeKeepsNewerCheckinAndTombstone() {
    var a = AppState.fresh(now: self.epoch)
    var b = AppState.fresh(now: self.epoch + self.ms)
    a.checkins["2026-01-02"] = Checkin(mood: 2, ts: 10)
    b.checkins["2026-01-02"] = Checkin(mood: 5, ts: 20, editedAt: 30)
    b.relapses = [Relapse(id: "r1", ts: self.epoch + 2 * self.ms, streakMs: self.ms, types: ["porn"])]
    a.removed.ids["gone"] = 5
    b.urges = [Urge(id: "gone", ts: 9), Urge(id: "keep", ts: 8)]
    let merged = CloudMerge.merge(a, b, now: self.epoch + 4 * self.ms)
    XCTAssertEqual(merged.checkins["2026-01-02"]?.mood, 5)
    XCTAssertEqual(merged.relapses.map(\.id), ["r1"])
    XCTAssertEqual(merged.urges.map(\.id), ["keep"])
    XCTAssertEqual(merged.streakStart, self.epoch + 2 * self.ms)
  }

  func testSanitizeRoundTripAndManualUpgrade() {
    let raw = JSONValue.object([
      "streakStart": .number(self.epoch + 5 * self.ms),
      "createdAt": .number(self.epoch),
      "relapses": .array([.object(["id": .string("a"), "ts": .number(self.epoch + self.ms), "types": .array([.string("dream")])])])
    ])
    let state = try! AppState.sanitize(raw, now: self.epoch + 6 * self.ms)
    XCTAssertEqual(state.manualStreakStart, self.epoch + 5 * self.ms)
    let again = try! AppState.sanitize(state.jsonValue(), now: self.epoch + 6 * self.ms)
    XCTAssertEqual(again.stable(), state.stable())
  }

  func testAuthCopyAndHandle() {
    XCTAssertEqual(AuthCopy.message(text: "ADMIN_CANNOT_DELETE", code: "P0001"), "管理员账号不能注销")
    XCTAssertEqual(AuthCopy.message(text: "NOT_AUTHENTICATED"), "请先登录")
    XCTAssertEqual(AuthCopy.message(text: "captcha protection: request disallowed (no captcha_token found)"), "请完成验证")
    XCTAssertEqual(AuthCopy.message(text: "Invalid login credentials", code: "invalid_credentials"), "邮箱或密码不正确")
    XCTAssertNil(HandleRules.problem("abc_1"))
    XCTAssertEqual(HandleRules.problem("ab"), "@ID 至少 3 位")
    XCTAssertEqual(HandleRules.normalize("@AbC-中文_1"), "abc_1")
    XCTAssertTrue(InviteRules.formatOK(InviteRules.normalize(" zf-ab12-cd34 ")))
  }

  func testImportWrapper() throws {
    var state = AppState.fresh(now: self.epoch)
    state.reasons = ["留下"]
    let pack = ZenFlowExport(
      exportedAt: "2026-10-06T00:00:00.000Z",
      source: "local",
      profile: ProfileSnapshot(displayName: "甲", handle: "jia"),
      data: state,
      theme: "dark"
    )
    let parsed = try ImportPack.parse(pack.jsonValue(), now: self.epoch + self.ms)
    XCTAssertEqual(parsed.state.reasons, ["留下"])
    XCTAssertEqual(parsed.theme, "dark")
    let bare = try ImportPack.parse(state.jsonValue(), now: self.epoch + self.ms)
    XCTAssertEqual(bare.state.streakStart, state.streakStart)
    XCTAssertNil(bare.theme)
  }
}
