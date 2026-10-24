import SwiftUI
import UIKit

enum AppLanguage: String, Equatable, Hashable {
  case zh, en

  static let storageKey = "zenflow_lang"

  static var stored: AppLanguage {
    if let raw = UserDefaults.standard.string(forKey: storageKey), let value = AppLanguage(rawValue: raw) {
      return value
    }
    let preferred = Locale.preferredLanguages.first ?? "zh"
    return preferred.hasPrefix("zh") ? .zh : .en
  }

  func t(_ zh: String, _ en: String) -> String { self == .en ? en : zh }

  var title: String { t("中文", "English") }
}

enum ThemeChoice: String, Equatable, Hashable {
  case system, light, dark

  func label(_ lang: AppLanguage) -> String {
    switch self {
    case .system: return lang.t("跟随系统", "System")
    case .light: return lang.t("浅色", "Light")
    case .dark: return lang.t("深色", "Dark")
    }
  }

  var colorScheme: ColorScheme? {
    switch self {
    case .system: return nil
    case .light: return .light
    case .dark: return .dark
    }
  }
}

enum ZFColor {
  static let bg = adaptive(0xFFFFFF, 0x000000)
  static let card = adaptive(0xF5F5F7, 0x1C1C1E)
  /// 降低透明度时替换玻璃的实色。深色用系统 tertiary 表面，避免和透光玻璃混成同一块灰。
  static let opaqueGlass = adaptive(0xF5F5F7, 0x2C2C2E)
  static let text = adaptive(0x000000, 0xFFFFFF)
  static let muted = adaptive(0x6E6E73, 0x8E8E93)
  /// 玻璃上的次级文字。浅色用系统 secondaryLabel 的底色（不带 60% 透明），保证压在粉色折射上仍 ≥ 4.5:1。
  static let glassSecondary = adaptive(0x3C3C43, 0xEBEBF5)
  static let line = adaptive(0xE5E5EA, 0x2C2C2E)
  static let field = adaptive(0xFFFFFF, 0x2C2C2E)
  static let primary = text
  static let warm = adaptive(0xED4956, 0xFF453A)
  static let mint = adaptive(0x1C9C6C, 0x3DD68C)
  static let amber = adaptive(0xE0A100, 0xF5C451)
  static let inkButton = text
  static let inkButtonText = bg
  static let grayButton = adaptive(0xE5E5EA, 0x2C2C2E)

  static func type(_ id: String, dark: Bool) -> Color {
    switch id {
    case "masturbation": return Color(rgb: dark ? 0xFF453A : 0xFF2D2D)
    case "porn": return Color(rgb: dark ? 0xE8894A : 0xC45C26)
    case "sex": return Color(rgb: dark ? 0xFF7EB3 : 0xD62976)
    case "fantasy": return Color(rgb: dark ? 0xFFC56B : 0xD4880F)
    case "dream": return Color(rgb: dark ? 0xC4B5FD : 0x7C5CBF)
    default: return warm
    }
  }

  /// 只用于圆环、已解锁徽章、「我现在很想」。
  static let ins = LinearGradient(
    colors: [Color(rgb: 0x833AB4), Color(rgb: 0xE1306C), Color(rgb: 0xF77737)],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
  )

  private static func adaptive(_ light: UInt, _ dark: UInt) -> Color {
    Color(uiColor: UIColor { trait in
      UIColor(rgb: trait.userInterfaceStyle == .dark ? dark : light)
    })
  }
}

extension Color {
  init(rgb: UInt) {
    self.init(
      red: Double((rgb >> 16) & 0xFF) / 255,
      green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255
    )
  }
}

extension UIColor {
  convenience init(rgb: UInt) {
    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1
    )
  }
}

struct Wordmark: View {
  var size: CGFloat = 13
  var body: some View {
    Text("ZENFLOW")
      .font(.system(size: size, weight: .heavy))
      .tracking(size * 0.12)
      .foregroundStyle(ZFColor.text)
  }
}

