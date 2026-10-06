import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    Group {
      if let page = model.settingsPage {
        SettingsDetail(page: page)
      } else {
        settingsRoot
      }
    }
    .background(ZFColor.bg)
    .navigationBarBackButtonHidden(true)
  }

  private var settingsRoot: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack(spacing: 12) {
          AvatarView(url: model.avatarURL, name: model.shownName, size: 56)
          VStack(alignment: .leading, spacing: 2) {
            Text(model.shownName).font(.system(size: 18, weight: .semibold))
            Text(model.shownHandle.isEmpty ? model.email : model.shownHandle)
              .font(.system(size: 13)).foregroundStyle(ZFColor.muted)
          }
        }
        .padding(.top, 8)
        Text("设置").font(.system(size: 28, weight: .bold))
        group("账号") {
          row("person.crop.circle", "账号与资料", model.shownHandle.isEmpty ? (model.email.isEmpty ? "已登录" : model.email) : model.shownHandle, .account)
        }
        group("戒色") {
          row("target", "目标天数", "\(model.state.goalDays) 天", .goal)
          row("flame", "重置规则", model.resetSummary(), .resets)
        }
        group("偏好") {
          row("circle.lefthalf.filled", "外观", model.theme.label, .theme)
          row("heart", "理由", "\(model.state.reasons.count) 条", .reasons)
        }
        VStack(spacing: 0) {
          row("internaldrive", "数据", "同步、导出、注销", .data)
          divider
          row("info.circle", "关于", "版本与隐私", .about)
        }
        .background(ZFColor.card)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))
        Button {
          model.askLogout = true
        } label: {
          HStack {
            Image(systemName: "rectangle.portrait.and.arrow.right")
            VStack(alignment: .leading) {
              Text("退出登录").font(.system(size: 16, weight: .semibold))
              Text("清除本机数据").font(.system(size: 12))
            }
            Spacer()
          }
          .foregroundStyle(ZFColor.warm)
          .padding(14)
          .background(ZFColor.card)
          .clipShape(RoundedRectangle(cornerRadius: 12))
          .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 24)
    }
  }

  private func group(_ title: String, @ViewBuilder content: () -> some View) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title).font(.system(size: 13)).foregroundStyle(ZFColor.muted).padding(.leading, 4)
      VStack(spacing: 0) { content() }
        .background(ZFColor.card)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))
    }
  }

  private func row(_ symbol: String, _ title: String, _ subtitle: String, _ page: SettingsPage) -> some View {
    Button {
      model.settingsPage = page
    } label: {
      HStack {
        Image(systemName: symbol).frame(width: 28).foregroundStyle(ZFColor.primary)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(ZFColor.text)
          Text(subtitle).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
        }
        Spacer()
        Image(systemName: "chevron.right").font(.system(size: 13)).foregroundStyle(ZFColor.muted)
      }
      .padding(14)
    }
    .buttonStyle(.plain)
  }

  private var divider: some View {
    Rectangle().fill(ZFColor.line).frame(height: 1).padding(.leading, 52)
  }
}

struct SettingsDetail: View {
  var page: SettingsPage
  @Environment(AppModel.self) private var model

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        HStack {
          Button { model.settingsPage = nil } label: {
            Image(systemName: "chevron.left")
            Text("设置")
          }
          Spacer()
        }
        Text(page.title).font(.system(size: 28, weight: .bold))
        switch page {
        case .account: AccountPage()
        case .goal: GoalPage()
        case .resets: ResetPage()
        case .theme: ThemePage()
        case .reasons: ReasonsPage()
        case .data: DataPage()
        case .about: AboutPage()
        }
      }
      .padding(16)
    }
  }
}

struct AccountPage: View {
  @Environment(AppModel.self) private var model
  @State private var name = ""
  @State private var handle = ""
  @State private var handleState = ""
  @State private var message = ""
  @State private var busy = false
  @State private var picker: PhotosPickerItem?
  @State private var cropImage: UIImage?
  @State private var showCrop = false

