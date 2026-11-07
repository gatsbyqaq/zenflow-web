import CoreFoundation
import Foundation

/// JSON 值。用来和网页 `JSON.parse` / `JSON.stringify` 的形状对齐。
public enum JSONValue: Equatable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  public var object: [String: JSONValue]? {
    if case let .object(o) = self { return o }
    return nil
  }

  public var array: [JSONValue]? {
    if case let .array(a) = self { return a }
    return nil
  }

  public var string: String? {
    if case let .string(s) = self { return s }
    return nil
  }

  public var bool: Bool? {
    if case let .bool(b) = self { return b }
    return nil
  }

  public var number: Double? {
    if case let .number(n) = self { return n }
    return nil
  }

  public static func parse(_ data: Data) throws -> JSONValue {
    let raw = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    return from(raw)
  }

  public func data(pretty: Bool = false) throws -> Data {
    let obj = foundation()
    guard JSONSerialization.isValidJSONObject(obj) else {
      throw ZenFlowError.format("无法编码")
    }
    return try JSONSerialization.data(
      withJSONObject: obj,
      options: pretty ? [.prettyPrinted, .sortedKeys] : [.sortedKeys]
    )
  }

  public static func from(_ raw: Any) -> JSONValue {
    if raw is NSNull { return .null }
    if let b = raw as? Bool, isJSONBool(raw) { return .bool(b) }
    if let n = raw as? NSNumber {
      return .number(n.doubleValue)
    }
    if let s = raw as? String { return .string(s) }
    if let a = raw as? [Any] { return .array(a.map(from)) }
    if let d = raw as? [String: Any] {
      var o: [String: JSONValue] = [:]
      for (k, v) in d { o[k] = from(v) }
      return .object(o)
    }
    return .null
  }

  public func foundation() -> Any {
    switch self {
    case .null: return NSNull()
    case let .bool(b): return b
    case let .number(n):
      if n.isFinite, n.rounded() == n, n <= Double(Int.max), n >= Double(Int.min) {
        return Int(n)
      }
      return n
    case let .string(s): return s
    case let .array(a): return a.map { $0.foundation() }
    case let .object(o):
      var d: [String: Any] = [:]
      for (k, v) in o { d[k] = v.foundation() }
      return d
    }
  }

  /// 与网页 `stable()` 相同：对象键排序，数字按 JS `JSON.stringify` 的样子。
  public func stable() -> String {
    switch self {
    case .null: return "null"
    case let .bool(b): return b ? "true" : "false"
    case let .number(n): return Self.jsNumber(n)
    case let .string(s): return Self.jsString(s)
    case let .array(a): return "[" + a.map { $0.stable() }.joined(separator: ",") + "]"
    case let .object(o):
      let body = o.keys.sorted().map { key in
        Self.jsString(key) + ":" + (o[key]?.stable() ?? "null")
      }.joined(separator: ",")
      return "{" + body + "}"
    }
  }

  static func jsNumber(_ n: Double) -> String {
    if n.isNaN || n.isInfinite { return "null" }
    if n == 0 { return "0" }
    return JSNumber.stringify(n)
  }

  static func jsString(_ s: String) -> String {
    var out = "\""
    for scalar in s.unicodeScalars {
      switch scalar.value {
      case 0x22: out += "\\\""
      case 0x5C: out += "\\\\"
      case 0x08: out += "\\b"
      case 0x0C: out += "\\f"
      case 0x0A: out += "\\n"
      case 0x0D: out += "\\r"
      case 0x09: out += "\\t"
      case 0..<0x20:
        out += String(format: "\\u%04x", scalar.value)
      default:
        out.unicodeScalars.append(scalar)
      }
    }
    out += "\""
    return out
  }

  private static func isJSONBool(_ raw: Any) -> Bool {
    guard let n = raw as? NSNumber else { return false }
    return CFGetTypeID(n) == CFBooleanGetTypeID()
  }
}

/// 复刻 JS `Number.prototype.toString` / `JSON.stringify` 对有限数字的输出。
enum JSNumber {
  static func stringify(_ n: Double) -> String {
    if n.rounded() == n, abs(n) < 1e21 {
      return String(Int64(n))
    }
    let text = String(n)
    if text == "inf" || text == "-inf" || text == "nan" { return "null" }
    return text
  }
}

public enum ZenFlowError: Error, Equatable {
  case format(String)
}

extension ZenFlowError: LocalizedError {
  public var errorDescription: String? {
    switch self {
    case let .format(s): return s
    }
  }
}
