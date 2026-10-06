import SwiftUI
import UIKit

enum ThemeChoice: String, Equatable, Hashable {
  case system, light, dark

  var label: String {
    switch self {
    case .system: return "跟随系统"
    case .light: return "浅色"
    case .dark: return "深色"
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
  static let bg = adaptive(0xFAFAFA, 0x000000)
  static let card = adaptive(0xFFFFFF, 0x121212)
  static let text = adaptive(0x262626, 0xF5F5F5)
  static let muted = adaptive(0x737373, 0xA8A8A8)
  static let line = adaptive(0xDBDBDB, 0x262626)
  static let field = adaptive(0xEFEFEF, 0x1C1C1C)
  static let primary = Color(rgb: 0x0095F6)
  static let warm = adaptive(0xED4956, 0xFF6B7A)
  static let mint = adaptive(0x1C9C6C, 0x3DD68C)
  static let amber = adaptive(0xE0A100, 0xF5C451)
  static let inkButton = adaptive(0x262626, 0xF5F5F5)
  static let inkButtonText = adaptive(0xFFFFFF, 0x000000)

  static func type(_ id: String, dark: Bool) -> Color {
    switch id {
    case "masturbation": return Color(rgb: dark ? 0xFF8A7A : 0xE24B4B)
    case "porn": return Color(rgb: dark ? 0x4CB5FF : 0x0095F6)
    case "sex": return Color(rgb: dark ? 0xFF7EB3 : 0xD62976)
    case "fantasy": return Color(rgb: dark ? 0xFFC56B : 0xD4880F)
    case "dream": return Color(rgb: dark ? 0xC4B5FD : 0x7C5CBF)
    default: return warm
    }
  }

  static let story = LinearGradient(
    colors: [
      Color(rgb: 0xFEDA75),
      Color(rgb: 0xFA7E1E),
      Color(rgb: 0xD62976),
      Color(rgb: 0x962FBF),
      Color(rgb: 0x4F5BD5)
    ],
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
      .font(.system(size: 15, weight: .semibold))
      .frame(maxWidth: .infinity)
      .padding(.vertical, 12)
      .foregroundStyle(.white)
      .background(ZFColor.primary.opacity(disabled ? 0.45 : 1))
      .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    .disabled(disabled)
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
