import SwiftUI

struct LogView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        Text("记录").font(.system(size: 28, weight: .bold)).padding(.top, 8)
        ZFCard {
          Text("不选类型只记心情。选了类型会计入破戒。")
            .font(.system(size: 13)).foregroundStyle(ZFColor.muted)
          PrimaryButton(title: "记录今天", systemImage: "square.and.pencil") {
            model.openRecord(AppState.dateKey(Clock.now()))
          }
        }
        ZFCard {
          HStack {
            Text("历史记录").font(.system(size: 16, weight: .semibold))
            Spacer()
            Text("共 \(items.count) 条").font(.system(size: 12)).foregroundStyle(ZFColor.muted)
          }
          if items.isEmpty {
            Text("还没有记录").foregroundStyle(ZFColor.muted)
          }
          ForEach(items.prefix(80)) { item in
            historyRow(item)
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 24)
    }
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
        Text("统计").font(.system(size: 28, weight: .bold)).padding(.top, 8)
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
          stat("\(urges)", "抵御冲动")
          stat("\(relapses)", "破戒次数")
          stat(AppState.fmtDays(AppState.bestMs(model.state)), "最长连续（天）")
          stat(AppState.fmtDays(AppState.currentMs(model.state)), "当前连续（天）")
          stat("\(model.state.checkins.count)", "累计打卡")
          stat(rate, "冲动抵御率")
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
      .padding(.bottom, 24)
    }
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
  @State private var step = 0
  @State private var mode = "box"
  @State private var breath = BreathRun()
  @State private var actions: [Catalog.Action] = []
  @State private var logged = false

  var body: some View {
    ScrollView {
      VStack(spacing: 16) {
        if step == 0 { start }
        else if step == 1 { breathing }
        else if step == 2 { actionStep }
        else { done }
      }
      .padding(16)
    }
    .background(ZFColor.bg)
    .onDisappear { breath.stop() }
  }

  private var start: some View {
    VStack(spacing: 16) {
      Text("急救").font(.system(size: 28, weight: .bold)).frame(maxWidth: .infinity, alignment: .leading)
      Button {
        logged = false
        breath.start(mode: mode)
        step = 1
      } label: {
        VStack {
          Text("SOS").font(.system(size: 28, weight: .heavy))
          Text("现在有冲动").font(.system(size: 13))
        }
        .foregroundStyle(.white)
        .frame(width: 160, height: 160)
        .background(ZFColor.warm)
        .clipShape(Circle())
      }
      ZFCard {
        Text("先呼吸").font(.system(size: 16, weight: .semibold))
        Text("冲动一般几分钟就会过去。").font(.system(size: 13)).foregroundStyle(ZFColor.muted)
      }
      ZFCard {
        Text("选择呼吸方式").font(.system(size: 16, weight: .semibold))
        Picker("呼吸", selection: $mode) {
          Text("箱式呼吸 4-4-4-4").tag("box")
          Text("4-7-8 呼吸").tag("478")
        }
        .pickerStyle(.segmented)
        Text(mode == "box" ? "吸气 4 秒，屏息 4 秒，呼气 4 秒，屏息 4 秒，共 4 轮。" : "吸气 4 秒，屏息 7 秒，呼气 8 秒，共 4 轮。")
          .font(.system(size: 13)).foregroundStyle(ZFColor.muted)
      }
      Text("已挡住 \(model.state.urges.count) 次")
        .font(.system(size: 13)).foregroundStyle(ZFColor.muted)
    }
  }

  private var breathing: some View {
    VStack(spacing: 18) {
      HStack {
        Button { breath.stop(); step = 0 } label: { Image(systemName: "xmark") }
        Spacer()
        Text("第 1 步 · 呼吸").font(.system(size: 13)).foregroundStyle(ZFColor.muted)
        Spacer()
        Button("跳过") { breath.stop(); showActions() }
      }
      ZStack {
        Circle().fill(ZFColor.primary.opacity(0.15)).frame(width: 220, height: 220)
        Circle()
          .fill(ZFColor.primary)
          .frame(width: 180, height: 180)
          .scaleEffect(breath.scale)
        VStack {
          Text(breath.phase).foregroundStyle(.white)
          Text("\(breath.count)").font(.system(size: 42, weight: .bold)).foregroundStyle(.white)
        }
      }
      Text(breath.hint).foregroundStyle(ZFColor.muted)
      ProgressView(value: breath.progress)
      Text(breath.roundText).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
    }
    .onChange(of: breath.finished) { _, done in
      if done { showActions() }
    }
  }

  private var actionStep: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Button { breath.stop(); step = 0 } label: { Image(systemName: "xmark") }
        Spacer()
        Text("第 2 步 · 转移注意力").font(.system(size: 13)).foregroundStyle(ZFColor.muted)
        Spacer().frame(width: 24)
      }
      ZFCard {
        Text("选一件马上能做的：")
        ForEach(actions.indices, id: \.self) { index in
          Text(actions[index].title)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(ZFColor.field)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        Button("换一批建议") { actions = Array(Catalog.actions.shuffled().prefix(3)) }
          .frame(maxWidth: .infinity)
      }
      ZFCard {
        Text("我的理由").font(.system(size: 16, weight: .semibold))
        if model.state.reasons.isEmpty {
          Text("还没有理由。到设置里添加。").foregroundStyle(ZFColor.muted)
        }
        ForEach(model.state.reasons, id: \.self) { reason in
          Text(reason)
        }
      }
      PrimaryButton(title: "挡住了", systemImage: "checkmark.shield") {
        if !logged {
          model.recordUrge()
          logged = true
        }
        step = 3
      }
      Button("再呼吸一次") {
        breath.start(mode: mode)
        step = 1
      }
      .frame(maxWidth: .infinity)
      Button("去记录") {
        step = 0
        model.openRecord(AppState.dateKey(Clock.now()))
      }
      .frame(maxWidth: .infinity)
      .foregroundStyle(ZFColor.muted)
    }
  }

  private var done: some View {
    VStack(spacing: 12) {
      Text("挡住了").font(.system(size: 32, weight: .bold))
      Text("第 \(model.state.urges.count) 次。").foregroundStyle(ZFColor.muted)
      PrimaryButton(title: "回到首页") { step = 0 }
    }
    .padding(.top, 80)
  }

  private func showActions() {
    actions = Array(Catalog.actions.shuffled().prefix(3))
    step = 2
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

  func start(mode: String) {
    stop()
    finished = false
    let phases: [(String, Int, String)]
    if mode == "478" {
      phases = [("吸气", 4, "in"), ("屏息", 7, "hold"), ("呼气", 8, "out")]
    } else {
      phases = [("吸气", 4, "in"), ("屏息", 4, "hold"), ("呼气", 4, "out"), ("屏息", 4, "hold")]
    }
    var seq: [(String, Int, String, Int)] = [("准备", 3, "prep", 0)]
    for round in 1...4 {
      for phase in phases { seq.append((phase.0, phase.1, phase.2, round)) }
    }
    let total = seq.reduce(0) { $0 + $1.1 }
    task = Task { @MainActor in
      var elapsed = 0
      for item in seq {
        phase = item.0
        hint = item.2 == "in" ? "吸气" : item.2 == "out" ? "呼气" : item.2 == "hold" ? "屏住" : "准备"
        roundText = item.3 == 0 ? "" : "第 \(item.3) / 4 轮"
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