  var body: some View {
    ZFCard {
      HStack {
        Text("账号").font(.system(size: 16, weight: .semibold))
        Spacer()
        Text(model.sync.label).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
      }
      Text(model.email).font(.system(size: 14))
      if model.lastSync > 0 {
        Text("最近同步 \(AppState.fmtDT(model.lastSync))")
          .font(.system(size: 12)).foregroundStyle(ZFColor.muted)
      }
    }
    ZFCard {
      Text("个人资料").font(.system(size: 16, weight: .semibold))
      HStack(spacing: 12) {
        AvatarView(url: model.avatarURL, name: model.shownName, size: 72)
        PhotosPicker(selection: $picker, matching: .images) {
          Text("更换").font(.system(size: 14, weight: .semibold))
        }
        if model.avatarURL != nil {
          Button("移除") { Task { message = await model.removeAvatar() ?? "" } }
            .font(.system(size: 14))
        }
      }
      ZFField(title: "昵称", text: $name, prompt: "昵称")
      Text("不必唯一，显示在侧栏。").font(.system(size: 12)).foregroundStyle(ZFColor.muted)
      VStack(alignment: .leading, spacing: 6) {
        FieldLabel(text: "@ID")
        HStack {
          Text("@").foregroundStyle(ZFColor.muted)
          TextField("your_id", text: $handle)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          Text(handleState).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
        }
        .padding(10)
        .background(ZFColor.field)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(ZFColor.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
      }
      Text("3–20 位小写字母、数字或下划线，全站唯一。")
        .font(.system(size: 12)).foregroundStyle(ZFColor.muted)
      if !message.isEmpty {
        Text(message).font(.system(size: 13)).foregroundStyle(ZFColor.warm)
      }
      PrimaryButton(title: "保存资料", disabled: busy) {
        Task {
          busy = true
          message = await model.saveProfile(name: name, handle: handle) ?? ""
          busy = false
        }
      }
    }
    .onAppear {
      name = model.profile.displayName ?? ""
      handle = model.profile.handle ?? ""
    }
    .onChange(of: handle) { _, value in
      Task { handleState = await model.checkHandle(value) ?? "" }
    }
    .onChange(of: picker) { _, item in
      guard let item else { return }
      Task {
        if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
          cropImage = image
          showCrop = true
        }
      }
    }
    .sheet(isPresented: $showCrop) {
      if let cropImage {
        AvatarCropView(image: cropImage) { data in
          Task { message = await model.uploadAvatar(data) ?? "" }
        }
      }
    }
  }
}

struct GoalPage: View {
  @Environment(AppModel.self) private var model
  @State private var text = ""

  var body: some View {
    ZFCard {
      Text("默认 30 天。").font(.system(size: 13)).foregroundStyle(ZFColor.muted)
      FlowTags {
        ForEach(Catalog.goalPresets, id: \.self) { days in
          TagButton(title: "\(days) 天", selected: model.state.goalDays == days) {
            model.setGoal(days)
            text = "\(days)"
          }
        }
      }
      HStack {
        TextField("天数", text: $text)
          .keyboardType(.numberPad)
          .padding(10)
          .background(ZFColor.field)
          .clipShape(RoundedRectangle(cornerRadius: 8))
        Button("保存") {
          model.setGoal(Int(text) ?? 0)
        }
        .buttonStyle(.borderedProminent)
      }
    }
    .onAppear { text = "\(model.state.goalDays)" }
  }
}

struct ResetPage: View {
  @Environment(AppModel.self) private var model
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    ZFCard {
      Text("打开会清零天数。关掉只记在日历上。")
        .font(.system(size: 13)).foregroundStyle(ZFColor.muted)
      ForEach(Catalog.lapseTypes) { type in
        let locked = type.id == "masturbation"
        let on = model.state.resetTypes[type.id] != false
        HStack {
          Image(systemName: type.symbol).foregroundStyle(ZFColor.type(type.id, dark: scheme == .dark))
          VStack(alignment: .leading) {
            Text(type.label).font(.system(size: 16, weight: .semibold))
            Text(locked ? "不能关闭" : (on ? "重置天数" : "不重置天数"))
              .font(.system(size: 12)).foregroundStyle(ZFColor.muted)
          }
          Spacer()
          Toggle("", isOn: Binding(
            get: { model.state.resetTypes[type.id] != false },
            set: { _ in model.toggleReset(type.id) }
          ))
          .labelsHidden()
          .disabled(locked)
        }
      }
    }
  }
}

