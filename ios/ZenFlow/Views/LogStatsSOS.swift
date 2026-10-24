import SwiftUI

struct LogView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        MonthCalendar()
          .padding(.top, 8)
        GrayButton(title: model.t("记录", "Log"), systemImage: "square.and.pencil") {
          model.openRecord(AppState.dateKey(Clock.now()))
        }
        ZFCard {
          HStack {
            Text(model.t("最近", "Recent")).font(.system(size: 16, weight: .semibold))
            Spacer()
            Text(model.t("共 \(items.count) 条", "\(items.count) entries")).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
          }
          if items.isEmpty {
            Text(model.t("没有记录", "No entries")).foregroundStyle(ZFColor.muted)
          }
          ForEach(items.prefix(80)) { item in
            historyRow(item)
          }
        }
      }
      .padding(.horizontal, 16)
      .zfScrollClearance()
    }
    .zfScrollEdge()
    .background(ZFColor.bg)
  }

  private var items: [HistoryItem] {
    var list: [HistoryItem] = []
    for row in model.state.relapses {
      list.append(HistoryItem(id: "r-" + row.id, kind: .relapse, ts: row.ts, relapse: row, urge: nil, day: nil))
    }
    for row in model.state.urges {
      list.append(HistoryItem(id: "u-" + row.id, kind: .urge, ts: row.ts, relapse: nil, urge: row, day: nil))
    }
    for (key, checkin) in model.state.checkins {
      let ts = checkin.ts > 0 ? checkin.ts : (AppState.dateKey(0) == key ? checkin.ts : fallback(key))
      list.append(HistoryItem(id: "c-" + key, kind: .checkin, ts: ts, relapse: nil, urge: nil, day: key, mood: checkin.mood, note: checkin.note))
    }
    return list.sorted { $0.ts > $1.ts }
  }

  private func fallback(_ key: String) -> Double {
    ZFFormat.combine(day: key, time: Date(timeIntervalSince1970: 12 * 3600)).timeIntervalSince1970 * 1000
  }

  @ViewBuilder
  private func historyRow(_ item: HistoryItem) -> some View {
    switch item.kind {
    case .urge:
      HStack {
        Image(systemName: "checkmark.shield").foregroundStyle(ZFColor.mint)
        VStack(alignment: .leading) {
          Text("成功抵御一次冲动").font(.system(size: 15, weight: .semibold))
          Text(AppState.fmtDT(item.ts)).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
        }
        Spacer()
        if let urge = item.urge {
          Button { model.deleteUrge(urge.id) } label: { Image(systemName: "xmark") }
            .foregroundStyle(ZFColor.warm)
        }
      }
    case .checkin:
      HStack {
        Image(systemName: Catalog.moodByValue(item.mood ?? 3)?.symbol ?? "face.smiling")
        VStack(alignment: .leading) {
          Text("打卡 · \(Catalog.moodByValue(item.mood ?? 3)?.title ?? "")").font(.system(size: 15, weight: .semibold))
          Text(item.day ?? "").font(.system(size: 12)).foregroundStyle(ZFColor.muted)
          if let note = item.note, !note.isEmpty { Text(note).font(.system(size: 13)) }
        }
        Spacer()
        Button { if let day = item.day { model.dayKey = day } } label: { Image(systemName: "square.and.pencil") }
        Button { if let day = item.day { model.clearCheckin(day) } } label: { Image(systemName: "xmark") }
          .foregroundStyle(ZFColor.warm)
      }
    case .relapse:
      if let row = item.relapse { RelapseRow(row: row) }
    }
  }
}

struct HistoryItem: Identifiable {
  enum Kind { case relapse, urge, checkin }
  var id: String
  var kind: Kind
  var ts: Double
  var relapse: Relapse?
  var urge: Urge?
  var day: String?
  var mood: Int?
  var note: String?
}

