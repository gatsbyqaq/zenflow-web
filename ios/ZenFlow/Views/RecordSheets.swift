import SwiftUI

struct RecordSheet: View {
  var day: String
  @Environment(AppModel.self) private var model
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dismiss) private var dismiss
  @State private var mood: Int?
  @State private var types: Set<String> = []
  @State private var triggers: Set<String> = []
  @State private var other = ""
  @State private var note = ""
  @State private var time = Date()

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          Text((day == AppState.dateKey(Clock.now()) ? "今天 · " : "") + ZFFormat.dayTitle(day))
            .font(.system(size: 13))
            .foregroundStyle(ZFColor.muted)
          Text("心情").font(.system(size: 13, weight: .semibold))
          HStack {
            ForEach(Catalog.moods, id: \.value) { item in
              Button {
                mood = mood == item.value ? nil : item.value
              } label: {
                VStack(spacing: 4) {
                  Image(systemName: item.symbol)
                  Text(item.title).font(.system(size: 11))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .foregroundStyle(mood == item.value ? .white : ZFColor.text)
                .background(mood == item.value ? ZFColor.primary : ZFColor.field)
                .clipShape(RoundedRectangle(cornerRadius: 8))
              }
              .buttonStyle(.plain)
            }
          }
          Text("行为（可多选）").font(.system(size: 13, weight: .semibold))
          FlowTags {
            ForEach(Catalog.lapseTypes) { type in
              TagButton(title: type.label, selected: types.contains(type.id), tint: ZFColor.type(type.id, dark: scheme == .dark)) {
                if types.contains(type.id) { types.remove(type.id) } else { types.insert(type.id) }
              }
            }
          }
          Text("时间").font(.system(size: 13, weight: .semibold))
          DatePicker("时间", selection: $time, displayedComponents: .hourAndMinute)
            .labelsHidden()
          Text("触发因素").font(.system(size: 13, weight: .semibold))
          FlowTags {
            ForEach(Catalog.triggers, id: \.self) { name in
              TagButton(title: name, selected: triggers.contains(name)) {
                if triggers.contains(name) { triggers.remove(name) } else { triggers.insert(name) }
              }
            }
          }
          if triggers.contains("其他") {
            TextField("其他触发因素", text: $other)
              .padding(10)
              .background(ZFColor.field)
              .clipShape(RoundedRectangle(cornerRadius: 8))
          }
          Text("备注").font(.system(size: 13, weight: .semibold))
          TextField("可选", text: $note, axis: .vertical)
            .lineLimit(3...6)
            .padding(10)
            .background(ZFColor.field)
            .clipShape(RoundedRectangle(cornerRadius: 8))
          Text(hint)
            .font(.system(size: 13))
            .foregroundStyle(ZFColor.muted)
          PrimaryButton(title: buttonTitle, disabled: !canSave) { save() }
        }
        .padding(16)
      }
      .background(ZFColor.bg)
      .navigationTitle("记录行为")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("关闭") { model.recordDay = nil } }
      }
    }
    .onAppear {
      mood = model.state.checkins[day]?.mood
      time = day == AppState.dateKey(Clock.now()) ? Date() : ZFFormat.combine(day: day, time: Date(timeIntervalSince1970: 12 * 3600))
    }
    .presentationDetents([.large])
    .sheet(isPresented: Binding(get: { model.pendingReset != nil }, set: { if !$0 { model.pendingReset = nil } })) {
      VStack(alignment: .leading, spacing: 14) {
        Text("这次会重置戒色天数").font(.system(size: 20, weight: .bold))
        Text("保存后连续天数从这次重算。历史和最佳纪录保留。")
        PrimaryButton(title: "保存并重新计算") { model.confirmPendingReset() }
        Button("取消") { model.pendingReset = nil }.frame(maxWidth: .infinity)
        Spacer()
      }
      .padding(20)
      .presentationDetents([.height(240)])
    }
  }

  private var selected: [String] {
    Catalog.lapseTypes.map(\.id).filter { types.contains($0) }
  }

  private var moodWrite: Bool {
    guard let mood else { return false }
    let prev = model.state.checkins[day]
    if prev == nil || prev?.mood != mood { return true }
    return selected.isEmpty && !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && note != (prev?.note ?? "")
  }

  private var canSave: Bool { moodWrite || !selected.isEmpty }

  private var movesStreak: Bool {
    let ts = ZFFormat.combine(day: day, time: time).timeIntervalSince1970 * 1000
    return !selected.isEmpty
      && Streak.relapseResets(types: selected, resetTypes: model.state.resetTypes)
      && AppState.previewStart(model.state, ts: ts, types: selected) != model.state.streakStart
  }

  private var hint: String {
    if let prev = model.state.checkins[day], mood == prev.mood, selected.isEmpty {
      let title = Catalog.moodByValue(prev.mood)?.title ?? ""
      return "心情已是「\(title)」。可改心情，或选行为。"
    }
    if selected.isEmpty { return "不选行为，只记心情。" }
    return model.resetHint(selected)
  }

  private var buttonTitle: String {
    if !canSave { return "选择心情或行为" }
    if movesStreak { return "保存，并重新计算天数" }
    if !selected.isEmpty { return "保存（天数不变）" }
    return model.state.checkins[day] == nil ? "保存心情" : "更新心情"
  }

  private func save() {
    let when = ZFFormat.combine(day: day, time: time)
    let ordered = Catalog.triggers.filter { triggers.contains($0) }
    model.saveRecord(
      day: day,
      mood: mood,
      types: selected,
      triggers: ordered,
      other: triggers.contains("其他") ? other : "",
      note: note.trimmingCharacters(in: .whitespacesAndNewlines),
      time: when
    )
  }
}

