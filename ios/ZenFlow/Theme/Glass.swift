import SwiftUI

extension View {
  /// iOS 26 用系统 regular 玻璃。降低透明度打开时改成实色面板，这条路径要能在截图里看出来。
  func zfGlass<S: Shape>(in shape: S) -> some View {
    modifier(ZFGlassModifier(shape: shape))
  }

  /// iOS 26 的 sheet 默认就是玻璃。更低版本才补一层材质。
  @ViewBuilder
  func zfSheetGlass() -> some View {
    if #available(iOS 26, *) {
      self
    } else {
      self.presentationBackground(.regularMaterial)
    }
  }

  func zfScrollClearance() -> some View {
    padding(.bottom, 360)
  }

  /// 滚动内容经过状态栏时用系统边缘效果，避免压在时间下面。
  @ViewBuilder
  func zfScrollEdge() -> some View {
    if #available(iOS 26, *) {
      self.scrollEdgeEffectStyle(.soft, for: .top)
    } else {
      self
    }
  }
}

private struct ZFGlassModifier<S: Shape>: ViewModifier {
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  var shape: S

  @ViewBuilder
  func body(content: Content) -> some View {
    if reduceTransparency {
      content.background(ZFColor.opaqueGlass, in: shape)
    } else if #available(iOS 26, *) {
      content.glassEffect(.regular, in: shape)
    } else {
      content.background(.regularMaterial, in: shape)
    }
  }
}
