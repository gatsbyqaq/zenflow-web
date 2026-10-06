import Foundation
import Supabase

struct RemoteProfile: Equatable {
  var displayName: String? = nil
  var handle: String? = nil
  var avatarURL: String? = nil
  var isAdmin: Bool = false
  var createdAt: String? = nil
  var inviteOK: Bool = false
}

enum CloudClientError: Error {
  case message(String)
}

final class CloudClient {
  let client: SupabaseClient

  init() {
    client = SupabaseClient(supabaseURL: AppConfig.supabaseURL, supabaseKey: AppConfig.supabaseAnonKey)
  }

  func currentSession() async throws -> Session {
    try await client.auth.session
  }

  func signIn(email: String, password: String, captchaToken: String) async throws -> Session {
    try await client.auth.signIn(email: email, password: password, captchaToken: captchaToken)
  }

  func signUp(email: String, password: String, name: String, handle: String, invite: String, captchaToken: String) async throws -> AuthResponse {
    var data: [String: AnyJSON] = [
      "invite_code": .string(invite),
      "handle": .string(handle),
      "display_name": name.isEmpty ? .null : .string(name)
    ]
    return try await client.auth.signUp(
      email: email,
      password: password,
      data: data,
      redirectTo: AppConfig.webURL,
      captchaToken: captchaToken
    )
  }

  func resetPassword(email: String, captchaToken: String) async throws {
    try await client.auth.resetPasswordForEmail(email, redirectTo: AppConfig.webURL, captchaToken: captchaToken)
  }

  func signOut() async throws {
    try await client.auth.signOut()
  }

  func fetchProfile(userID: UUID) async throws -> RemoteProfile {
    let rows: [AnyJSON] = try await client
      .from("profiles")
      .select("display_name,handle,avatar_url,is_admin,created_at,invite_ok")
      .eq("id", value: userID.uuidString)
      .limit(1)
      .execute()
      .value
    return rows.first.flatMap(Self.profile) ?? RemoteProfile()
  }

  func handleAvailable(_ handle: String) async throws -> Bool {
    struct Params: Encodable { let p_handle: String }
    let value: Bool = try await client.rpc("is_handle_available", params: Params(p_handle: handle)).execute().value
    return value
  }

  func inviteValid(_ code: String) async throws -> Bool {
    struct Params: Encodable { let p_code: String }
    let value: Bool = try await client.rpc("validate_invite", params: Params(p_code: code)).execute().value
    return value
  }

  func completeInvite(code: String, name: String, handle: String) async throws -> RemoteProfile {
    struct Params: Encodable {
      let p_code: String
      let p_display_name: AnyJSON
      let p_handle: AnyJSON
    }
    let params = Params(
      p_code: code,
      p_display_name: name.isEmpty ? .null : .string(name),
      p_handle: handle.isEmpty ? .null : .string(handle)
    )
    let value: AnyJSON = try await client.rpc("complete_invite_registration", params: params).execute().value
    return Self.profile(value) ?? RemoteProfile(displayName: name.isEmpty ? nil : name, handle: handle.isEmpty ? nil : handle, inviteOK: true)
  }

  func updateProfile(name: AnyJSON, handle: AnyJSON, avatar: AnyJSON) async throws -> RemoteProfile? {
    struct Params: Encodable {
      let p_display_name: AnyJSON
      let p_handle: AnyJSON
      let p_avatar_url: AnyJSON
    }
    let value: AnyJSON = try await client.rpc(
      "update_my_profile",
      params: Params(p_display_name: name, p_handle: handle, p_avatar_url: avatar)
    ).execute().value
    return Self.profile(value)
  }

