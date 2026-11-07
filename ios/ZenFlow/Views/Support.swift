import SwiftUI

enum ZFFormat {
  static func greeting(at date: Date = Date()) -> String {
    let hour = Calendar.current.component(.hour, from: date)
    if hour < 5 { return "夜深了" }
    if hour < 11 { return "早上好" }
    if hour < 14 { return "中午好" }
    if hour < 18 { return "下午好" }
    if hour < 23 { return "晚上好" }
    return "夜深了"
  }

  static func greetingSymbol(at date: Date = Date()) -> String {
    let hour = Calendar.current.component(.hour, from: date)
    if hour < 5 { return "moon.stars" }
    if hour < 11 { return "sunrise" }
    if hour < 14 { return "sun.max" }
    if hour < 18 { return "cloud.sun" }
    if hour < 23 { return "sunset" }
    return "moon"
  }

  static func dayTitle(_ key: String) -> String {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return key }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = .current
    guard let date = cal.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return key }
    let week = "日一二三四五六"
    let index = cal.component(.weekday, from: date) - 1
    let name = week[week.index(week.startIndex, offsetBy: index)]
    let year = cal.component(.year, from: date) == cal.component(.year, from: Date()) ? "" : "\(parts[0])年"
    return "\(year)\(parts[1])月\(parts[2])日 星期\(name)"
  }

  static func todayLine(_ date: Date = Date()) -> String {
    let cal = Calendar.current
    let week = "日一二三四五六"
    let index = cal.component(.weekday, from: date) - 1
    let name = week[week.index(week.startIndex, offsetBy: index)]
    return "\(cal.component(.month, from: date))月\(cal.component(.day, from: date))日 星期\(name)"
  }

  static func combine(day: String, time: Date) -> Date {
    let parts = day.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return time }
    let clock = Calendar.current.dateComponents([.hour, .minute], from: time)
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = .current
    return cal.date(from: DateComponents(
      year: parts[0], month: parts[1], day: parts[2],
      hour: clock.hour, minute: clock.minute
    )) ?? time
  }

  static func hm(_ ms: Double) -> String {
    let date = Date(timeIntervalSince1970: ms / 1000)
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "HH:mm"
    return f.string(from: date)
  }

  static func hms(from ms: Double) -> (String, String, String) {
    let total = max(0, Int(ms / 1000))
    let h = total / 3600
    let m = (total % 3600) / 60
    let s = total % 60
    return (String(format: "%02d", h), String(format: "%02d", m), String(format: "%02d", s))
  }
}

struct ToastBanner: View {
  var text: String
  var body: some View {
    Text(text)
      .font(.system(size: 14, weight: .medium))
      .foregroundStyle(.white)
      .padding(.horizontal, 14)
      .padding(.vertical, 10)
      .background(Color.black.opacity(0.82))
      .clipShape(Capsule())
      .padding(.bottom, 24)
  }
}

struct ShareSheet: UIViewControllerRepresentable {
  var items: [Any]
  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: items, applicationActivities: nil)
  }
  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct TagButton: View {
  var title: String
  var selected: Bool
  var tint: Color = ZFColor.text
  var action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 14, weight: .medium))
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .foregroundStyle(selected ? Color.white : ZFColor.text)
        .background(selected ? tint : ZFColor.field)
        .overlay(Capsule().stroke(selected ? tint : ZFColor.line, lineWidth: 1))
        .clipShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}

struct FlowTags<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    FlowLayout(spacing: 8) { content }
  }
}

struct FlowLayout: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? 320
    var x: CGFloat = 0
    var y: CGFloat = 0
    var row: CGFloat = 0
    for view in subviews {
      let size = view.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        x = 0
        y += row + spacing
        row = 0
      }
      row = max(row, size.height)
      x += size.width + spacing
    }
    return CGSize(width: width, height: y + row)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var x = bounds.minX
    var y = bounds.minY
    var row: CGFloat = 0
    for view in subviews {
      let size = view.sizeThatFits(.unspecified)
      if x > bounds.minX, x + size.width > bounds.maxX {
        x = bounds.minX
        y += row + spacing
        row = 0
      }
      view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
      row = max(row, size.height)
      x += size.width + spacing
    }
  }
}