struct ThemePage: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    ZFCard {
      Picker("外观", selection: Binding(get: { model.theme }, set: { model.setTheme($0) })) {
        ForEach([ThemeChoice.system, .light, .dark], id: \.self) { choice in
          Text(choice.label).tag(choice)
        }
      }
      .pickerStyle(.segmented)
    }
  }
}

struct ReasonsPage: View {
  @Environment(AppModel.self) private var model
  @State private var text = ""

  var body: some View {
    ZFCard {
      if model.state.reasons.isEmpty {
        Text("还没有理由").foregroundStyle(ZFColor.muted)
      }
      ForEach(Array(model.state.reasons.enumerated()), id: \.offset) { index, reason in
        HStack {
          Text(reason)
          Spacer()
          Button { model.removeReason(at: index) } label: { Image(systemName: "xmark") }
            .foregroundStyle(ZFColor.warm)
        }
      }
      HStack {
        TextField("写一条", text: $text)
          .padding(10)
          .background(ZFColor.field)
          .clipShape(RoundedRectangle(cornerRadius: 8))
        Button("添加") {
          model.addReason(text)
          text = ""
        }
        .buttonStyle(.borderedProminent)
      }
    }
  }
}

struct DataPage: View {
  @Environment(AppModel.self) private var model
  @State private var importing = false
  @State private var shareURL: URL?
  @State private var showShare = false
  @State private var showReset = false
  @State private var resetText = ""
  @State private var showDelete = false
  @State private var showDeleteHandle = false
  @State private var typedHandle = ""
  @State private var deleteMessage = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
    VStack(spacing: 0) {
      HStack {
        VStack(alignment: .leading) {
          Text("同步").font(.system(size: 16, weight: .semibold))
          Text(model.sync.label).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
        }
        Spacer()
        Button("立即同步") { Task { await model.syncNow() } }
          .font(.system(size: 14, weight: .semibold))
      }
      .padding(14)
    }
    .background(ZFColor.card)
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))

    VStack(spacing: 0) {
      dataRow("square.and.arrow.up", "导出数据", "下载 JSON") { Task { await export() } }
      Rectangle().fill(ZFColor.line).frame(height: 1).padding(.leading, 16)
      dataRow("square.and.arrow.down", "导入数据", "覆盖当前记录") { importing = true }
      Rectangle().fill(ZFColor.line).frame(height: 1).padding(.leading, 16)
      dataRow("arrow.counterclockwise", "重置本机数据", "清空打卡和记录") { showReset = true }
    }
    .background(ZFColor.card)
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))

    Button { showDelete = true } label: {
      HStack {
        VStack(alignment: .leading) {
          Text("注销账号").font(.system(size: 16, weight: .semibold))
          Text("永久删除账号和云端数据").font(.system(size: 12))
        }
        Spacer()
      }
      .foregroundStyle(ZFColor.warm)
      .padding(14)
      .background(ZFColor.card)
      .clipShape(RoundedRectangle(cornerRadius: 12))
      .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))
    }
    .buttonStyle(.plain)

    if !deleteMessage.isEmpty {
      Text(deleteMessage).font(.system(size: 13)).foregroundStyle(ZFColor.warm)
    }

    .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
      if case let .success(url) = result, url.startAccessingSecurityScopedResource() {
        defer { url.stopAccessingSecurityScopedResource() }
        if let data = try? Data(contentsOf: url), let error = model.stageImport(data) {
          model.show(error)
        }
      }
    }
    .sheet(isPresented: $showShare) {
      if let shareURL { ShareSheet(items: [shareURL]) }
    }
    .sheet(isPresented: $showReset) {
      NavigationStack {
        VStack(alignment: .leading, spacing: 12) {
          Text("会清空打卡、记录和理由。登录时会覆盖云端。输入「重置」确认。")
          TextField("重置", text: $resetText)
            .padding(10)
            .background(ZFColor.field)
            .clipShape(RoundedRectangle(cornerRadius: 8))
          PrimaryButton(title: "确认重置") {
            if resetText.trimmingCharacters(in: .whitespacesAndNewlines) != "重置" {
              model.show("请输入「重置」")
            } else {
              model.resetAll()
              showReset = false
              resetText = ""
            }
          }
          Spacer()
        }
        .padding(16)
        .navigationTitle("重置本机数据？")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { showReset = false } } }
      }
      .presentationDetents([.medium])
    }
    .sheet(isPresented: $showDelete) {
      NavigationStack {
        VStack(alignment: .leading, spacing: 12) {
          Text("会永久删除账号和全部云端数据，不能恢复。")
          Button("先导出数据") { Task { await export() } }
            .frame(maxWidth: .infinity)
          PrimaryButton(title: "继续") {
            showDelete = false
            showDeleteHandle = true
          }
          Spacer()
        }
        .padding(16)
        .navigationTitle("注销账号")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { showDelete = false } } }
      }
      .presentationDetents([.medium])
    }
    .sheet(isPresented: $showDeleteHandle) {
      NavigationStack {
        VStack(alignment: .leading, spacing: 12) {
          Text("输入你的 @ID。")
          TextField("@ID", text: $typedHandle)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(10)
            .background(ZFColor.field)
            .clipShape(RoundedRectangle(cornerRadius: 8))
          if !deleteMessage.isEmpty {
            Text(deleteMessage).foregroundStyle(ZFColor.warm)
          }
          Button("注销") {
            Task {
              if let error = await model.deleteAccount(typedHandle: typedHandle) {
                deleteMessage = error
              } else {
                showDeleteHandle = false
              }
            }
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 12)
          .foregroundStyle(.white)
          .background(ZFColor.warm)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          Spacer()
        }
        .padding(16)
        .navigationTitle("确认注销")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { showDeleteHandle = false } } }
      }
      .presentationDetents([.medium])
    }
    }
  }

  private func dataRow(_ symbol: String, _ title: String, _ subtitle: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack {
        Image(systemName: symbol).frame(width: 28).foregroundStyle(ZFColor.primary)
        VStack(alignment: .leading) {
          Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(ZFColor.text)
          Text(subtitle).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
        }
        Spacer()
      }
      .padding(14)
    }
    .buttonStyle(.plain)
  }

  private func export() async {
    let pack = await model.exportPack()
    guard let data = try? pack.jsonValue().data(pretty: true) else { return }
    let stamp = AppState.dateKey(Clock.now()).replacingOccurrences(of: "-", with: "")
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("zenflow-\(stamp).json")
    try? data.write(to: url)
    shareURL = url
    showShare = true
  }
}