struct StatsView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    let urges = model.state.urges.count
    let relapses = model.state.relapses.count
    let rate = (urges + relapses) > 0 ? "\(Int((Double(urges) / Double(urges + relapses) * 100).rounded()))%" : "—"
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        Text(model.t("统计", "Stats")).font(.system(size: 28, weight: .bold)).padding(.top, 8)
        let now = Clock.now()
        let longest = Streak.wholeDays(AppState.bestMs(model.state, now: now))
        let total = Streak.wholeDays(AppState.totalCleanMs(model.state, now: now))
        let current = Streak.wholeDays(AppState.currentMs(model.state, now: now))
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
          stat("\(relapses)", model.t("破戒次数", "Relapses"))
          stat(model.t("\(total) 天", "\(total)"), model.t("累计坚持天数", "Total days"))
          stat(model.t("\(current) 天", "\(current)"), model.t("当前连续", "Current streak"))
          stat(model.t("\(longest) 天", "\(longest)"), model.t("最长连续", "Longest streak"))
          stat("\(urges)", model.t("抵御冲动", "Urges resisted"))
          stat(rate, model.t("冲动抵御率", "Resisted"))
        }
        ZFCard {
          Text("常见触发因素").font(.system(size: 16, weight: .semibold))
          if triggerRows.isEmpty {
            Text("还没有数据").foregroundStyle(ZFColor.muted)
          } else {
            bars(triggerRows, color: ZFColor.warm)
          }
        }
        ZFCard {
          Text("时段分布").font(.system(size: 16, weight: .semibold))
          HStack(spacing: 12) {
            Label("破戒", systemImage: "circle.fill").font(.system(size: 12)).foregroundStyle(ZFColor.warm)
            Label("抵御冲动", systemImage: "circle.fill").font(.system(size: 12)).foregroundStyle(ZFColor.mint)
          }
          timeChart
        }
        ZFCard {
          Text("心情分布").font(.system(size: 16, weight: .semibold))
          if moodRows.allSatisfy({ $0.1 == 0 }) {
            Text("还没有打卡").foregroundStyle(ZFColor.muted)
          } else {
            bars(moodRows, color: ZFColor.mint)
          }
        }
        ZFCard {
          Text("小结").font(.system(size: 16, weight: .semibold))
          ForEach(insights, id: \.self) { line in
            Text(line).font(.system(size: 14))
          }
        }
      }
      .padding(.horizontal, 16)
      .zfScrollClearance()
    }
    .zfScrollEdge()
    .background(ZFColor.bg)
  }

  private func stat(_ value: String, _ label: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(value).font(.system(size: 22, weight: .bold))
      Text(label).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .background(ZFColor.card)
    .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: 12))
  }

  private var triggerRows: [(String, Int)] {
    var counts: [String: Int] = [:]
    for row in model.state.relapses {
      for name in row.triggers { counts[name, default: 0] += 1 }
    }
    return counts.map { ($0.key, $0.value) }.sorted { $0.1 > $1.1 }
  }

  private var moodRows: [(String, Int)] {
    var counts: [Int: Int] = [:]
    for item in model.state.checkins.values { counts[item.mood, default: 0] += 1 }
    return Catalog.moods.map { ($0.title, counts[$0.value] ?? 0) }
  }

  private func bars(_ rows: [(String, Int)], color: Color) -> some View {
    let maxValue = max(rows.map(\.1).max() ?? 1, 1)
    return VStack(spacing: 8) {
      ForEach(rows, id: \.0) { row in
        HStack {
          Text(row.0).font(.system(size: 13)).frame(width: 72, alignment: .leading)
          GeometryReader { geo in
            Capsule().fill(color.opacity(0.85))
              .frame(width: max(4, geo.size.width * CGFloat(row.1) / CGFloat(maxValue)))
          }
          .frame(height: 8)
          Text("\(row.1)").font(.system(size: 12)).foregroundStyle(ZFColor.muted).frame(width: 24)
        }
      }
    }
  }

  private var buckets: [(String, Int, Int)] {
    var relapse = Array(repeating: 0, count: 6)
    var urge = Array(repeating: 0, count: 6)
    for row in model.state.relapses {
      relapse[bucket(row.ts)] += 1
    }
    for row in model.state.urges {
      urge[bucket(row.ts)] += 1
    }
    return Catalog.timeBuckets.enumerated().map { index, item in
      (item.0, relapse[index], urge[index])
    }
  }

  private func bucket(_ ms: Double) -> Int {
    min(5, Calendar.current.component(.hour, from: Date(timeIntervalSince1970: ms / 1000)) / 4)
  }

  private var timeChart: some View {
    let rows = buckets
    let maxValue = max(1, rows.map { max($0.1, $0.2) }.max() ?? 1)
    return HStack(alignment: .bottom, spacing: 8) {
      ForEach(rows, id: \.0) { row in
        VStack(spacing: 4) {
          HStack(alignment: .bottom, spacing: 3) {
            bar(row.1, maxValue, ZFColor.warm)
            bar(row.2, maxValue, ZFColor.mint)
          }
          .frame(height: 90)
          Text(row.0).font(.system(size: 11)).foregroundStyle(ZFColor.muted)
        }
        .frame(maxWidth: .infinity)
      }
    }
  }

  private func bar(_ value: Int, _ maxValue: Int, _ color: Color) -> some View {
    RoundedRectangle(cornerRadius: 3)
      .fill(color.opacity(value == 0 ? 0.25 : 1))
      .frame(width: 8, height: value == 0 ? 2 : max(4, 80 * CGFloat(value) / CGFloat(maxValue)))
  }

  private var insights: [String] {
    var lines: [String] = []
    let rows = buckets
    if !model.state.relapses.isEmpty, let peak = rows.max(by: { $0.1 < $1.1 }) {
      let start = Catalog.timeBuckets.first { $0.0 == peak.0 }?.1 ?? 0
      lines.append("高风险时段：\(peak.0) \(start)–\(start + 4) 点")
    }
    if let top = triggerRows.first { lines.append("最常见触发：\(top.0)") }
    if !model.state.urges.isEmpty { lines.append("已抵御 \(model.state.urges.count) 次") }
    let current = AppState.currentMs(model.state) / Streak.day
    let next = Catalog.milestones.first { current < Double($0.days) }?.days ?? Catalog.milestones.last?.days ?? 90
    lines.append("已戒 \(AppState.fmtDays(AppState.currentMs(model.state))) 天，下一档 \(next) 天")
    return lines
  }
}

