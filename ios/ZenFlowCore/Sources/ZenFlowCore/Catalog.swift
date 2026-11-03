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
    public var zh: String
    public var en: String
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
    .init(symbol: "drop", zh: "冷水洗脸", en: "Wash your face with cold water"),
    .init(symbol: "figure.strengthtraining.traditional", zh: "做 20 个俯卧撑", en: "Do 20 push-ups"),
    .init(symbol: "figure.mixed.cardio", zh: "做 30 个开合跳", en: "Do 30 jumping jacks"),
    .init(symbol: "figure.walk", zh: "出门走 10 分钟", en: "Walk outside for 10 minutes"),
    .init(symbol: "cup.and.saucer", zh: "喝一杯水", en: "Drink a glass of water"),
    .init(symbol: "message", zh: "给朋友发条消息", en: "Send a friend a message"),
    .init(symbol: "book", zh: "读 5 页书", en: "Read 5 pages"),
    .init(symbol: "sparkles", zh: "整理 5 分钟", en: "Tidy for 5 minutes"),
    .init(symbol: "headphones", zh: "听一首歌", en: "Listen to one song"),
    .init(symbol: "pencil", zh: "写下现在的感受", en: "Write down how you feel"),
    .init(symbol: "figure.flexibility", zh: "伸展 2 分钟", en: "Stretch for 2 minutes"),
    .init(symbol: "iphone", zh: "把手机放到别处", en: "Put the phone somewhere else"),
    .init(symbol: "eye", zh: "看远处 1 分钟", en: "Look far away for 1 minute"),
    .init(symbol: "shower", zh: "去洗澡", en: "Take a shower"),
    .init(symbol: "apple.logo", zh: "吃点东西", en: "Eat something"),
    .init(symbol: "person.2", zh: "去有人的地方", en: "Go where there are people"),
    .init(symbol: "checklist", zh: "做完一件小事", en: "Finish one small task"),
    .init(symbol: "figure.strengthtraining.functional", zh: "做 20 个深蹲", en: "Do 20 squats")
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
