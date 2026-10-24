import SwiftUI

struct RootView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    ZStack(alignment: .bottom) {
      ZFColor.bg.ignoresSafeArea()
      switch model.gate {
      case .boot:
        VStack(spacing: 12) {
          ProgressView()
          Text(model.bootText).font(.system(size: 15)).foregroundStyle(ZFColor.muted)
        }
      case .login:
        AuthView()
      case .invite:
        GateView(needsInvite: true)
      case .handle:
        GateView(needsInvite: false)
      case .ready:
        MainView()
      }
      if model.connectFace != .hidden {
        ConnectTimeoutCard()
      }
      if model.lock.locked {
        LockCover()
      }
      if let toast = model.toast {
        ToastBanner(text: toast)
          .transition(.opacity)
      }
    }
    .onChange(of: scenePhase) { _, phase in
      model.lock.scene(phase)
    }
    .task { await model.bootstrap() }
  }
}

struct MainView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.scenePhase) private var scenePhase
  @State private var tab = 0

  var body: some View {
    @Bindable var model = model
    VStack(spacing: 0) {
      Group {
        switch tab {
        case 0: HomeView()
        case 1: LogView()
        case 2: StatsView()
        default: NavigationStack { SettingsView() }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      tabBar
    }
    .background(ZFColor.bg)
    .onChange(of: scenePhase) { _, phase in
      model.lock.scene(phase)
    }
    .sheet(isPresented: Binding(
      get: { model.recordDay != nil && model.dayKey == nil },
      set: { if !$0 { model.recordDay = nil } }
    )) {
      if let day = model.recordDay { RecordSheet(day: day) }
    }
    .sheet(isPresented: Binding(get: { model.dayKey != nil }, set: { if !$0 { model.dayKey = nil } })) {
      if let day = model.dayKey { DaySheet(day: day) }
    }
    .sheet(isPresented: Binding(get: { model.pendingImport != nil }, set: { if !$0 { model.pendingImport = nil } })) {
      VStack(alignment: .leading, spacing: 14) {
        Text("导入数据？").font(.system(size: 20, weight: .bold))
        Text(model.pendingImport?.summary ?? "")
        PrimaryButton(title: "覆盖导入") { model.confirmImport() }
        Button("取消") { model.pendingImport = nil }.frame(maxWidth: .infinity)
        Spacer()
      }
      .padding(20)
      .presentationDetents([.height(260)])
    }
    .fullScreenCover(isPresented: $model.showSOS) {
      SOSView()
    }
    .sheet(isPresented: $model.askStart) {
      StartAdjustSheet()
    }
    .sheet(isPresented: $model.askLogout) {
      VStack(alignment: .leading, spacing: 14) {
        Text("退出登录").font(.system(size: 20, weight: .bold))
        Text("退出后会清除这台设备上的数据，云端数据保留。")
        Button("退出登录") { Task { await model.logout() } }
          .font(.system(size: 16, weight: .semibold))
          .frame(maxWidth: .infinity)
          .padding(.vertical, 12)
          .foregroundStyle(.white)
          .background(ZFColor.warm)
          .clipShape(RoundedRectangle(cornerRadius: 8))
        Button("取消") { model.askLogout = false }
          .frame(maxWidth: .infinity)
        Spacer()
      }
      .padding(20)
      .presentationDetents([.height(240)])
    }
  }

  private var tabBar: some View {
    HStack(spacing: 0) {
      tab(.home, model.t("打卡", "Check-in"), 0)
      tab(.log, model.t("记录", "Log"), 1)
      tab(.stats, model.t("统计", "Stats"), 2)
      tab(.settings, model.t("设置", "Settings"), 3)
    }
    .padding(.top, 6)
    .padding(.bottom, 4)
    .background(ZFColor.bg)
    .overlay(alignment: .top) { Rectangle().fill(ZFColor.line).frame(height: 1) }
  }

  private func tab(_ kind: ZFTabIcon.Kind, _ title: String, _ index: Int) -> some View {
    let on = tab == index
    return Button { tab = index } label: {
      VStack(spacing: 3) {
        ZFTabIcon(kind: kind, filled: on)
          .frame(width: 24, height: 24)
        Text(title).font(.system(size: 10, weight: on ? .bold : .medium))
      }
      .foregroundStyle(on ? ZFColor.text : ZFColor.muted)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 4)
    }
    .buttonStyle(.plain)
  }
}

