import Foundation

public enum Catalog {
  public struct Milestone: Equatable {
    public var days: Int
    public var symbol: String
    public var name: String
  }

  public struct Mood: Equatable {
    public var value: Int
    public var symbol: String
    public var title: String
  }

  public struct LapseType: Equatable, Identifiable {
    public var id: String
    public var label: String
    public var symbol: String
  }

  public struct Action: Equatable {
    public var symbol: String
    public var title: String
  }

  public static let milestones: [Milestone] = [
    .init(days: 1, symbol: "leaf", name: "起步"),
    .init(days: 3, symbol: "leaf.fill", name: "三日"),
    .init(days: 7, symbol: "camera.macro", name: "一周"),
    .init(days: 14, symbol: "tree", name: "两周"),
    .init(days: 30, symbol: "mountain.2", name: "一个月"),
    .init(days: 60, symbol: "mountain.2.fill", name: "两个月"),
    .init(days: 90, symbol: "crown", name: "九十天")
  ]

  public static let moods: [Mood] = [
    .init(value: 5, symbol: "face.smiling", title: "很好"),
    .init(value: 4, symbol: "face.smiling", title: "不错"),
    .init(value: 3, symbol: "face.dashed", title: "一般"),
    .init(value: 2, symbol: "cloud.rain", title: "低落"),
    .init(value: 1, symbol: "exclamationmark.triangle", title: "挣扎")
  ]

  public static let lapseTypes: [LapseType] = [
    .init(id: "masturbation", label: "自慰", symbol: "flame"),
    .init(id: "porn", label: "看黄", symbol: "eye"),
    .init(id: "sex", label: "性行为", symbol: "heart"),
    .init(id: "fantasy", label: "意淫", symbol: "brain.head.profile"),
    .init(id: "dream", label: "梦淫", symbol: "moon")
  ]

  public static let triggers = ["无聊", "压力", "熬夜", "独处", "刷手机", "情绪低落", "其他"]

  public static let actions: [Action] = [
    .init(symbol: "drop", title: "冷水洗脸"),
    .init(symbol: "figure.strengthtraining.traditional", title: "做 20 个俯卧撑"),
    .init(symbol: "figure.mixed.cardio", title: "做 30 个开合跳"),
    .init(symbol: "figure.walk", title: "出门走 10 分钟"),
    .init(symbol: "cup.and.saucer", title: "喝一杯水"),
    .init(symbol: "message", title: "给朋友发条消息"),
    .init(symbol: "book", title: "读 5 页书"),
    .init(symbol: "sparkles", title: "整理 5 分钟"),
    .init(symbol: "headphones", title: "听一首歌"),
    .init(symbol: "pencil", title: "写下现在的感受"),
    .init(symbol: "figure.flexibility", title: "伸展 2 分钟"),
    .init(symbol: "iphone", title: "把手机放到别处"),
    .init(symbol: "eye", title: "看远处 1 分钟"),
    .init(symbol: "shower", title: "去洗澡"),
    .init(symbol: "apple.logo", title: "吃点东西"),
    .init(symbol: "person.2", title: "去有人的地方"),
    .init(symbol: "checklist", title: "做完一件小事"),
    .init(symbol: "figure.strengthtraining.functional", title: "做 20 个深蹲")
  ]

  public static let goalPresets = [7, 14, 30, 60, 90, 180, 365]
  public static let timeBuckets: [(String, Int)] = [
    ("凌晨", 0), ("清晨", 4), ("上午", 8), ("下午", 12), ("傍晚", 16), ("夜间", 20)
  ]

  public static func typeById(_ id: String) -> LapseType? {
    lapseTypes.first { $0.id == id }
  }

  public static func moodByValue(_ value: Int) -> Mood? {
    moods.first { $0.value == value }
  }
}
