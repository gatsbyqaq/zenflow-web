import SwiftUI

extension View {
  /// iOS 26 用系统 regular 玻璃。更低版本用系统材质。降低透明度交给系统，不另铺实色。
  @ViewBuilder
  func zfGlass<S: Shape>(in shape: S) -> some View {
    if #available(iOS 26, *) {
      self.glassEffect(.regular, in: shape)
    } else {
      self.background(.regularMaterial, in: shape)
    }
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
}