struct AboutPage: View {
  var body: some View {
    NavigationLink {
      PrivacyView()
    } label: {
      HStack {
        Image(systemName: "shield").frame(width: 28)
        VStack(alignment: .leading) {
          Text("隐私说明").font(.system(size: 16, weight: .semibold)).foregroundStyle(ZFColor.text)
          Text("存储、查看与删除").font(.system(size: 12)).foregroundStyle(ZFColor.muted)
        }
        Spacer()
        Image(systemName: "chevron.right").foregroundStyle(ZFColor.muted)
      }
      .padding(14)
      .background(ZFColor.card)
      .clipShape(RoundedRectangle(cornerRadius: 12))
      .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))
    }
    ZFCard {
      Text("关于").font(.system(size: 16, weight: .semibold))
      Text("不能替代专业帮助。持续难受请找医生或咨询师。")
        .font(.system(size: 13)).foregroundStyle(ZFColor.muted)
      Text("版本 v\(AppConfig.appVersion)")
        .font(.system(size: 13)).foregroundStyle(ZFColor.muted)
    }
  }
}

struct PrivacyView: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        PetalLogo(size: 48)
        Wordmark(size: 16)
        Text("隐私说明").font(.system(size: 28, weight: .bold))
        Text("2026-10-06").font(.system(size: 13)).foregroundStyle(ZFColor.muted)
        section("存了什么", "邮箱、昵称、@ID、头像，以及你的打卡、破戒、抵御、目标和理由。")
        section("存在哪里", "登录后存在 Supabase 云端数据库。这台设备上还有一份本机副本。")
        section("谁能看", "打卡、破戒和理由只有你自己能看。管理员的用户列表只有账号信息：邮箱、昵称、@ID、头像地址、是否管理员、是否禁用、注册时间、最近登录、最近同步。不包含这些记录。")
        section("验证码", "登录、注册和重置密码使用 Cloudflare Turnstile。")
        section("不做的事", "没有广告，不做行为追踪，不出售数据。")
        section("导出和删除", "设置 → 数据可以下载 JSON。注销账号会删除云端账号和数据，不能恢复。退出登录只清除这台设备，云端还在。")
        Link("在浏览器打开", destination: AppConfig.privacyURL)
          .padding(.top, 8)
      }
      .padding(20)
    }
    .background(ZFColor.bg)
    .navigationTitle("隐私说明")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button("关闭") { dismiss() }
      }
    }
  }

  private func section(_ title: String, _ body: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(.system(size: 17, weight: .semibold))
      Text(body).font(.system(size: 15))
    }
  }
}

