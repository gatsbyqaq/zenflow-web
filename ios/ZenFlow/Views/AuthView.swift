import SwiftUI

struct AuthView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.colorScheme) private var scheme
  @State private var mode = "login"
  @State private var email = ""
  @State private var password = ""
  @State private var confirm = ""
  @State private var name = ""
  @State private var handle = ""
  @State private var invite = ""
  @State private var handleState = ""
  @State private var inviteState = ""
  @State private var message = ""
  @State private var messageOK = false
  @State private var busy = false
  @State private var token: String?
  @State private var refreshID = 0
  @State private var forgot = false
  @State private var showPrivacy = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        VStack(spacing: 8) {
          PetalLogo(size: 64)
          Wordmark(size: 18)
          Text(mode == "login" ? "登录" : "注册")
            .font(.system(size: 22, weight: .bold))
          Text("登录后会同步数据。")
            .font(.system(size: 13))
            .foregroundStyle(ZFColor.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 28)

        if !AppConfig.phoneLoginEnabled {
          Picker("邮箱登录或注册", selection: $mode) {
            Text("登录").tag("login")
            Text("注册").tag("register")
          }
          .pickerStyle(.segmented)
          .onChange(of: mode) { _, _ in
            message = ""
            token = nil
            refreshID += 1
          }
        }

        if mode == "register" {
          ZFField(title: "昵称", text: $name, prompt: "可不唯一")
          handleField
          Text("3–20 位小写字母、数字或下划线，全站唯一。")
            .font(.system(size: 12))
            .foregroundStyle(ZFColor.muted)
        }
        ZFField(title: "邮箱", text: $email, prompt: "you@example.com", keyboard: .emailAddress)
        ZFField(title: mode == "register" ? "密码（至少 8 位）" : "密码", text: $password, prompt: "至少 8 位", secure: true)
        if mode == "register" {
          ZFField(title: "确认密码", text: $confirm, secure: true)
          inviteField
        }

        captcha
        if !message.isEmpty {
          Text(message)
            .font(.system(size: 13))
            .foregroundStyle(messageOK ? ZFColor.mint : ZFColor.warm)
        }
        PrimaryButton(title: mode == "login" ? "登录" : "注册", systemImage: mode == "login" ? "rectangle.portrait.and.arrow.right" : "person.badge.plus", disabled: busy || token == nil) {
          Task { await submit() }
        }
        if mode == "login" {
          Button("忘记密码？") { forgot = true }
            .font(.system(size: 14))
            .frame(maxWidth: .infinity)
        } else {
          Text("需要邀请码。")
            .font(.system(size: 12))
            .foregroundStyle(ZFColor.muted)
            .frame(maxWidth: .infinity)
        }
        Button("隐私说明") { showPrivacy = true }
          .font(.system(size: 13))
          .frame(maxWidth: .infinity)
          .padding(.bottom, 24)
      }
      .padding(.horizontal, 22)
    }
    .background(ZFColor.bg)
    .sheet(isPresented: $forgot) {
      ForgotView()
    }
    .sheet(isPresented: $showPrivacy) {
      NavigationStack { PrivacyView() }
    }
    .onChange(of: handle) { _, value in
      Task {
        let text = await model.checkHandle(value)
        handleState = text ?? ""
      }
    }
    .onChange(of: invite) { _, value in
      Task {
        let text = await model.checkInvite(value)
        inviteState = text ?? ""
      }
    }
  }

  private var handleField: some View {
    VStack(alignment: .leading, spacing: 6) {
      FieldLabel(text: "@ID")
      HStack(spacing: 0) {
        Text("@")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(ZFColor.muted)
          .padding(.leading, 12)
        TextField("your_id", text: $handle)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .font(.system(size: 16))
          .padding(.vertical, 10)
          .padding(.horizontal, 6)
        Text(handleState)
          .font(.system(size: 12))
          .foregroundStyle(handleState == "可用" ? ZFColor.mint : ZFColor.muted)
          .padding(.trailing, 10)
      }
      .background(ZFColor.field)
      .overlay(RoundedRectangle(cornerRadius: 8).stroke(ZFColor.line, lineWidth: 1))
      .clipShape(RoundedRectangle(cornerRadius: 8))
    }
  }

  private var inviteField: some View {
    VStack(alignment: .leading, spacing: 6) {
      FieldLabel(text: "邀请码")
      HStack {
        TextField("ZF-XXXX-XXXX", text: $invite)
          .textInputAutocapitalization(.characters)
          .autocorrectionDisabled()
          .font(.system(size: 16))
        Text(inviteState)
          .font(.system(size: 12))
          .foregroundStyle(inviteState == "可用" ? ZFColor.mint : ZFColor.muted)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(ZFColor.field)
      .overlay(RoundedRectangle(cornerRadius: 8).stroke(ZFColor.line, lineWidth: 1))
      .clipShape(RoundedRectangle(cornerRadius: 8))
    }
  }

  private var captcha: some View {
    TurnstileView(refreshID: refreshID) { value in
      token = value
    }
    .frame(maxWidth: .infinity)
    .frame(height: 72)
    .background(ZFColor.field)
    .overlay(RoundedRectangle(cornerRadius: 8).stroke(ZFColor.line, lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .padding(.top, 4)
    .id("\(refreshID)-\(scheme)")
  }

  private func submit() async {
    busy = true
    message = ""
    messageOK = false
    let error: String?
    if mode == "login" {
      error = await model.signIn(email: email, password: password, captchaToken: token)
    } else {
      error = await model.signUp(name: name, handle: handle, email: email, password: password, confirm: confirm, invite: invite, captchaToken: token)
    }
    busy = false
    token = nil
    refreshID += 1
    if let error {
      message = error
      messageOK = error.contains("确认邮件") || error.contains("重置邮件")
    }
  }
}

struct ForgotView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var email = ""
  @State private var token: String?
  @State private var refreshID = 0
  @State private var message = ""
  @State private var busy = false

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 14) {
        Text("重置链接会发到邮箱。打开后在网页里设置新密码。")
          .font(.system(size: 13))
          .foregroundStyle(ZFColor.muted)
        ZFField(title: "邮箱", text: $email, prompt: "you@example.com", keyboard: .emailAddress)
        TurnstileView(refreshID: refreshID) { token = $0 }
          .frame(height: 72)
          .background(ZFColor.field)
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(ZFColor.line, lineWidth: 1))
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .id("\(refreshID)-\(scheme)")
        if !message.isEmpty {
          Text(message).font(.system(size: 13)).foregroundStyle(ZFColor.muted)
        }
        PrimaryButton(title: "发送重置邮件", disabled: busy || token == nil) {
          Task {
            busy = true
            message = await model.sendReset(email: email, captchaToken: token) ?? ""
            busy = false
            token = nil
            refreshID += 1
          }
        }
        Spacer()
      }
      .padding(20)
      .background(ZFColor.bg)
      .navigationTitle("忘记密码")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("关闭") { dismiss() }
        }
      }
    }
  }
}