struct DaySheet: View {
  var day: String
  @Environment(AppModel.self) private var model
  @Environment(\.colorScheme) private var scheme
  @State private var confirmClear = false

  var body: some View {
    let checkin = model.state.checkins[day]
    let relapses = model.state.relapses.filter { AppState.dateKey($0.ts) == day }.sorted { $0.ts < $1.ts }
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          Text("线性图 · 00:00–24:00")
            .font(.system(size: 13, weight: .semibold))
          timeline(checkin: checkin, relapses: relapses)
          PrimaryButton(title: "记录行为", systemImage: "square.and.pencil") {
            model.openRecord(day)
          }
          if checkin != nil {
            Button("清除这天的心情") { confirmClear = true }
              .font(.system(size: 14))
              .foregroundStyle(ZFColor.warm)
              .frame(maxWidth: .infinity)
          }
          if !relapses.isEmpty {
            Text("已记下的行为").font(.system(size: 13, weight: .semibold))
            ForEach(relapses) { row in
              RelapseRow(row: row)
            }
          }
        }
        .padding(16)
      }
      .background(ZFColor.bg)
      .navigationTitle(ZFFormat.dayTitle(day))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("关闭") { model.dayKey = nil } }
      }
      .confirmationDialog("清除这天的心情？", isPresented: $confirmClear, titleVisibility: .visible) {
        Button("清除", role: .destructive) { model.clearCheckin(day) }
        Button("取消", role: .cancel) {}
      } message: {
        Text("会去掉 \(day) 的心情。行为记录不受影响。")
      }
      .sheet(isPresented: Binding(
        get: { model.recordDay == day },
        set: { if !$0, model.recordDay == day { model.recordDay = nil } }
      )) {
        RecordSheet(day: day)
      }
    }
  }

  private func timeline(checkin: Checkin?, relapses: [Relapse]) -> some View {
    var events: [(Double, String, Color)] = []
    if let checkin {
      let ts = AppState.dateKey(checkin.ts) == day ? checkin.ts : ZFFormat.combine(day: day, time: Date(timeIntervalSince1970: 12 * 3600)).timeIntervalSince1970 * 1000
      events.append((ts, "心情", ZFColor.primary))
    }
    for row in relapses {
      let id = Streak.normalizeTypes(row.types).first
      events.append((row.ts, "破戒", id.map { ZFColor.type($0, dark: scheme == .dark) } ?? ZFColor.warm))
    }
    events.sort { $0.0 < $1.0 }
    return VStack(alignment: .leading, spacing: 8) {
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(ZFColor.line).frame(height: 3)
          ForEach(Array(events.enumerated()), id: \.offset) { _, event in
            Circle()
              .fill(event.2)
              .frame(width: 10, height: 10)
              .offset(x: max(0, geo.size.width * fraction(event.0) - 5))
          }
        }
      }
      .frame(height: 16)
      HStack {
        Text("00:00")
        Spacer()
        Text("12:00")
        Spacer()
        Text("24:00")
      }
      .font(.system(size: 11))
      .foregroundStyle(ZFColor.muted)
      if events.isEmpty {
        Text("这一天还没有记录。用下面的「记录行为」补上。")
          .font(.system(size: 13))
          .foregroundStyle(ZFColor.muted)
      }
      if let checkin {
        Text("\(ZFFormat.hm(checkin.ts))  心情打卡 · \(Catalog.moodByValue(checkin.mood)?.title ?? "")")
          .font(.system(size: 14))
        if let note = checkin.note, !note.isEmpty {
          Text(note).font(.system(size: 13)).foregroundStyle(ZFColor.muted)
        }
      }
    }
  }

  private func fraction(_ ms: Double) -> CGFloat {
    let date = Date(timeIntervalSince1970: ms / 1000)
    let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
    let minutes = Double((parts.hour ?? 0) * 60 + (parts.minute ?? 0))
    return CGFloat(min(1, max(0, minutes / 1440)))
  }
}

