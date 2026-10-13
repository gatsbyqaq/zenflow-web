import SwiftUI

struct HomeView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.colorScheme) private var scheme
  @State private var monthOffset = 0
  @State private var showStart = false
  @State private var startDate = Date()

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        HStack(spacing: 8) {
          PetalLogo(size: 28)
          Wordmark(size: 15)
          Spacer()
        }
        .padding(.top, 8)
        TimelineView(.periodic(from: .now, by: 1)) { context in
          ring(now: context.date)
        }
        todayCard
        calendar
        badges
        Button {
          NotificationCenter.default.post(name: .zenflowOpenSOS, object: nil)
        } label: {
          HStack {
            Image(systemName: "lifepreserver")
            VStack(alignment: .leading, spacing: 2) {
              Text("有冲动？").font(.system(size: 15, weight: .semibold))
              Text("去急救").font(.system(size: 12)).foregroundStyle(ZFColor.muted)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(ZFColor.muted)
          }
          .padding(14)
          .background(ZFColor.card)
          .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))
          .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 24)
    }
    .background(ZFColor.bg)
    .sheet(isPresented: $showStart) {
      NavigationStack {
        Form {
          DatePicker("开始时间", selection: $startDate, in: ...Date())
          Text("可改成更早的开始时间。之后若有会重置的破戒，天数从那次算起。")
            .font(.system(size: 13))
            .foregroundStyle(ZFColor.muted)
        }
        .navigationTitle("调整开始时间")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("取消") { showStart = false } }
          ToolbarItem(placement: .confirmationAction) {
            Button("保存") {
              model.setManualStart(startDate)
              showStart = false
            }
          }
        }
      }
      .presentationDetents([.medium])
    }
  }

  private func ring(now: Date) -> some View {
    let ms = AppState.currentMs(model.state, now: now.timeIntervalSince1970 * 1000)
    let days = ms / Streak.day
    let goal = Double(max(model.state.goalDays, 1))
    let progress = min(1, days / goal)
    let parts = ZFFormat.hms(from: ms)
    return VStack(spacing: 10) {
      ZStack {
        Circle().stroke(ZFColor.line, lineWidth: 12)
        Circle()
          .trim(from: 0, to: progress)
          .stroke(ZFColor.story, style: StrokeStyle(lineWidth: 12, lineCap: .round))
          .rotationEffect(.degrees(-90))
        VStack(spacing: 0) {
          Text("已戒").font(.system(size: 13)).foregroundStyle(ZFColor.muted)
          Text(AppState.fmtDays(ms)).font(.system(size: 52, weight: .bold)).monospacedDigit()
          Text("天").font(.system(size: 14)).foregroundStyle(ZFColor.muted)
        }
      }
      .frame(width: 210, height: 210)
      .frame(maxWidth: .infinity)
      Text("目标 \(model.state.goalDays) 天")
        .font(.system(size: 13))
        .foregroundStyle(ZFColor.muted)
      HStack(spacing: 10) {
        timeChip(parts.0, "小时")
        timeChip(parts.1, "分钟")
        timeChip(parts.2, "秒")
      }
      HStack {
        Text("开始于 \(AppState.fmtDT(model.state.streakStart))")
          .font(.system(size: 12))
          .foregroundStyle(ZFColor.muted)
        Spacer()
        Button("调整开始时间") {
          startDate = Date(timeIntervalSince1970: model.state.streakStart / 1000)
          showStart = true
        }
        .font(.system(size: 13))
      }
      HStack {
        mini("trophy", "\(AppState.fmtDays(AppState.bestMs(model.state, now: now.timeIntervalSince1970 * 1000)))天", "最佳纪录")
        mini("checkmark.shield", "\(model.state.urges.count)", "抵御冲动")
        mini("calendar", "\(model.state.checkins.count)", "打卡天数")
      }
    }
  }

  private func timeChip(_ value: String, _ label: String) -> some View {
    VStack(spacing: 2) {
      Text(value).font(.system(size: 18, weight: .bold)).monospacedDigit()
      Text(label).font(.system(size: 11)).foregroundStyle(ZFColor.muted)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 8)
    .background(ZFColor.card)
    .overlay(RoundedRectangle(cornerRadius: 10).stroke(ZFColor.line, lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: 10))
  }

  private func mini(_ symbol: String, _ value: String, _ label: String) -> some View {
    VStack(spacing: 4) {
      Image(systemName: symbol).foregroundStyle(ZFColor.primary)
      Text(value).font(.system(size: 15, weight: .semibold))
      Text(label).font(.system(size: 11)).foregroundStyle(ZFColor.muted)
    }
    .frame(maxWidth: .infinity)
  }

  private var todayCard: some View {
    let key = AppState.dateKey(Clock.now())
    let checkin = model.state.checkins[key]
    let relapses = model.state.relapses.filter { AppState.dateKey($0.ts) == key }.sorted { $0.ts < $1.ts }
    return ZFCard {
      HStack {
        Label("今天", systemImage: "calendar")
          .font(.system(size: 16, weight: .semibold))
        Spacer()
        Text(ZFFormat.todayLine()).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
      }
      if checkin == nil && relapses.isEmpty {
        Text("还没有记录").font(.system(size: 13)).foregroundStyle(ZFColor.muted)
      }
      if let checkin, let mood = Catalog.moodByValue(checkin.mood) {
        HStack {
          Image(systemName: mood.symbol)
          VStack(alignment: .leading) {
            Text("心情 · \(mood.title)").font(.system(size: 15, weight: .semibold))
            if let note = checkin.note, !note.isEmpty {
              Text(note).font(.system(size: 13)).foregroundStyle(ZFColor.muted)
            }
          }
        }
      }
      ForEach(relapses) { row in
        Button { model.dayKey = key } label: {
          HStack {
            typeIcon(row.types.first)
            VStack(alignment: .leading) {
              Text(typeLabels(row.types)).font(.system(size: 15, weight: .semibold))
              Text("\(AppState.fmtDT(row.ts)) · \(Streak.relapseResets(types: row.types, resetTypes: model.state.resetTypes) ? "会重置天数" : "不重置天数")")
                .font(.system(size: 12)).foregroundStyle(ZFColor.muted)
            }
            Spacer()
          }
        }
        .buttonStyle(.plain)
      }
      if checkin != nil || !relapses.isEmpty {
        Button("查看今天的线性图") { model.dayKey = key }
          .font(.system(size: 13))
      }
      PrimaryButton(title: "记录行为", systemImage: "square.and.pencil") {
        model.openRecord(key)
      }
    }
  }

  private var calendar: some View {
    let base = Calendar.current.date(byAdding: .month, value: monthOffset, to: monthStart(Date())) ?? Date()
    let cells = monthCells(base)
    return ZFCard {
      HStack {
        Label("打卡日历", systemImage: "calendar")
          .font(.system(size: 16, weight: .semibold))
        Spacer()
        Button { monthOffset -= 1 } label: { Image(systemName: "chevron.left") }
        Text(title(base)).font(.system(size: 14, weight: .semibold)).frame(minWidth: 92)
        Button { if monthOffset < 0 { monthOffset += 1 } } label: { Image(systemName: "chevron.right") }
          .disabled(monthOffset >= 0)
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 6) {
        ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { day in
          Text(day).font(.system(size: 11)).foregroundStyle(ZFColor.muted)
        }
        ForEach(cells) { cell in
          dayCell(cell)
        }
      }
      Text("点某一天查看或补记。")
        .font(.system(size: 12))
        .foregroundStyle(ZFColor.muted)
      FlowTags {
        ForEach(Catalog.lapseTypes) { type in
          HStack(spacing: 4) {
            Image(systemName: type.symbol).font(.system(size: 11))
            Text(type.label).font(.system(size: 11))
          }
          .foregroundStyle(ZFColor.type(type.id, dark: scheme == .dark))
        }
      }
    }
  }

  private func dayCell(_ cell: CalCell) -> some View {
    let today = AppState.dateKey(Clock.now())
    return Button {
      guard let key = cell.key, key <= today else { return }
      model.dayKey = key
    } label: {
      VStack(spacing: 2) {
        Text(cell.label)
          .font(.system(size: 13, weight: cell.key == today ? .bold : .regular))
          .foregroundStyle(cell.key == nil || (cell.key ?? "") > today ? ZFColor.muted.opacity(0.45) : ZFColor.text)
        HStack(spacing: 1) {
          ForEach(cell.types.prefix(3), id: \.self) { id in
            Circle().fill(ZFColor.type(id, dark: scheme == .dark)).frame(width: 4, height: 4)
          }
        }
        .frame(height: 6)
      }
      .frame(maxWidth: .infinity, minHeight: 36)
      .background(cellBackground(cell, today: today))
      .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .disabled(cell.key == nil || (cell.key ?? "") > today)
  }

  private func cellBackground(_ cell: CalCell, today: String) -> Color {
    guard let key = cell.key else { return .clear }
    if key == today { return ZFColor.primary.opacity(0.12) }
    if let mood = cell.mood { return moodColor(mood).opacity(0.22) }
    return .clear
  }

  private func moodColor(_ mood: Int) -> Color {
    switch mood {
    case 5: return ZFColor.mint
    case 4: return ZFColor.primary
    case 2: return ZFColor.amber
    case 1: return ZFColor.warm
    default: return ZFColor.muted
    }
  }

  private var badges: some View {
    let days = AppState.currentMs(model.state) / Streak.day
    let best = AppState.bestMs(model.state) / Streak.day
    let nextDays = Catalog.milestones.first { days < Double($0.days) }?.days
    let unlocked = Catalog.milestones.filter { days >= Double($0.days) }.count
    return ZFCard {
      HStack {
        Label("里程碑徽章", systemImage: "seal")
          .font(.system(size: 16, weight: .semibold))
        Spacer()
        Text("已解锁 \(unlocked)/\(Catalog.milestones.count)")
          .font(.system(size: 12))
          .foregroundStyle(ZFColor.muted)
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 10) {
        ForEach(Catalog.milestones, id: \.days) { item in
          let on = days >= Double(item.days)
          let isNext = item.days == nextDays
          let sub = on ? item.name : (isNext ? "下一个" : (best >= Double(item.days) ? "曾达成" : item.name))
          VStack(spacing: 3) {
            Image(systemName: item.symbol)
              .foregroundStyle(on ? ZFColor.primary : ZFColor.muted)
            Text("\(item.days) 天").font(.system(size: 11, weight: .semibold))
            Text(sub).font(.system(size: 10)).foregroundStyle(ZFColor.muted)
          }
          .opacity(on || isNext ? 1 : 0.55)
        }
      }
    }
  }

  private func typeIcon(_ id: String?) -> some View {
    let symbol = id.flatMap { Catalog.typeById($0)?.symbol } ?? "cloud.rain"
    let color = id.map { ZFColor.type($0, dark: scheme == .dark) } ?? ZFColor.muted
    return Image(systemName: symbol).foregroundStyle(color).frame(width: 28)
  }

  private func typeLabels(_ types: [String]) -> String {
    let labels = Streak.normalizeTypes(types).compactMap { Catalog.typeById($0)?.label }
    return labels.isEmpty ? "行为" : labels.joined(separator: "、")
  }

  private func monthStart(_ date: Date) -> Date {
    let cal = Calendar.current
    let parts = cal.dateComponents([.year, .month], from: date)
    return cal.date(from: parts) ?? date
  }

  private func title(_ date: Date) -> String {
    let cal = Calendar.current
    return "\(cal.component(.year, from: date))年\(cal.component(.month, from: date))月"
  }

  private func monthCells(_ date: Date) -> [CalCell] {
    let cal = Calendar.current
    let year = cal.component(.year, from: date)
    let month = cal.component(.month, from: date)
    guard let start = cal.date(from: DateComponents(year: year, month: month, day: 1)),
          let range = cal.range(of: .day, in: .month, for: start) else { return [] }
    let weekday = cal.component(.weekday, from: start)
    let leading = (weekday + 5) % 7
    var cells = (0..<leading).map { CalCell(id: "e\($0)", label: "", key: nil, mood: nil, types: []) }
    let typesByDay = typesMap()
    for day in range {
      let key = String(format: "%04d-%02d-%02d", year, month, day)
      cells.append(CalCell(
        id: key,
        label: "\(day)",
        key: key,
        mood: model.state.checkins[key]?.mood,
        types: typesByDay[key] ?? []
      ))
    }
    return cells
  }

  private func typesMap() -> [String: [String]] {
    var map: [String: [String]] = [:]
    for row in model.state.relapses {
      let key = AppState.dateKey(row.ts)
      var list = map[key] ?? []
      for id in Streak.normalizeTypes(row.types) where !list.contains(id) { list.append(id) }
      map[key] = list
    }
    return map
  }
}

struct CalCell: Identifiable {
  var id: String
  var label: String
  var key: String?
  var mood: Int?
  var types: [String]
}

extension Notification.Name {
  static let zenflowOpenSOS = Notification.Name("zenflowOpenSOS")
}