struct GateView: View {
  var needsInvite: Bool
  @Environment(AppModel.self) private var model
  @State private var name = ""
  @State private var handle = ""
  @State private var invite = ""
  @State private var handleState = ""
  @State private var inviteState = ""
  @State private var message = ""
  @State private var busy = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        VStack(spacing: 8) {
          PetalLogo(size: 56)
          Wordmark(size: 16)
          Text(needsInvite ? "完成注册" : "设置 @ID")
            .font(.system(size: 22, weight: .bold))
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 36)
        Text(needsInvite ? "填写邀请码和 @ID。" : "这个账号还没有 @ID。")
          .font(.system(size: 14))
          .foregroundStyle(ZFColor.muted)
        if needsInvite {
          VStack(alignment: .leading, spacing: 6) {
            FieldLabel(text: "邀请码")
            HStack {
              TextField("ZF-XXXX-XXXX", text: $invite)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
              Text(inviteState).font(.system(size: 12)).foregroundStyle(ZFColor.muted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(ZFColor.field)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(ZFColor.line, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
          }
        }
        ZFField(title: "昵称（可选）", text: $name, prompt: "可不唯一")
        VStack(alignment: .leading, spacing: 6) {
          FieldLabel(text: "@ID")
          HStack(spacing: 0) {
            Text("@").padding(.leading, 12).foregroundStyle(ZFColor.muted)
            TextField("your_id", text: $handle)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .padding(.vertical, 10)
            Text(handleState).font(.system(size: 12)).foregroundStyle(ZFColor.muted).padding(.trailing, 10)
          }
          .background(ZFColor.field)
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(ZFColor.line, lineWidth: 1))
          .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        Text("3–20 位小写字母、数字或下划线，全站唯一。")
          .font(.system(size: 12))
          .foregroundStyle(ZFColor.muted)
        if !message.isEmpty {
          Text(message).font(.system(size: 13)).foregroundStyle(ZFColor.warm)
        }
        PrimaryButton(title: needsInvite ? "完成注册" : "保存", disabled: busy) {
          Task {
            busy = true
            message = await model.completeGate(name: name, handle: handle, invite: invite, needsInvite: needsInvite) ?? ""
            busy = false
          }
        }
        Button("换一个账号") { Task { await model.logout() } }
          .font(.system(size: 14))
          .foregroundStyle(ZFColor.muted)
          .frame(maxWidth: .infinity)
      }
      .padding(22)
    }
    .background(ZFColor.bg)
    .onChange(of: handle) { _, value in
      Task { handleState = await model.checkHandle(value) ?? "" }
    }
    .onChange(of: invite) { _, value in
      Task { inviteState = await model.checkInvite(value) ?? "" }
    }
  }
}
