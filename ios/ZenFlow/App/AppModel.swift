import Foundation
import Observation

enum Gate: Equatable {
  case boot
  case login
  case invite
  case handle
  case ready
}

enum SyncStatus: Equatable {
  case off, syncing, ok, offline, error(String)

  var label: String {
    switch self {
    case .off: return "未登录"
    case .syncing: return "正在同步"
    case .ok: return "已同步"
    case .offline: return "离线"
    case let .error(text): return text.isEmpty ? "失败" : "失败：\(text)"
    }
  }
}

enum SettingsPage: String, Hashable {
  case account, goal, resets, theme, reasons, data, about

  var title: String {
    switch self {
    case .account: return "账号与资料"
    case .goal: return "目标天数"
    case .resets: return "重置规则"
    case .theme: return "外观"
    case .reasons: return "理由"
    case .data: return "数据"
    case .about: return "关于"
    }
  }
}

@MainActor
@Observable
final class AppModel {
  var gate: Gate = .boot
  var bootText = "正在恢复登录…"
  var state: AppState
  var theme: ThemeChoice
  var profile = RemoteProfile()
  var email = ""
  var userID: UUID?
  var sync = SyncStatus.off
  var lastSync: Double = 0
  var toast: String?
  var settingsPage: SettingsPage?
  var recordDay: String?
  var dayKey: String?
  var editingRelapse: Relapse?

  private let cloud = CloudClient()
  private var pushTask: Task<Void, Never>?
  private var syncing = false
  private var pending = false
  private var replaceAll = false
  private var wipeLock = false
  private var toastTask: Task<Void, Never>?

  init() {
    state = LocalStore.loadState()
    theme = LocalStore.theme()
    lastSync = LocalStore.lastSync()
  }

  func bootstrap() async {
    bootText = "正在恢复登录…"
    gate = .boot
    do {
      let session = try await cloud.currentSession()
      email = session.user.email ?? ""
      userID = session.user.id
      bootText = "正在进入…"
      do {
        try await refreshProfile()
      } catch {
        if LocalStore.lastUid() == session.user.id.uuidString {
          gate = .ready
          sync = .offline
        } else {
          show("网络失败")
          gate = .login
        }
      }
    } catch {
      userID = nil
      profile = RemoteProfile()
      gate = .login
    }
  }

