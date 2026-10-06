import SwiftUI

struct RootView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    ZStack(alignment: .bottom) {
      ZFColor.bg.ignoresSafeArea()
      switch model.gate {
      case .boot:
        VStack(spacing: 12) {
          PetalLogo(size: 72)
          Wordmark(size: 18)
          Text(model.bootText).font(.system(size: 14)).foregroundStyle(ZFColor.muted)
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
      if let toast = model.toast {
        ToastBanner(text: toast)
          .transition(.opacity)
      }
    }
    .task { await model.bootstrap() }
  }
}

struct MainView: View {
  @Environment(AppModel.self) private var model
  @State private var tab = 0

  var body: some View {
    @Bindable var model = model
    VStack(spacing: 0) {
      Group {
        switch tab {
        case 0: HomeView()
        case 1: LogView()
        case 2: SOSView()
        case 3: StatsView()
        default: NavigationStack { SettingsView() }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      tabBar
    }
    .background(ZFColor.bg)
    .onReceive(NotificationCenter.default.publisher(for: .zenflowOpenSOS)) { _ in
      tab = 2
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
    HStack {
      tab("house", "打卡", 0, filled: true)
      tab("book", "记录", 1, filled: true)
      tab("lifepreserver", "SOS", 2, filled: false)
      tab("chart.bar", "统计", 3, filled: true)
      tab("gearshape", "设置", 4, filled: true)
    }
    .padding(.top, 8)
    .padding(.bottom, 6)
    .background(ZFColor.card)
    .overlay(alignment: .top) { Rectangle().fill(ZFColor.line).frame(height: 1) }
  }

  private func tab(_ symbol: String, _ title: String, _ index: Int, filled: Bool) -> some View {
    Button { tab = index } label: {
      VStack(spacing: 3) {
        Image(systemName: tab == index && filled ? symbol + ".fill" : symbol)
          .font(.system(size: index == 2 ? 18 : 16, weight: .semibold))
        Text(title).font(.system(size: 10, weight: .medium))
      }
      .foregroundStyle(tab == index ? ZFColor.primary : ZFColor.muted)
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(.plain)
  }
}