struct RelapseRow: View {
  var row: Relapse
  @Environment(AppModel.self) private var model
  @Environment(\.colorScheme) private var scheme
  @State private var confirm = false

  var body: some View {
    HStack(alignment: .top) {
      Image(systemName: Catalog.typeById(Streak.normalizeTypes(row.types).first ?? "")?.symbol ?? "cloud.rain")
        .foregroundStyle(ZFColor.type(Streak.normalizeTypes(row.types).first ?? "", dark: scheme == .dark))
        .frame(width: 28)
      VStack(alignment: .leading, spacing: 3) {
        Text("破戒记录").font(.system(size: 15, weight: .semibold))
        if row.streakMs > 0 {
          Text("本次坚持 \(AppState.fmtDays(row.streakMs)) 天")
            .font(.system(size: 12)).foregroundStyle(ZFColor.muted)
        }
        Text(AppState.fmtDT(row.ts)).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
        Text(Streak.normalizeTypes(row.types).compactMap { Catalog.typeById($0)?.label }.joined(separator: "、"))
          .font(.system(size: 13))
        if !row.note.isEmpty { Text(row.note).font(.system(size: 13)) }
      }
      Spacer()
      Button { model.editingRelapse = row } label: { Image(systemName: "square.and.pencil") }
      Button { confirm = true } label: { Image(systemName: "xmark") }
        .foregroundStyle(ZFColor.warm)
    }
    .padding(10)
    .background(ZFColor.field)
    .clipShape(RoundedRectangle(cornerRadius: 10))
    .confirmationDialog("删除这条记录？", isPresented: $confirm, titleVisibility: .visible) {
      Button("删除", role: .destructive) { model.deleteRelapse(row.id) }
      Button("取消", role: .cancel) {}
    } message: {
      Text("删除后不能恢复。会按剩下的记录重算天数。")
    }
    .sheet(isPresented: Binding(
      get: { model.editingRelapse?.id == row.id },
      set: { if !$0, model.editingRelapse?.id == row.id { model.editingRelapse = nil } }
    )) {
      EditRelapseSheet(row: row)
    }
  }
}

struct EditRelapseSheet: View {
  var row: Relapse
  @Environment(AppModel.self) private var model
  @Environment(\.colorScheme) private var scheme
  @State private var time = Date()
  @State private var types: Set<String> = []
  @State private var triggers: Set<String> = []
  @State private var other = ""
  @State private var note = ""

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text("保存后按当前规则重算连续天数。")
            .font(.system(size: 13)).foregroundStyle(ZFColor.muted)
          DatePicker("发生时间", selection: $time, in: ...Date())
          Text("类型（可多选）").font(.system(size: 13, weight: .semibold))
          FlowTags {
            ForEach(Catalog.lapseTypes) { type in
              TagButton(title: type.label, selected: types.contains(type.id), tint: ZFColor.type(type.id, dark: scheme == .dark)) {
                if types.contains(type.id) { types.remove(type.id) } else { types.insert(type.id) }
              }
            }
          }
          Text("触发因素（可多选）").font(.system(size: 13, weight: .semibold))
          FlowTags {
            ForEach(Catalog.triggers, id: \.self) { name in
              TagButton(title: name, selected: triggers.contains(name)) {
                if triggers.contains(name) { triggers.remove(name) } else { triggers.insert(name) }
              }
            }
          }
          if triggers.contains("其他") {
            TextField("其他触发因素", text: $other)
              .padding(10)
              .background(ZFColor.field)
              .clipShape(RoundedRectangle(cornerRadius: 8))
          }
          TextField("备注 / 复盘", text: $note, axis: .vertical)
            .lineLimit(3...6)
            .padding(10)
            .background(ZFColor.field)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .padding(16)
      }
      .background(ZFColor.bg)
      .navigationTitle("编辑这条记录")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("取消") { model.editingRelapse = nil } }
        ToolbarItem(placement: .confirmationAction) {
          Button("保存修改") {
            let selected = Catalog.lapseTypes.map(\.id).filter { types.contains($0) }
            let ordered = Catalog.triggers.filter { triggers.contains($0) }
            model.updateRelapse(row.id, time: time, types: selected, triggers: ordered, other: triggers.contains("其他") ? other : "", note: note)
          }
        }
      }
    }
    .onAppear {
      time = Date(timeIntervalSince1970: row.ts / 1000)
      types = Set(row.types)
      triggers = Set(row.triggers)
      other = row.other
      note = row.note
    }
  }
}