struct AvatarView: View {
  var url: URL?
  var name: String
  var size: CGFloat

  var body: some View {
    ZStack {
      Circle().fill(ZFColor.story)
      if let url {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          letter
        }
        .frame(width: size - 4, height: size - 4)
        .clipShape(Circle())
      } else {
        letter
      }
    }
    .frame(width: size, height: size)
  }

  private var letter: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.system(size: size * 0.38, weight: .bold))
      .foregroundStyle(ZFColor.text)
  }
}

struct AvatarCropView: View {
  var image: UIImage
  var onDone: (Data) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var scale: CGFloat = 1
  @State private var offset: CGSize = .zero

  var body: some View {
    NavigationStack {
      VStack {
        GeometryReader { geo in
          let side = min(geo.size.width, geo.size.height) - 32
          ZStack {
            Image(uiImage: image)
              .resizable()
              .scaledToFill()
              .frame(width: side, height: side)
              .scaleEffect(scale)
              .offset(offset)
              .gesture(
                DragGesture().onChanged { offset = $0.translation }
              )
              .gesture(MagnifyGesture().onChanged { scale = min(4, max(1, $0.magnification)) })
              .clipShape(Circle())
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        HStack {
          Text("−")
          Slider(value: $scale, in: 1...4)
          Text("+")
        }
        .padding(.horizontal, 24)
        Text("拖动移动，捏合或滑杆缩放。")
          .font(.system(size: 13)).foregroundStyle(ZFColor.muted)
      }
      .background(Color.black)
      .navigationTitle("裁剪头像")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("完成") {
            if let data = render() { onDone(data) }
            dismiss()
          }
        }
      }
    }
  }

  private func render() -> Data? {
    let side: CGFloat = 256
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
    let output = renderer.image { ctx in
      let rect = CGRect(x: 0, y: 0, width: side, height: side)
      ctx.cgContext.addEllipse(in: rect)
      ctx.cgContext.clip()
      let fitted = aspectFill(image.size, in: side)
      let draw = fitted.applying(CGAffineTransform(scaleX: scale, y: scale))
        .offsetBy(dx: (side - draw.width) / 2 + offset.width, dy: (side - draw.height) / 2 + offset.height)
      image.draw(in: draw)
    }
    return output.jpegData(compressionQuality: 0.86)
  }

  private func aspectFill(_ size: CGSize, in side: CGFloat) -> CGRect {
    let ratio = max(side / size.width, side / size.height)
    let width = size.width * ratio
    let height = size.height * ratio
    return CGRect(x: 0, y: 0, width: width, height: height)
  }
}
