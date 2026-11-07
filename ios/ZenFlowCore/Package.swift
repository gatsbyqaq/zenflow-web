// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "ZenFlowCore",
  platforms: [
    .iOS(.v17),
    .macOS(.v13)
  ],
  products: [
    .library(name: "ZenFlowCore", targets: ["ZenFlowCore"])
  ],
  targets: [
    .target(name: "ZenFlowCore"),
    .testTarget(name: "ZenFlowCoreTests", dependencies: ["ZenFlowCore"])
  ]
)