struct PetalLogo: View {
  var size: CGFloat = 28
  var body: some View {
    Canvas { context, canvas in
      let scale = canvas.width / 512
      var circle = Path(ellipseIn: CGRect(origin: .zero, size: canvas))
      context.fill(circle, with: .color(Color(rgb: 0x111111)))
      let cx = 256 * scale
      let cy = 256 * scale
      for degrees in stride(from: 0, to: 360, by: 60) {
        let rect = CGRect(x: (256 - 46) * scale, y: (176 - 92) * scale, width: 92 * scale, height: 184 * scale)
        var petal = Path(ellipseIn: rect)
        let radians = CGFloat(degrees) * .pi / 180
        let transform = CGAffineTransform(translationX: -cx, y: -cy)
          .concatenating(CGAffineTransform(rotationAngle: radians))
          .concatenating(CGAffineTransform(translationX: cx, y: cy))
        petal = petal.applying(transform)
        context.fill(petal, with: .color(.white))
      }
      let core = CGRect(x: (256 - 60) * scale, y: (256 - 60) * scale, width: 120 * scale, height: 120 * scale)
      context.fill(Path(ellipseIn: core), with: .color(.white))
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .accessibilityHidden(true)
  }
}

struct ZFCard<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      content
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(ZFColor.card)
    .overlay(RoundedRectangle(cornerRadius: 12).stroke(ZFColor.line, lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: 12))
  }
}

struct PrimaryButton: View {
  var title: String
  var systemImage: String? = nil
  var disabled: Bool = false
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let systemImage { Image(systemName: systemImage) }
        Text(title)
      }
      .font(.system(size: 16, weight: .semibold))
      .frame(maxWidth: .infinity)
      .frame(minHeight: 52)
      .foregroundStyle(ZFColor.inkButtonText)
      .background(ZFColor.inkButton.opacity(disabled ? 0.3 : 1))
      .clipShape(RoundedRectangle(cornerRadius: 12))
    }
    .disabled(disabled)
  }
}

struct GrayButton: View {
  var title: String
  var systemImage: String? = nil
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let systemImage { Image(systemName: systemImage) }
        Text(title)
      }
      .font(.system(size: 16, weight: .semibold))
      .frame(maxWidth: .infinity)
      .frame(minHeight: 52)
      .foregroundStyle(ZFColor.text)
      .background(ZFColor.grayButton)
      .clipShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.plain)
  }
}

struct GhostButton: View {
  var title: String
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 16, weight: .semibold))
        .frame(maxWidth: .infinity)
        .frame(minHeight: 52)
        .foregroundStyle(ZFColor.text)
        .background(ZFColor.grayButton)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.plain)
  }
}

struct UrgeButton: View {
  var title: String
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 17, weight: .bold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 52)
        .background(ZFColor.ins)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
    .buttonStyle(.plain)
  }
}

struct FieldLabel: View {
  var text: String
  var body: some View {
    Text(text)
      .font(.system(size: 13, weight: .semibold))
      .foregroundStyle(ZFColor.text)
  }
}

struct ZFField: View {
  var title: String
  var text: Binding<String>
  var prompt: String = ""
  var secure: Bool = false
  var keyboard: UIKeyboardType = .default
  var autocap: TextInputAutocapitalization = .never

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      FieldLabel(text: title)
      Group {
        if secure {
          SecureField(prompt, text: text)
        } else {
          TextField(prompt, text: text)
            .keyboardType(keyboard)
            .textInputAutocapitalization(autocap)
            .autocorrectionDisabled()
        }
      }
      .font(.system(size: 16))
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(ZFColor.field)
      .overlay(RoundedRectangle(cornerRadius: 8).stroke(ZFColor.line, lineWidth: 1))
      .clipShape(RoundedRectangle(cornerRadius: 8))
    }
  }
}
