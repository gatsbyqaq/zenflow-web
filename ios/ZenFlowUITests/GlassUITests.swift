import XCTest

final class GlassUITests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testScrollLight() { scroll(.light, "light-tab-min") }
  func testScrollDark() { scroll(.dark, "dark-tab-min") }
  func testSettingsLight() { openSettings(.light) }
  func testSettingsDark() { openSettings(.dark) }
  func testSheetLight() { openSheet(.light) }
  func testSheetDark() { openSheet(.dark) }
  func testTimeoutLight() { playTimeout(.light) }
  func testTimeoutDark() { playTimeout(.dark) }

  private func scroll(_ appearance: XCUIDevice.Appearance, _ shot: String) {
    let app = launch(appearance, tab: "0")
    XCTAssertTrue(text(app, "打卡", "Check-in").waitForExistence(timeout: 12))
    markReady()
    Thread.sleep(forTimeInterval: 1.4)
    let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
    let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22))
    start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
    Thread.sleep(forTimeInterval: 0.6)
    start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
    Thread.sleep(forTimeInterval: 1.2)
    save(shot)
  }

  private func openSettings(_ appearance: XCUIDevice.Appearance) {
    let app = launch(appearance, tab: "3")
    let row = text(app, "目标天数", "Goal")
    XCTAssertTrue(row.waitForExistence(timeout: 12))
    markReady()
    Thread.sleep(forTimeInterval: 1.2)
    row.tap()
    Thread.sleep(forTimeInterval: 1.4)
    let back = app.navigationBars.buttons.element(boundBy: 0)
    XCTAssertTrue(back.waitForExistence(timeout: 4))
    back.tap()
    Thread.sleep(forTimeInterval: 1.2)
  }

  private func openSheet(_ appearance: XCUIDevice.Appearance) {
    let app = launch(appearance, tab: "3")
    let row = text(app, "开始时间", "Start")
    XCTAssertTrue(row.waitForExistence(timeout: 12))
    markReady()
    Thread.sleep(forTimeInterval: 1.2)
    row.tap()
    let cancel = app.buttons["取消"]
    let cancelEn = app.buttons["Cancel"]
    let button = cancel.waitForExistence(timeout: 4) ? cancel : cancelEn
    XCTAssertTrue(button.waitForExistence(timeout: 4))
    Thread.sleep(forTimeInterval: 1.2)
    button.tap()
    Thread.sleep(forTimeInterval: 1.2)
  }

  private func playTimeout(_ appearance: XCUIDevice.Appearance) {
    XCUIDevice.shared.appearance = appearance
    let app = XCUIApplication()
    app.launchArguments = ["-ZenFlowPreviewLocal", "-ZenFlowPreviewTimeoutPlay"]
    app.launch()
    let signing = app.staticTexts["正在登录"]
    let signingEn = app.staticTexts["Signing in"]
    let seen = signing.waitForExistence(timeout: 8) || signingEn.waitForExistence(timeout: 2)
    if !seen { print(app.debugDescription) }
    XCTAssertTrue(seen)
    markReady()
    let retry = app.buttons["重试"]
    let retryEn = app.buttons["Retry"]
    let retryButton = retry.waitForExistence(timeout: 8) ? retry : retryEn
    XCTAssertTrue(waitHittable(retryButton, timeout: 8))
    retryButton.tap()
    let connecting = app.staticTexts["正在连接"]
    let connectingEn = app.staticTexts["Connecting"]
    let spinning = connecting.waitForExistence(timeout: 4) || connectingEn.waitForExistence(timeout: 2)
    if !spinning { print(app.debugDescription) }
    XCTAssertTrue(spinning)
    let again = retry.waitForExistence(timeout: 6) ? retry : retryEn
    XCTAssertTrue(waitHittable(again, timeout: 8))
    Thread.sleep(forTimeInterval: 1.0)
  }

  private func waitHittable(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
    let end = Date().addingTimeInterval(timeout)
    while Date() < end {
      if element.exists && element.isHittable { return true }
      Thread.sleep(forTimeInterval: 0.1)
    }
    return element.exists && element.isHittable
  }

  private func launch(_ appearance: XCUIDevice.Appearance, tab: String) -> XCUIApplication {
    XCUIDevice.shared.appearance = appearance
    let app = XCUIApplication()
    app.launchArguments = ["-ZenFlowPreviewLocal", "-ZenFlowPreviewTab", tab]
    app.launch()
    return app
  }

  private func text(_ app: XCUIApplication, _ zh: String, _ en: String) -> XCUIElement {
    let zhEl = app.staticTexts[zh]
    if zhEl.waitForExistence(timeout: 12) { return zhEl }
    return app.staticTexts[en]
  }

  private func markReady() {
    FileManager.default.createFile(atPath: "/tmp/zenflow-ready", contents: Data())
  }

  private func save(_ name: String) {
    let dir = URL(fileURLWithPath: "/tmp/zenflow-shots", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try? XCUIScreen.main.screenshot().pngRepresentation.write(to: dir.appendingPathComponent(name + ".png"))
  }
}