struct SOSView: View {
  @Environment(AppModel.self) private var model
  @State private var step = 1
  @State private var breath = BreathRun()
  @State private var logged = false

  var body: some View {
    ZStack {
      ZFColor.bg.ignoresSafeArea()
      if step == 1 { breathing }
      else { ending }
    }
    .onAppear {
      logged = false
      breath.start()
      step = 1
    }
    .onDisappear { breath.stop() }
  }

  private var breathing: some View {
    VStack(spacing: 18) {
      HStack {
        Button { model.showSOS = false } label: { Image(systemName: "xmark") }
          .foregroundStyle(ZFColor.text)
        Spacer()
        Text(model.t("呼吸", "Take a breath")).font(.system(size: 13)).foregroundStyle(ZFColor.muted)
        Spacer()
        Button(model.t("跳过", "Skip")) { breath.stop(); step = 2 }
          .foregroundStyle(ZFColor.text)
      }
      ZStack {
        Circle()
          .stroke(ZFColor.text.opacity(0.2), lineWidth: 2)
          .frame(width: 220, height: 220)
          .scaleEffect(breath.scale)
        VStack(spacing: 4) {
          Text(breath.phase).font(.system(size: 17, weight: .semibold)).foregroundStyle(ZFColor.muted)
          Text("\(breath.count)").font(.system(size: 48, weight: .semibold)).foregroundStyle(ZFColor.muted.opacity(0.45))
        }
      }
      Text(model.t("跟着圆圈", "Follow the circle")).foregroundStyle(ZFColor.muted)
      Text(breath.roundText).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
    }
    .padding(16)
    .onChange(of: breath.finished) { _, done in
      if done { step = 2 }
    }
  }

