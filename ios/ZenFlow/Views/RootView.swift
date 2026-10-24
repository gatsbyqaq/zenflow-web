import SwiftUI
import UIKit

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
  @State private var tab = PreviewLaunch.tab

  var body: some View {
    @Bindable var model = model
    tabRoot
      .tint(ZFColor.text)
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
      .zfSheetGlass()
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
      .zfSheetGlass()
    }
  }

  @ViewBuilder
  private var tabRoot: some View {
    if #available(iOS 26, *) {
      systemTabs.tabBarMinimizeBehavior(.onScrollDown)
    } else if #available(iOS 18, *) {
      systemTabs
    } else {
      legacyTabs
    }
  }

  @available(iOS 18, *)
  private var systemTabs: some View {
    TabView(selection: $tab) {
      Tab(model.t("打卡", "Check-in"), systemImage: "checkmark.circle", value: 0) {
        HomeView()
      }
      Tab(model.t("记录", "Log"), systemImage: "list.bullet", value: 1) {
        LogView()
      }
      Tab(model.t("统计", "Stats"), systemImage: "chart.bar", value: 2) {
        StatsView()
      }
      Tab(model.t("设置", "Settings"), systemImage: "gearshape", value: 3) {
        SettingsView()
      }
    }
  }

  private var legacyTabs: some View {
    TabView(selection: $tab) {
      HomeView()
        .tabItem { Label(model.t("打卡", "Check-in"), systemImage: "checkmark.circle") }
        .tag(0)
      LogView()
        .tabItem { Label(model.t("记录", "Log"), systemImage: "list.bullet") }
        .tag(1)
      StatsView()
        .tabItem { Label(model.t("统计", "Stats"), systemImage: "chart.bar") }
        .tag(2)
      SettingsView()
        .tabItem { Label(model.t("设置", "Settings"), systemImage: "gearshape") }
        .tag(3)
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
      .scrollContentBackground(.hidden)
    }
    .presentationDetents([.medium])
    .zfSheetGlass()
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

  private var spinning: Bool { model.connectFace == .spinning }

  var body: some View {
    ZStack {
      Color.black.opacity(0.4).ignoresSafeArea()
      card
        .scaleEffect(reduce ? 1 : (shown ? 1 : 0.96))
        .opacity(shown ? 1 : 0)
    }
    .onAppear {
      withAnimation(reduce ? .linear(duration: 0.15) : .timingCurve(0.2, 0, 0, 1, duration: 0.3)) {
        shown = true
      }
    }
  }

  /// 超时内容和「正在连接」共用同一块高度。重试时不放按钮视图，避免玻璃里留下残影。
  private var card: some View {
    ZStack {
      slot
      if spinning {
        VStack(spacing: 16) {
          ProgressView()
            .controlSize(.large)
          Text(model.t("正在连接", "Connecting"))
            .font(.system(size: 15))
            .foregroundStyle(ZFColor.glassSecondary)
        }
      } else {
        timeoutContent
      }
    }
    .padding(.init(top: 24, leading: 16, bottom: 16, trailing: 16))
    .frame(width: 280)
    .zfGlass(in: RoundedRectangle(cornerRadius: 16, style: .continuous))
  }

  /// 和超时内容同一套行高，重试时只留空白，不画按钮。
  private var slot: some View {
    let titleH = UIFont.systemFont(ofSize: 17, weight: .semibold).lineHeight
    let subtitleH = UIFont.systemFont(ofSize: 14, weight: .regular).lineHeight
    return VStack(spacing: 0) {
      Color.clear.frame(height: 24).padding(.top, 8)
      Color.clear.frame(height: titleH).padding(.top, 16)
      Color.clear.frame(height: subtitleH).padding(.top, 4)
      Color.clear.frame(height: 44).padding(.top, 24)
    }
    .accessibilityHidden(true)
  }

  private var timeoutContent: some View {
    VStack(spacing: 0) {
      Image(systemName: "link.slash")
        .symbolRenderingMode(.monochrome)
        .font(.system(size: 24, weight: .regular))
        .foregroundStyle(ZFColor.text)
        .frame(width: 24, height: 24)
        .padding(.top, 8)
      Text(model.t("连接超时", "Connection timed out"))
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(ZFColor.text)
        .padding(.top, 16)
      Text(model.t("数据已保存在本机", "Saved on this device"))
        .font(.system(size: 14))
        .foregroundStyle(ZFColor.glassSecondary)
        .lineLimit(1)
        .padding(.top, 4)
      HStack(spacing: 8) {
        Button(model.t("本机模式", "On this device")) { model.useLocalMode() }
          .buttonStyle(ConnectButtonStyle(gray: true))
        Button(model.t("重试", "Retry")) { model.retryConnect() }
          .buttonStyle(ConnectButtonStyle(gray: false))
      }
      .padding(.top, 24)
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