  func show(_ message: String) {
    toast = message
    toastTask?.cancel()
    toastTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 2_200_000_000)
      guard !Task.isCancelled else { return }
      self?.toast = nil
    }
  }

  func setTheme(_ choice: ThemeChoice) {
    theme = choice
    LocalStore.setTheme(choice)
  }

  var shownName: String {
    let cloudName = profile.displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !cloudName.isEmpty { return cloudName }
    if let meta = email.split(separator: "@").first, !meta.isEmpty { return String(meta) }
    return email
  }

  var shownHandle: String {
    if let handle = profile.handle, !handle.isEmpty { return "@\(handle)" }
    return ""
  }

  var avatarURL: URL? {
    guard let raw = profile.avatarURL, let url = URL(string: raw), !raw.isEmpty else { return nil }
    return url
  }

  // MARK: - 记录

  func openRecord(_ day: String) {
    guard day <= AppState.dateKey(Clock.now()) else {
      show("还不能记录未来的日期")
      return
    }
    recordDay = day
  }

  func saveRecord(day: String, mood: Int?, types: [String], triggers: [String], other: String, note: String, time: Date) {
    let ts = time.timeIntervalSince1970 * 1000
    if ts > Clock.now() + 60_000 { show("时间不能晚于现在"); return }
    if AppState.dateKey(ts) != day { show("时间需要在这一天"); return }
    let prev = state.checkins[day]
    let moodWrite = willWriteMood(prev: prev, mood: mood, note: note, types: types)
    if !moodWrite && types.isEmpty { show("先选择心情，或选择行为类型"); return }
    let normalized = Streak.normalizeTypes(types)
    if !normalized.isEmpty && Streak.relapseResets(types: normalized, resetTypes: state.resetTypes)
        && AppState.previewStart(state, ts: ts, types: normalized) != state.streakStart {
      pendingReset = PendingReset(day: day, mood: mood, types: normalized, triggers: triggers, other: other, note: note, time: time, moodWrite: moodWrite)
      return
    }
    commitRecord(day: day, mood: mood, types: normalized, triggers: triggers, other: other, note: note, ts: ts, moodWrite: moodWrite)
  }

  var pendingReset: PendingReset?
  var askLogout = false

  struct PendingReset: Equatable {
    var day: String
    var mood: Int?
    var types: [String]
    var triggers: [String]
    var other: String
    var note: String
    var time: Date
    var moodWrite: Bool
  }

  func confirmPendingReset() {
    guard let pending = pendingReset else { return }
    pendingReset = nil
    commitRecord(
      day: pending.day,
      mood: pending.mood,
      types: pending.types,
      triggers: pending.triggers,
      other: pending.other,
      note: pending.note,
      ts: pending.time.timeIntervalSince1970 * 1000,
      moodWrite: pending.moodWrite
    )
  }

  func clearCheckin(_ day: String) {
    guard state.checkins[day] != nil else { return }
    state.checkins.removeValue(forKey: day)
    state.removed.checkins[day] = Clock.now()
    persist()
    show("已清除心情")
  }

  func deleteRelapse(_ id: String) {
    state.relapses.removeAll { $0.id == id }
    state.removed.ids[id] = Clock.now()
    _ = AppState.applyStreak(&state, touchSetAt: true)
    persist()
    show("已删除")
  }

  func deleteUrge(_ id: String) {
    state.urges.removeAll { $0.id == id }
    state.removed.ids[id] = Clock.now()
    persist()
    show("已删除")
  }

  func updateRelapse(_ id: String, time: Date, types: [String], triggers: [String], other: String, note: String) {
    guard let index = state.relapses.firstIndex(where: { $0.id == id }) else { return }
    let ts = time.timeIntervalSince1970 * 1000
    if ts > Clock.now() + 60_000 { show("时间不能晚于现在"); return }
    let normalized = Streak.normalizeTypes(types)
    if normalized.isEmpty { show("请至少选择一个类型"); return }
    state.relapses[index].ts = ts
    state.relapses[index].types = normalized
    state.relapses[index].triggers = triggers
    state.relapses[index].other = other
    state.relapses[index].note = String(note.prefix(500))
    state.relapses[index].streakMs = AppState.endedStreakMs(state, ts: ts, types: normalized, ignoreId: id)
    state.relapses[index].editedAt = Clock.now()
    let changed = AppState.applyStreak(&state, touchSetAt: true)
    persist()
    editingRelapse = nil
    show(changed ? "已更新，天数已重算" : "已更新")
  }

  func setGoal(_ days: Int) {
    guard (1...3650).contains(days) else { show("请输入 1–3650 之间的天数"); return }
    state.goalDays = days
    state.goalSetAt = Clock.now()
    persist()
    show("目标已设为 \(days) 天")
  }

  func setManualStart(_ date: Date) {
    let ts = date.timeIntervalSince1970 * 1000
    if ts > Clock.now() { show("开始时间不能晚于现在"); return }
    state.manualStreakStart = ts
    state.manualStreakStartSetAt = Clock.now()
    let changed = AppState.applyStreak(&state, touchSetAt: true)
    persist()
    show(changed && state.streakStart != ts ? "已保存。天数从最近一次会重置的破戒算起" : "开始时间已更新")
  }

  func toggleReset(_ id: String) {
    if id == "masturbation" { return }
    state.resetTypes[id] = !(state.resetTypes[id] ?? true)
    state.resetTypes["masturbation"] = true
    state.resetTypesSetAt = Clock.now()
    let changed = AppState.applyStreak(&state, touchSetAt: true)
    persist()
    show(changed ? "已更新，天数已重算" : "已更新")
  }

  func addReason(_ text: String) {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.isEmpty { show("请输入内容"); return }
    state.reasons.append(value)
    if (state.removed.reasons[value] ?? 0) > 0 { state.removed.reasons[value] = -Clock.now() }
    persist()
    show("已添加")
  }

  func removeReason(at index: Int) {
    guard state.reasons.indices.contains(index) else { return }
    let gone = state.reasons.remove(at: index)
    if !state.reasons.contains(gone) { state.removed.reasons[gone] = Clock.now() }
    persist()
  }

  func recordUrge() {
    state.urges.append(Urge(id: ID.make(), ts: Clock.now()))
    persist()
  }

  struct PendingImport: Equatable {
    var state: AppState
    var theme: ThemeChoice?
    var summary: String
  }

  var pendingImport: PendingImport?

  func stageImport(_ data: Data) -> String? {
    do {
      let value = try JSONValue.parse(data)
      let parsed = try ImportPack.parse(value)
      pendingImport = PendingImport(
        state: parsed.state,
        theme: parsed.theme.flatMap(ThemeChoice.init(rawValue:)),
        summary: "\(parsed.state.checkins.count) 次打卡，\(parsed.state.urges.count) 次抵御，\(parsed.state.relapses.count) 条破戒。会覆盖当前记录。"
      )
      return nil
    } catch {
      return "导入失败：\((error as? LocalizedError)?.errorDescription ?? "文件无法解析")"
    }
  }

  func confirmImport() {
    guard let pending = pendingImport else { return }
    pendingImport = nil
    state = pending.state
    state.streakStartSetAt = Clock.now()
    if let theme = pending.theme { setTheme(theme) }
    recordDay = nil
    dayKey = nil
    persist(replaceAll: true)
    show("导入成功")
  }

  func resetAll() {
    state = AppState.fresh()
    recordDay = nil
    dayKey = nil
    persist(replaceAll: true)
    show("已重置")
  }

  func exportPack() async -> ZenFlowExport {
    var data = state
    var source = "local"
    var note: String?
    if let userID {
      do {
        let remote = try await cloud.fetchRemoteState(userID: userID)
        let choice = CloudMerge.choose(
          local: state,
          remote: remote,
          lastUid: LocalStore.lastUid(),
          uid: userID.uuidString,
          pullRemote: LocalStore.pullRemote(),
          replaceAll: false
        )
        if choice == .remote { data = remote ?? state }
        else if choice == .merge, let remote { data = CloudMerge.merge(state, remote) }
        source = remote == nil ? "local" : "cloud+local"
      } catch {
        note = "未能读取云端，可能缺少只在云端的数据。"
      }
    } else {
      note = "未登录，只有本机数据。"
    }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return ZenFlowExport(
      exportedAt: formatter.string(from: Date()),
      source: source,
      profile: ProfileSnapshot(
        displayName: profile.displayName ?? "",
        handle: profile.handle ?? "",
        avatarURL: profile.avatarURL ?? "",
        createdAt: profile.createdAt
      ),
      data: data,
      theme: theme.rawValue,
      note: note
    )
  }

  // MARK: - 账号

  func signIn(email: String, password: String, captchaToken: String?) async -> String? {
    guard let captchaToken, !captchaToken.isEmpty else { return "请完成验证" }
    let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
    if !Self.emailOK(email) { return "请输入有效的邮箱" }
    if password.isEmpty { return "请输入密码" }
    do {
      let session = try await cloud.signIn(email: email, password: password, captchaToken: captchaToken)
      self.email = session.user.email ?? email
      userID = session.user.id
      try await refreshProfile()
      show("登录成功")
      return nil
    } catch {
      return CloudClient.describe(error)
    }
  }

  func signUp(name: String, handle: String, email: String, password: String, confirm: String, invite: String, captchaToken: String?) async -> String? {
    guard let captchaToken, !captchaToken.isEmpty else { return "请完成验证" }
    let handle = HandleRules.normalize(handle)
    if let problem = HandleRules.problem(handle) { return problem }
    let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
    if !Self.emailOK(email) { return "请输入有效的邮箱" }
    if password.count < 8 { return "密码至少 8 位" }
    if password != confirm { return "两次输入的密码不一致" }
    let code = InviteRules.normalize(invite)
    if code.isEmpty { return "请输入邀请码" }
    do {
      if try await cloud.handleAvailable(handle) == false { return AuthCopy.message(text: "HANDLE_TAKEN") }
      if try await cloud.inviteValid(code) == false { return "邀请码无效、已过期或已使用" }
      let response = try await cloud.signUp(
        email: email,
        password: password,
        name: String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(20)),
        handle: handle,
        invite: code,
        captchaToken: captchaToken
      )
      if response.session != nil {
        self.email = response.user.email ?? email
        userID = response.user.id
        try await refreshProfile()
        show("注册成功")
        return nil
      }
      if response.user.identities?.isEmpty == true { return "邮箱已注册，请登录" }
      return "确认邮件已发到 \(email)。点开链接后再登录。"
    } catch {
      return CloudClient.describe(error)
    }
  }

  func sendReset(email: String, captchaToken: String?) async -> String? {
    guard let captchaToken, !captchaToken.isEmpty else { return "请完成验证" }
    let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
    if !Self.emailOK(email) { return "先填写注册邮箱" }
    do {
      try await cloud.resetPassword(email: email, captchaToken: captchaToken)
      return "如果邮箱已注册，重置邮件已发出。"
    } catch {
      return CloudClient.describe(error)
    }
  }

  func checkHandle(_ raw: String) async -> String? {
    let handle = HandleRules.normalize(raw)
    if handle.isEmpty { return nil }
    if handle.count < 3 { return "至少 3 位" }
    if HandleRules.problem(handle) != nil { return "格式不对" }
    do {
      let ok = try await cloud.handleAvailable(handle)
      return ok ? "可用" : "已被占用"
    } catch {
      return nil
    }
  }

  func checkInvite(_ raw: String) async -> String? {
    let code = InviteRules.normalize(raw)
    if code.isEmpty { return nil }
    if !InviteRules.formatOK(code) { return "格式不对" }
    do {
      let ok = try await cloud.inviteValid(code)
      return ok ? "可用" : "无效或已使用"
    } catch {
      return nil
    }
  }

  func completeGate(name: String, handle: String, invite: String, needsInvite: Bool) async -> String? {
    let handle = HandleRules.normalize(handle)
    let code = InviteRules.normalize(invite)
    if needsInvite && code.isEmpty { return "请输入邀请码" }
    if profile.handle == nil || profile.handle?.isEmpty == true || handle != profile.handle {
      if let problem = HandleRules.problem(handle) { return problem }
    }
    do {
      if needsInvite, try await cloud.inviteValid(code) == false { return "邀请码无效、已过期或已使用" }
      if profile.handle == nil || profile.handle != handle {
        if try await cloud.handleAvailable(handle) == false { return "@ID 已被占用" }
      }
      if needsInvite {
        profile = try await cloud.completeInvite(
          code: code,
          name: String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(20)),
          handle: handle
        )
      } else if let userID {
        let updated = try await cloud.updateProfile(name: name.isEmpty ? .null : .string(name), handle: .string(handle), avatar: .null)
        if let updated { profile = updated }
        else { try await refreshProfile() }
        _ = userID
      }
      show(needsInvite ? "注册完成" : "已设置 @ID")
      routeAfterProfile()
      if gate == .ready { await syncNow() }
      return nil
    } catch {
      return CloudClient.describe(error)
    }
  }

  func saveProfile(name: String, handle: String) async -> String? {
    guard userID != nil else { return "请先登录" }
    let name = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(20))
    let handle = HandleRules.normalize(handle)
    let current = profile.handle ?? ""
    let changed = handle != current
    if changed {
      if let problem = HandleRules.problem(handle) { return problem }
      do {
        if try await cloud.handleAvailable(handle) == false { return "@ID 已被占用" }
      } catch {
        return CloudClient.describe(error)
      }
    }
    do {
      let updated = try await cloud.updateProfile(
        name: name.isEmpty ? .null : .string(name),
        handle: changed ? .string(handle) : .null,
        avatar: .null
      )
      if let updated { profile = updated }
      if name.isEmpty, let userID {
        if let cleared = try await cloud.clearDisplayName(userID: userID) { profile = cleared }
      }
      show("资料已更新")
      return nil
    } catch {
      return CloudClient.describe(error)
    }
  }

  func uploadAvatar(_ data: Data) async -> String? {
    guard let userID else { return "请先登录" }
    let previous = profile.avatarURL
    do {
      let url = try await cloud.uploadAvatar(userID: userID, data: data)
      let updated = try await cloud.updateProfile(name: .null, handle: .null, avatar: .string(url))
      if let updated { profile = updated }
      else { profile.avatarURL = url }
      if let previous, previous != url { await cloud.removeAvatar(url: previous, userID: userID) }
      show("头像已更新")
      return nil
    } catch {
      return CloudClient.describe(error)
    }
  }

  func removeAvatar() async -> String? {
    guard let userID else { return "请先登录" }
    let previous = profile.avatarURL
    do {
      let updated = try await cloud.updateProfile(name: .null, handle: .null, avatar: .string(""))
      if let updated { profile = updated }
      else { profile.avatarURL = nil }
      if let previous { await cloud.removeAvatar(url: previous, userID: userID) }
      show("已移除头像")
      return nil
    } catch {
      return CloudClient.describe(error)
    }
  }

  func logout() async {
    if wipeLock { return }
    wipeLock = true
    askLogout = false
    pushTask?.cancel()
    var signedOut = true
    do { try await cloud.signOut() } catch { signedOut = false }
    LocalStore.wipeDevice()
    state = AppState.fresh()
    theme = .system
    profile = RemoteProfile()
    email = ""
    userID = nil
    sync = .off
    lastSync = 0
    settingsPage = nil
    recordDay = nil
    dayKey = nil
    gate = .login
    wipeLock = false
    show(signedOut ? "已退出" : "已退出本机")
  }

  func deleteAccount(typedHandle: String) async -> String? {
    guard let userID else { return "请先登录" }
    let typed = HandleRules.normalize(typedHandle)
    guard let handle = profile.handle, !handle.isEmpty, typed == handle else { return "@ID 不正确" }
    wipeLock = true
    pushTask?.cancel()
    do {
      await cloud.removeAllAvatars(userID: userID)
      try await cloud.deleteAccount()
    } catch {
      wipeLock = false
      return CloudClient.describe(error)
    }
    LocalStore.wipeDevice()
    state = AppState.fresh()
    theme = .system
    profile = RemoteProfile()
    email = ""
    self.userID = nil
    sync = .off
    settingsPage = nil
    gate = .login
    wipeLock = false
    show("账号已注销")
    return nil
  }

  func syncNow(replaceAll: Bool = false) async {
    guard let userID, gate == .ready, !wipeLock else { return }
    if syncing {
      pending = true
      if replaceAll { self.replaceAll = true }
      return
    }
    syncing = true
    sync = .syncing
    let replace = replaceAll || self.replaceAll
    self.replaceAll = false
    do {
      let remote = try await cloud.fetchRemoteState(userID: userID)
      if wipeLock { syncing = false; return }
      let choice = CloudMerge.choose(
        local: state,
        remote: remote,
        lastUid: LocalStore.lastUid(),
        uid: userID.uuidString,
        pullRemote: LocalStore.pullRemote(),
        replaceAll: replace
      )
      var merged = state
      if choice == .remote { merged = remote ?? AppState.fresh() }
      else if choice == .merge, let remote { merged = CloudMerge.merge(state, remote) }
      if LocalStore.lastUid() != nil && LocalStore.lastUid() != userID.uuidString && !replace {
        show("已切换账号")
      }
      if merged.stable() != state.stable() { state = merged; LocalStore.save(state) }
      if remote == nil || merged.stable() != remote?.stable() {
        try await cloud.pushState(userID: userID, state: merged)
      }
      LocalStore.setLastUid(userID.uuidString)
      UserDefaults.standard.removeObject(forKey: "zenflow_pull_remote")
      lastSync = Clock.now()
      LocalStore.setLastSync(lastSync)
      sync = .ok
    } catch {
      let text = CloudClient.describe(error)
      sync = text == "网络失败" ? .offline : .error(text)
    }
    syncing = false
    if pending {
      pending = false
      await syncNow()
    }
  }

  func resetSummary() -> String {
    let on = Catalog.lapseTypes.filter { state.resetTypes[$0.id] == true }
    if on.count == Catalog.lapseTypes.count && !on.isEmpty { return "全部重置" }
    if on.count > 1 { return "自慰等 \(on.count) 项重置" }
    return "仅自慰重置"
  }

  func resetHint(_ types: [String]) -> String {
    if types.isEmpty { return "不选行为，只记心情。" }
    if !Streak.relapseResets(types: types, resetTypes: state.resetTypes) { return "不重置天数，仍记在日历上" }
    let which = types.filter { state.resetTypes[$0] == true }.compactMap { Catalog.typeById($0)?.label }
    return "会重置戒色天数（\(which.joined(separator: "、"))）"
  }

  private func commitRecord(day: String, mood: Int?, types: [String], triggers: [String], other: String, note: String, ts: Double, moodWrite: Bool) {
    let prev = state.checkins[day]
    if moodWrite, let mood {
      var row = Checkin(mood: mood, ts: prev?.ts ?? ts, editedAt: Clock.now())
      if !types.isEmpty {
        if let old = prev?.note { row.note = old }
      } else if !note.isEmpty {
        row.note = String(note.prefix(500))
      } else if let old = prev?.note {
        row.note = old
      }
      state.checkins[day] = row
      if (state.removed.checkins[day] ?? 0) > 0 { state.removed.checkins[day] = -Clock.now() }
    }
    var changed = false
    var didRelapse = false
    if !types.isEmpty {
      let row = Relapse(
        id: ID.make(),
        ts: ts,
        triggers: Array(triggers.prefix(10)),
        other: String(other.prefix(40)),
        note: String(note.prefix(1000)),
        streakMs: AppState.endedStreakMs(state, ts: ts, types: types, ignoreId: nil),
        types: types,
        editedAt: Clock.now()
      )
      state.relapses.append(row)
      changed = AppState.applyStreak(&state, touchSetAt: true)
      didRelapse = true
    }
    persist()
    recordDay = nil
    if didRelapse && changed { show("已记录，天数已重算") }
    else if didRelapse { show("已记录") }
    else { show(prev == nil ? "心情已记下" : "心情已更新") }
  }

  private func willWriteMood(prev: Checkin?, mood: Int?, note: String, types: [String]) -> Bool {
    guard let mood else { return false }
    if prev == nil || prev?.mood != mood { return true }
    return types.isEmpty && !note.isEmpty && note != (prev?.note ?? "")
  }

  private func persist(replaceAll: Bool = false) {
    LocalStore.save(state)
    schedulePush(replaceAll: replaceAll)
  }

  private func schedulePush(replaceAll: Bool) {
    if replaceAll { self.replaceAll = true }
    pushTask?.cancel()
    pushTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 1_500_000_000)
      guard !Task.isCancelled else { return }
      await self?.syncNow()
    }
  }

  private func refreshProfile() async throws {
    guard let userID else { return }
    profile = try await cloud.fetchProfile(userID: userID)
    routeAfterProfile()
    if gate == .ready { await syncNow() }
  }

  private func routeAfterProfile() {
    if profile.inviteOK && !(profile.handle ?? "").isEmpty {
      gate = .ready
    } else if profile.inviteOK {
      gate = .handle
    } else {
      gate = .invite
    }
  }

  private static func emailOK(_ email: String) -> Bool {
    email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
  }
}