struct ZFTabIcon: View {
  enum Kind { case home, log, stats, settings }
  var kind: Kind
  var filled: Bool

  var body: some View {
    Canvas { context, size in
      let s = min(size.width, size.height) / 24
      var path = Path()
      switch kind {
      case .home:
        path.move(to: CGPoint(x: 4 * s, y: 11 * s))
        path.addLine(to: CGPoint(x: 12 * s, y: 4 * s))
        path.addLine(to: CGPoint(x: 20 * s, y: 11 * s))
        path.addLine(to: CGPoint(x: 20 * s, y: 20 * s))
        path.addLine(to: CGPoint(x: 4 * s, y: 20 * s))
        path.closeSubpath()
        if filled {
          context.fill(path, with: .foreground)
        } else {
          context.stroke(path, with: .foreground, style: StrokeStyle(lineWidth: 1.6 * s, lineJoin: .round))
        }
      case .log:
        let book = CGRect(x: 4 * s, y: 3 * s, width: 12 * s, height: 18 * s)
        path.addRoundedRect(in: book, cornerSize: CGSize(width: 2 * s, height: 2 * s))
        if filled { context.fill(path, with: .foreground) }
        else { context.stroke(path, with: .foreground, style: StrokeStyle(lineWidth: 1.6 * s, lineJoin: .round)) }
        var pen = Path()
        pen.move(to: CGPoint(x: 14 * s, y: 14 * s))
        pen.addLine(to: CGPoint(x: 21 * s, y: 7 * s))
        pen.move(to: CGPoint(x: 18 * s, y: 6 * s))
        pen.addLine(to: CGPoint(x: 21 * s, y: 9 * s))
        context.stroke(pen, with: .foreground, style: StrokeStyle(lineWidth: 1.6 * s, lineCap: .round))
      case .stats:
        let bars = [
          CGRect(x: 4 * s, y: 12 * s, width: 4 * s, height: 8 * s),
          CGRect(x: 10 * s, y: 7 * s, width: 4 * s, height: 13 * s),
          CGRect(x: 16 * s, y: 4 * s, width: 4 * s, height: 16 * s)
        ]
        for rect in bars {
          let bar = Path(roundedRect: rect, cornerSize: CGSize(width: 1 * s, height: 1 * s))
          if filled { context.fill(bar, with: .foreground) }
          else { context.stroke(bar, with: .foreground, style: StrokeStyle(lineWidth: 1.6 * s)) }
        }
      case .settings:
        let circle = Path(ellipseIn: CGRect(x: 8 * s, y: 8 * s, width: 8 * s, height: 8 * s))
        if filled { context.fill(circle, with: .foreground) }
        else { context.stroke(circle, with: .foreground, style: StrokeStyle(lineWidth: 1.6 * s)) }
        var teeth = Path()
        for i in 0..<8 {
          let angle = CGFloat(i) * .pi / 4
          let inner: CGFloat = 10
          let outer: CGFloat = 11.5
          teeth.move(to: CGPoint(x: (12 + cos(angle) * inner) * s, y: (12 + sin(angle) * inner) * s))
          teeth.addLine(to: CGPoint(x: (12 + cos(angle) * outer) * s, y: (12 + sin(angle) * outer) * s))
        }
        context.stroke(teeth, with: .foreground, style: StrokeStyle(lineWidth: filled ? 2.4 * s : 1.6 * s, lineCap: .round))
      }
    }
  }
}

struct StartAdjustSheet: View {
  @Environment(AppModel.self) private var model
  @State private var startDate = Date()