  private var ending: some View {
    let days = Streak.wholeDays(AppState.currentMs(model.state))
    return VStack(alignment: .leading, spacing: 16) {
      HStack {
        Button { model.showSOS = false } label: { Image(systemName: "xmark") }
          .foregroundStyle(ZFColor.text)
        Spacer()
      }
      Text(model.t("当前连续 \(days) 天", days == 1 ? "Current streak: 1 day" : "Current streak: \(days) days"))
        .font(.system(size: 22, weight: .bold))
      ZFCard {
        Text(model.t("理由", "Your reasons")).font(.system(size: 16, weight: .semibold))
        if model.state.reasons.isEmpty {
          Text(model.t("还没有理由。", "No reasons yet.")).foregroundStyle(ZFColor.muted)
          Button(model.t("去添加", "Add a reason")) { model.showSOS = false; model.settingsPage = .reasons }
            .foregroundStyle(ZFColor.text)
        }
        ForEach(model.state.reasons, id: \.self) { reason in
          Text(reason)
        }
      }
      PrimaryButton(title: model.t("撑过去了", "I made it through")) {
        if !logged {
          model.recordUrge()
          logged = true
        }
        model.show(model.t("已记下", "Saved"))
        model.showSOS = false
      }
      GhostButton(title: model.t("没撑住", "I didn't make it this time")) {
        model.showSOS = false
        model.openRecord(AppState.dateKey(Clock.now()))
      }
      Spacer()
    }
    .padding(16)
  }
}

@Observable
final class BreathRun {
  var phase = "准备"
  var count = 3
  var hint = "准备"
  var roundText = ""
  var progress: Double = 0
  var scale: CGFloat = 0.55
  var finished = false
  private var task: Task<Void, Never>?

  func start() {
    stop()
    finished = false
    let en = AppLanguage.stored == .en
    let phases: [(String, Int, String)] = [
      (en ? "Breathe in" : "吸气", 4, "in"),
      (en ? "Hold" : "屏息", 4, "hold"),
      (en ? "Breathe out" : "呼气", 4, "out"),
      (en ? "Hold" : "屏息", 4, "hold")
    ]
    var seq: [(String, Int, String, Int)] = [(en ? "Ready" : "准备", 3, "prep", 0)]
    for round in 1...4 {
      for phase in phases { seq.append((phase.0, phase.1, phase.2, round)) }
    }
    let total = seq.reduce(0) { $0 + $1.1 }
    task = Task { @MainActor in
      var elapsed = 0
      for item in seq {
        let en = AppLanguage.stored == .en
        phase = item.0
        hint = item.2 == "in" ? (en ? "Breathe in" : "吸气") : item.2 == "out" ? (en ? "Breathe out" : "呼气") : item.2 == "hold" ? (en ? "Hold" : "屏住") : (en ? "Ready" : "准备")
        roundText = item.3 == 0 ? "" : (en ? "Round \(item.3) of 4" : "第 \(item.3) / 4 轮")
        if item.2 == "in" { scale = 1 }
        if item.2 == "out" { scale = 0.55 }
        for left in stride(from: item.1, through: 1, by: -1) {
          if Task.isCancelled { return }
          count = left
          progress = Double(elapsed) / Double(max(total, 1))
          try? await Task.sleep(nanoseconds: 1_000_000_000)
          elapsed += 1
        }
      }
      progress = 1
      finished = true
    }
  }

  func stop() {
    task?.cancel()
    task = nil
    finished = false
  }
}
