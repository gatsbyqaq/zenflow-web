# ZENFLOW iOS

和网页版 v47 共用同一个 Supabase 项目（`ordgebjytixmbwabpsrj`）。登录后数据按网页同一套 `user_data` 格式合并。没有管理后台。

界面可以在设置里切换简体中文和 English。外观可以跟随系统、浅色或深色。最低系统是 iOS 17。

## 用 Xcode 打开

需要 Xcode 16 或更新版本。仓库里已经提交了 `ZenFlow.xcodeproj`，不用先装别的工具：

```bash
cd ios
open ZenFlow.xcodeproj
```

工程打不开时，再用 XcodeGen 生成一次：

```bash
brew install xcodegen
cd ios
xcodegen
open ZenFlow.xcodeproj
```

直接依赖是 [supabase-swift 2.46.0](https://github.com/supabase/supabase-swift)。Xcode 第一次打开会解析 Swift Package。在中国大陆如果 GitHub 拉不下来，给终端或 Xcode 配代理后再选 File → Packages → Resolve Package Versions。

签名团队留空。模拟器不需要选团队。

Bundle ID 占位是 `com.gatsbyqaq.zenflow`。免费 Apple ID 若提示已被占用，改成你自己的，例如 `com.yourname.zenflow`。

## 模拟器

1. 打开 `ios/ZenFlow.xcodeproj`。
2. 顶部设备选一台 iPhone 模拟器（iOS 17 或更高）。
3. 按 Run（⌘R）。

或命令行：

```bash
cd ios
xcodebuild -scheme ZenFlow -destination 'platform=iOS Simulator,name=iPhone 16' -configuration Debug build
```

模拟器名字以本机为准：

```bash
xcrun simctl list devices available
```

把上面命令里的 `iPhone 16` 换成列表里的名字。部署目标是 iOS 17.0。

模拟器里试面容 ID：菜单 Features → Face ID → Enrolled，解锁时再选 Matching Face。没有录入面容时，会退回到模拟器密码。

## 真机（免费 Apple ID）

不需要付费的 Apple Developer Program。证书大约 7 天后过期，过期后用同一根线再 Run 一次即可。

1. Mac 安装 Xcode 16 或更新版本。iPhone 系统为 iOS 17 或更高。
2. 打开 Xcode → Settings → Accounts，点 `+`，用你的 Apple ID 登录。列表里会出现 Personal Team。
3. 在 iPhone 上打开 设置 → 隐私与安全性 → 开发者模式，打开后按提示重启，并再次确认打开。
4. 用数据线把 iPhone 接到 Mac。手机上点「信任」，输入锁屏密码。如果 Mac 询问配件，选允许。
5. 在终端进入仓库后执行 `cd ios && open ZenFlow.xcodeproj`。
6. Xcode 顶部的运行目标选这台 iPhone，不要选模拟器。
7. 左侧点蓝色工程图标，选中 TARGETS 里的 ZenFlow，打开 Signing & Capabilities。
8. 勾选 Automatically manage signing。
9. Team 选你的 Personal Team（名字后面带 Personal Team）。
10. 如果 Xcode 提示 bundle id 不可用，把 Bundle Identifier 从 `com.gatsbyqaq.zenflow` 改成你自己的，例如 `com.yourname.zenflow`。Signing Certificate 交给 Xcode 自动选 Apple Development。
11. 按 Run（⌘R）。第一次编译会下载 Supabase 包，需要能访问 GitHub。
12. 安装完成后，在 iPhone 上打开 设置 → 通用 → VPN 与设备管理，点进你的开发者描述，点信任。
13. 回到主屏幕打开 ZENFLOW。打开应用锁后，系统会用面容 ID；描述文字来自 `Info.plist` 的 `NSFaceIDUsageDescription`。
14. 免费描述文件大约 7 天失效。失效后再用数据线连接，按一次 Run。

## 人机验证

登录、注册、重置密码都要带 Cloudflare Turnstile 的 `captchaToken`，和网页一致。

站点密钥 `0x4AAAAAAFPDGNFTL22rfZGZ` 只允许主机名 `gatsbyqaq.github.io`。客户端用 `WKWebView` 加载官方组件，`baseURL` 设为 `https://gatsbyqaq.github.io/`。按钮在拿到 token 之前是灰的。

忘记密码的邮件会打开 `https://gatsbyqaq.github.io/zenflow-web/`，在网页里设置新密码后再回到 App 登录。

## 和网页 v47 对齐的行为

- 底栏四个标签：打卡、记录、统计、设置。选中是实心图标，未选中是线框。
- 打卡页是天数圆环。Ins 渐变 `#833AB4 → #E1306C → #F77737` 只出现在圆环、已解锁徽章和「我现在很想」。
- 按钮三种：实心（字色底）、灰色、幽灵。界面里不用蓝色。看黄的标记色是浅色 `#405DE6`、深色 `#6D82F0`。
- 五种行为：自慰、看黄、性行为、意淫、梦淫。自慰始终重置天数，另外四种可以在设置里关掉。
- 记录页是月历，点某一天可以查看或补记。
- 「我现在很想」进入呼吸，然后可以选择「撑过去了」或「没撑住」。
- 最长连续和累计坚持天数在破戒后保留。破戒只结束当前这一段。
- 设置是二级菜单：账号、目标、开始时间、重置规则、外观、语言、理由、应用锁、数据、关于。
- 应用锁使用面容 ID。可以选立即锁定、离开 1 分钟或 5 分钟。
- 启动时「正在登录」超过 10 秒，或网络失败，会弹出「连接超时」卡片。左边「本机模式」继续用本机数据，右边「重试」在同一张卡片里转圈。成功后卡片关闭。
- 浅色 / 深色，中文 / English。
- 退出登录会先确认，然后清掉这台设备上的数据，云端保留。注销走 `delete_my_account`。
- 管理后台不做。

## 这台开发环境

编写这次改动的环境是 Linux，没有 Xcode，也没有 iOS 模拟器，所以这里没有跑过 `xcodebuild`。请在 Mac 上按上面的模拟器命令编译。`ZenFlowCore` 的连续天数规则和网页 `streak.js` 对齐，单元测试在 `ios/ZenFlowCore`。