  func clearDisplayName(userID: UUID) async throws -> RemoteProfile? {
    struct Body: Encodable {
      func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Key.self)
        try c.encodeNil(forKey: .displayName)
      }
      enum Key: String, CodingKey { case displayName = "display_name" }
    }
    let rows: [AnyJSON] = try await client
      .from("profiles")
      .update(Body())
      .eq("id", value: userID.uuidString)
      .select("display_name,handle,avatar_url,is_admin,created_at,invite_ok")
      .execute()
      .value
    return rows.first.flatMap(Self.profile)
  }

  func fetchRemoteState(userID: UUID) async throws -> AppState? {
    struct Row: Decodable { let data: AnyJSON? }
    let rows: [Row] = try await client
      .from("user_data")
      .select("data,updated_at")
      .eq("user_id", value: userID.uuidString)
      .limit(1)
      .execute()
      .value
    guard let data = rows.first?.data else { return nil }
    return try AppState.sanitize(JSONBridge.value(data))
  }

  func pushState(userID: UUID, state: AppState) async throws {
    struct Body: Encodable {
      let user_id: String
      let data: AnyJSON
    }
    let builder = try client
      .from("user_data")
      .upsert(
        Body(user_id: userID.uuidString, data: JSONBridge.any(state.jsonValue())),
        onConflict: "user_id",
        returning: .minimal
      )
    try await executeLoose(builder)
  }

  func uploadAvatar(userID: UUID, data: Data) async throws -> String {
    let path = "\(userID.uuidString)/avatar-\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
    _ = try await client.storage.from("avatars").upload(
      path,
      data: data,
      options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: false)
    )
    return try client.storage.from("avatars").getPublicURL(path: path).absoluteString
  }

  func removeAvatar(url: String, userID: UUID) async {
    guard let path = Self.avatarPath(url: url, userID: userID) else { return }
    _ = try? await client.storage.from("avatars").remove(paths: [path])
  }

  func removeAllAvatars(userID: UUID) async {
    let uid = userID.uuidString
    var names: [String] = []
    var offset = 0
    while offset < 1000 {
      let options = SearchOptions(limit: 100, offset: offset, sortBy: nil)
      guard let batch = try? await client.storage.from("avatars").list(path: uid, options: options) else { break }
      for file in batch where file.id != nil {
        names.append(uid + "/" + file.name)
      }
      if batch.count < 100 { break }
      offset += batch.count
    }
    if !names.isEmpty {
      _ = try? await client.storage.from("avatars").remove(paths: names)
    }
  }

  func deleteAccount() async throws {
    try await executeLoose(try client.rpc("delete_my_account"))
  }

  static func describe(_ error: Error) -> String {
    if let error = error as? AuthError {
      return AuthCopy.message(text: error.message, code: error.errorCode.rawValue)
    }
    if let error = error as? PostgrestError {
      let text = [error.message, error.detail, error.hint].compactMap { $0 }.joined(separator: " ")
      return AuthCopy.message(text: text, code: error.code ?? "")
    }
    if let error = error as? StorageError {
      return AuthCopy.message(text: error.message, code: error.statusCode ?? "")
    }
    if let error = error as? CloudClientError, case let .message(text) = error {
      return text
    }
    return AuthCopy.message(text: error.localizedDescription)
  }

  private func executeLoose(_ builder: PostgrestFilterBuilder) async throws {
    _ = try await builder.execute()
  }

  private static func profile(_ value: AnyJSON) -> RemoteProfile? {
    let object: [String: AnyJSON]?
    switch value {
    case let .object(o): object = o
    case let .array(rows): object = rows.first?.objectValue
    default: object = nil
    }
    guard let object else { return nil }
    return RemoteProfile(
      displayName: object["display_name"]?.stringValue,
      handle: object["handle"]?.stringValue,
      avatarURL: object["avatar_url"]?.stringValue,
      isAdmin: object["is_admin"]?.boolValue ?? false,
      createdAt: object["created_at"]?.stringValue,
      inviteOK: object["invite_ok"]?.boolValue ?? false
    )
  }

  private static func avatarPath(url: String, userID: UUID) -> String? {
    let marker = "/avatars/"
    guard let range = url.range(of: marker) else { return nil }
    var path = String(url[range.upperBound...]).split(separator: "?").first.map(String.init) ?? ""
    path = path.removingPercentEncoding ?? path
    let prefix = userID.uuidString + "/"
    guard path.hasPrefix(prefix) else { return nil }
    return path
  }
}

enum JSONBridge {
  static func value(_ json: AnyJSON) -> JSONValue {
    switch json {
    case .null: return .null
    case let .bool(b): return .bool(b)
    case let .integer(i): return .number(Double(i))
    case let .double(d): return .number(d)
    case let .string(s): return .string(s)
    case let .array(a): return .array(a.map(value))
    case let .object(o):
      var mapped: [String: JSONValue] = [:]
      for (k, v) in o { mapped[k] = value(v) }
      return .object(mapped)
    }
  }

  static func any(_ json: JSONValue) -> AnyJSON {
    switch json {
    case .null: return .null
    case let .bool(b): return .bool(b)
    case let .number(n):
      if n.rounded() == n, abs(n) < Double(Int.max) { return .integer(Int(n)) }
      return .double(n)
    case let .string(s): return .string(s)
    case let .array(a): return .array(a.map(any))
    case let .object(o):
      var mapped: [String: AnyJSON] = [:]
      for (k, v) in o { mapped[k] = any(v) }
      return .object(mapped)
    }
  }
}