  var body: some View {
    NavigationStack {
      Form {
        DatePicker(model.t("开始时间", "Start"), selection: $startDate, in: ...Date())
        Text(model.t("可改成更早的开始时间。之后若有会重置的破戒，天数从那次算起。", "You can move the start earlier. A relapse that resets the streak counts from that time."))
          .font(.system(size: 13))
          .foregroundStyle(ZFColor.muted)
      }
      .navigationTitle(model.t("开始时间", "Start"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button(model.t("取消", "Cancel")) { model.askStart = false } }
        ToolbarItem(placement: .confirmationAction) {
          Button(model.t("保存", "Save")) {
            model.setManualStart(startDate)
            model.askStart = false
          }
        }
      }
    }
    .presentationDetents([.medium])
    .onAppear { startDate = Date(timeIntervalSince1970: model.state.streakStart / 1000) }
  }
}

struct LockCover: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    VStack(spacing: 18) {
      Image(systemName: "faceid")
        .font(.system(size: 44))
        .foregroundStyle(ZFColor.text)
      Text(model.t("已锁定", "Locked"))
        .font(.system(size: 22, weight: .bold))
      Text(model.t("用面容 ID 解锁", "Unlock with Face ID"))
        .font(.system(size: 14))
        .foregroundStyle(ZFColor.muted)
      PrimaryButton(title: model.t("解锁", "Unlock")) {
        Task { await model.lock.unlock() }
      }
      .padding(.horizontal, 48)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(ZFColor.bg.ignoresSafeArea())
    .task { await model.lock.unlock() }
  }
}

struct ConnectTimeoutCard: View {
  @Environment(AppModel.self) private var model
  @Environment(\.accessibilityReduceMotion) private var reduce
  @State private var shown = false

  var body: some View {
    ZStack {
      Color.black.opacity(0.4).ignoresSafeArea()
      VStack(spacing: 12) {
        if model.connectFace == .spinning {
          ProgressView()
            .controlSize(.large)
            .frame(maxWidth: .infinity, minHeight: 120)
        } else {
          BrokenLinkIcon()
            .frame(width: 24, height: 24)
            .foregroundStyle(ZFColor.text)
          Text(model.t("连接超时", "Connection timed out"))
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(ZFColor.text)
          Text(model.t("数据已保存在本机", "Saved on this device"))
            .font(.system(size: 14))
            .foregroundStyle(ZFColor.muted)
            .lineLimit(1)
          HStack(spacing: 8) {
            Button(model.t("本机模式", "On this device")) { model.useLocalMode() }
              .buttonStyle(ConnectButtonStyle(gray: true))
            Button(model.t("重试", "Retry")) { model.retryConnect() }
              .buttonStyle(ConnectButtonStyle(gray: false))
          }
          .padding(.top, 4)
        }
      }
      .padding(.init(top: 22, leading: 16, bottom: 16, trailing: 16))
      .frame(width: 280)
      .frame(minHeight: 168)
      .background(ZFColor.card)
      .clipShape(RoundedRectangle(cornerRadius: 16))
      .scaleEffect(reduce ? 1 : (shown ? 1 : 0.96))
      .opacity(shown ? 1 : 0)
    }
    .onAppear {
      withAnimation(reduce ? .linear(duration: 0.15) : .timingCurve(0.2, 0, 0, 1, duration: 0.3)) {
        shown = true
      }
    }
  }
}

private struct ConnectButtonStyle: ButtonStyle {
  var gray: Bool
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 15, weight: .semibold))
      .foregroundStyle(gray ? ZFColor.text : ZFColor.inkButtonText)
      .frame(maxWidth: .infinity)
      .frame(minHeight: 44)
      .background(gray ? ZFColor.grayButton : ZFColor.inkButton)
      .clipShape(RoundedRectangle(cornerRadius: 12))
  }
}

struct BrokenLinkIcon: View {
  var body: some View {
    Canvas { context, size in
      let s = min(size.width, size.height) / 24
      var left = Path()
      left.addArc(center: CGPoint(x: 8 * s, y: 12 * s), radius: 4 * s, startAngle: .degrees(40), endAngle: .degrees(320), clockwise: false)
      var right = Path()
      right.addArc(center: CGPoint(x: 16 * s, y: 12 * s), radius: 4 * s, startAngle: .degrees(220), endAngle: .degrees(140), clockwise: false)
      let style = StrokeStyle(lineWidth: 1.7 * s, lineCap: .round)
      context.stroke(left, with: .foreground, style: style)
      context.stroke(right, with: .foreground, style: style)
    }
  }
}
