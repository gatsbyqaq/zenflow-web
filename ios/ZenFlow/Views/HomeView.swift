import SwiftUI

struct HomeView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack(spacing: 8) {
          PetalLogo(size: 28)
          Wordmark(size: 15)
          Spacer()
          if model.localMode {
            Text(model.t("仅本机", "On this device"))
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(ZFColor.muted)
          }
        }
        .padding(.top, 8)
        Text(model.t("打卡", "Check-in"))
          .font(.system(size: 28, weight: .bold))
        TimelineView(.periodic(from: .now, by: 60)) { context in
          hero(now: context.date)
        }
        badges
      }
      .padding(.horizontal, 16)
      .zfScrollClearance()
    }
    .background(ZFColor.bg)
  }

  private func hero(now: Date) -> some View {
    let ms = AppState.currentMs(model.state, now: now.timeIntervalSince1970 * 1000)
    let days = Streak.wholeDays(ms)
    let goal = max(model.state.goalDays, 1)
    let progress = min(1, Double(days) / Double(goal))
    let best = Streak.wholeDays(AppState.bestMs(model.state, now: now.timeIntervalSince1970 * 1000))
    return VStack(spacing: 14) {
      ZStack {
        Circle().stroke(ZFColor.line, lineWidth: 12)
        Circle()
          .trim(from: 0, to: progress)
          .stroke(ZFColor.ins, style: StrokeStyle(lineWidth: 12, lineCap: .round))
          .rotationEffect(.degrees(-90))
        VStack(spacing: 0) {
          Text("\(days)")
            .font(.system(size: 56, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(ZFColor.text)
          Text(days == 1 ? model.t("天", "day") : model.t("天", "days"))
            .font(.system(size: 15))
            .foregroundStyle(ZFColor.muted)
        }
      }
      .frame(width: 220, height: 220)
      .frame(maxWidth: .infinity)
      .accessibilityLabel("\(days) \(model.t("天", "days"))")
      UrgeButton(title: model.t("我现在很想", "I'm having an urge")) {
        model.showSOS = true
      }
      GrayButton(title: model.t("记录", "Log"), systemImage: "square.and.pencil") {
        model.openRecord(AppState.dateKey(Clock.now()))
      }
      HStack {
        mini("\(best) \(model.t("天", "days"))", model.t("最长连续", "Longest streak"))
        mini("\(model.state.urges.count)", model.t("抵御冲动", "Urges resisted"))
        mini("\(model.state.checkins.count)", model.t("打卡天数", "Total days"))
      }
    }
    .padding(16)
    .background(ZFColor.card)
    .clipShape(RoundedRectangle(cornerRadius: 16))
  }

  private func badgeName(_ item: Catalog.Milestone) -> String {
    if model.language == .zh { return item.name }
    switch item.days {
    case 1: return "Start"
    case 3: return "3 days"
    case 7: return "1 week"
    case 14: return "2 weeks"
    case 30: return "1 month"
    case 60: return "2 months"
    default: return "90 days"
    }
  }

  private func mini(_ value: String, _ label: String) -> some View {
    VStack(spacing: 4) {
      Text(value).font(.system(size: 15, weight: .semibold)).foregroundStyle(ZFColor.text)
      Text(label).font(.system(size: 11)).foregroundStyle(ZFColor.muted).multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
  }

  private var badges: some View {
    let days = Double(Streak.wholeDays(AppState.currentMs(model.state)))
    let best = Double(Streak.wholeDays(AppState.bestMs(model.state)))
    let unlocked = Catalog.milestones.filter { days >= Double($0.days) }.count
    return VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(model.t("里程碑徽章", "Badges"))
          .font(.system(size: 16, weight: .semibold))
        Spacer()
        Text("\(unlocked)/\(Catalog.milestones.count)")
          .font(.system(size: 12))
          .foregroundStyle(ZFColor.muted)
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 10) {
        ForEach(Catalog.milestones, id: \.days) { item in
          let on = days >= Double(item.days)
          VStack(spacing: 4) {
            ZStack {
              if on {
                Circle().fill(ZFColor.ins)
              } else {
                Circle().fill(ZFColor.field)
              }
              Image(systemName: item.symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(on ? Color.white : ZFColor.muted)
            }
            .frame(width: 48, height: 48)
            Text(model.t("\(item.days) 天", "\(item.days)d"))
              .font(.system(size: 12, weight: .bold))
            Text(on ? badgeName(item) : (best >= Double(item.days) ? model.t("曾达成", "Reached") : badgeName(item)))
              .font(.system(size: 11))
              .foregroundStyle(ZFColor.muted)
              .lineLimit(1)
          }
          .opacity(on ? 1 : 0.35)
        }
      }
    }
    .padding(16)
    .background(ZFColor.card)
    .clipShape(RoundedRectangle(cornerRadius: 16))
  }
}

struct MonthCalendar: View {
  @Environment(AppModel.self) private var model
  @Environment(\.colorScheme) private var scheme
  @State private var monthOffset = 0

  var body: some View {
    let base = Calendar.current.date(byAdding: .month, value: monthOffset, to: monthStart(Date())) ?? Date()
    let cells = monthCells(base)
    return VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text(title(base)).font(.system(size: 28, weight: .bold))
        Spacer()
        if monthOffset != 0 {
          Button(model.t("今天", "Today")) { monthOffset = 0 }
            .font(.system(size: 14, weight: .semibold))
        }
        Button { monthOffset -= 1 } label: { Image(systemName: "chevron.left") }
          .foregroundStyle(ZFColor.text)
        Button { if monthOffset < 0 { monthOffset += 1 } } label: { Image(systemName: "chevron.right") }
          .foregroundStyle(ZFColor.text)
          .disabled(monthOffset >= 0)
      }
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 6) {
        ForEach(weekdays, id: \.self) { day in
          Text(day).font(.system(size: 11)).foregroundStyle(ZFColor.muted)
        }
        ForEach(cells) { cell in
          dayCell(cell)
        }
      }
      FlowTags {
        ForEach(Catalog.lapseTypes) { type in
          HStack(spacing: 4) {
            Circle().fill(ZFColor.type(type.id, dark: scheme == .dark)).frame(width: 8, height: 8)
            Text(TypeName.of(type.id, model.language)).font(.system(size: 11))
          }
          .foregroundStyle(ZFColor.type(type.id, dark: scheme == .dark))
        }
      }
    }
  }

  private var weekdays: [String] {
    model.language == .en
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["一", "二", "三", "四", "五", "六", "日"]
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
      .overlay {
        if cell.key == today {
          RoundedRectangle(cornerRadius: 8).stroke(ZFColor.text, lineWidth: 1.5)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .disabled(cell.key == nil || (cell.key ?? "") > today)
  }

  private func cellBackground(_ cell: CalCell, today: String) -> Color {
    guard let key = cell.key, !cell.types.isEmpty || cell.mood != nil else { return .clear }
    if !cell.types.isEmpty { return .clear }
    if let mood = cell.mood {
      let mix = min(0.4, 0.08 * Double(mood))
      return ZFColor.text.opacity(mix)
    }
    return .clear
  }

  private func monthStart(_ date: Date) -> Date {
    let cal = Calendar.current
    let parts = cal.dateComponents([.year, .month], from: date)
    return cal.date(from: parts) ?? date
  }

  private func title(_ date: Date) -> String {
    let cal = Calendar.current
    let year = cal.component(.year, from: date)
    let month = cal.component(.month, from: date)
    if model.language == .en { return "\(month)/\(year)" }
    return "\(year)年\(month)月"
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

enum TypeName {
  static func of(_ id: String, _ lang: AppLanguage) -> String {
    switch id {
    case "masturbation": return lang.t("自慰", "Masturbation")
    case "porn": return lang.t("看黄", "Porn")
    case "sex": return lang.t("性行为", "Sex")
    case "fantasy": return lang.t("意淫", "Fantasy")
    case "dream": return lang.t("梦淫", "Dream")
    default: return Catalog.typeById(id)?.label ?? id
    }
  }
}

struct CalCell: Identifiable {
  var id: String
  var label: String
  var key: String?
  var mood: Int?
  var types: [String]
}
