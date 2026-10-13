# ZENFLOW iOS

和网页版共用同一个 Supabase 项目（`ordgebjytixmbwabpsrj`）。登录后数据按网页同一套 `user_data` 格式合并，两边可以互相看到。

界面是简体中文。外观在设置里选跟随系统、浅色或深色。未登录只会停在登录页。手机号登录与网页一样关闭。

## 用 Xcode 打开

仓库里已经有 `ZenFlow.xcodeproj`。用 Xcode 16 或更新版本打开：

```bash
cd ios
open ZenFlow.xcodeproj
```

如果工程打不开，再生成一次：

```bash
brew install xcodegen
cd ios
xcodegen
open ZenFlow.xcodeproj
```

直接依赖只有 [supabase-swift 2.46.0](https://github.com/supabase/supabase-swift)（Swift Package Manager）。它还会带上官方包自己的传递依赖。在中国大陆如果 GitHub 拉不下来，给终端或 Xcode 配代理后再 Resolve Packages，或者把仓库下载到本地，把 `project.yml` 里的 `url` 改成那个本地路径后重新 `xcodegen`。

签名团队留空。模拟器不需要选团队。真机需要在 Signing & Capabilities 里选你的 Personal Team，只做这一次。

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

模拟器名字以本机 `xcrun simctl list devices available` 为准。

## 真机（免费 Apple ID）

1. 把 iPhone 用数据线连上 Mac，手机上点信任。
2. 打开工程，目标选这台 iPhone。
3. 选中 ZenFlow target → Signing & Capabilities → Team 选你的 Personal Team。Signing 保持 Automatically manage signing。
4. 按 Run。
5. 手机上打开 设置 → 通用 → VPN 与设备管理，信任你的开发者证书。
6. 免费证书大约 7 天过期，过期后再 Run 一次即可。

## 人机验证

登录、注册、重置密码都要带 Cloudflare Turnstile 的 `captchaToken`，和网页一致，没有关闭验证的开关。

站点密钥 `0x4AAAAAAFPDGNFTL22rfZGZ` 只允许主机名 `gatsbyqaq.github.io`。客户端先用 `WKWebView.loadHTMLString` 加载官方组件，`baseURL` 设为 `https://gatsbyqaq.github.io/`。如果组件回调错误，再打开该域名上的 `privacy.html`，注入同一个组件，用消息通道把 token 交回表单。按钮在拿到 token 之前是灰的。

这套主机名检查没法在当前环境里用真机验证。如果登录一直停在「请完成验证」，多半是验证组件没拿到允许的主机名，或 `challenges.cloudflare.com` 没连上。

忘记密码的邮件会打开现有网页 `https://gatsbyqaq.github.io/zenflow-web/`，在网页里设置新密码后再回到 App 登录。

## 和网页对齐的行为

- 五种行为颜色与重置规则和网页相同。自慰始终重置，不能关。另外四种默认重置，可在设置里关掉。
- 记录行为把心情和破戒放在同一张表单。点日历某一天可以看当天，也可以补记、改历史。
- @ID 为 3–20 位小写字母、数字或下划线，走同一套 RPC。昵称不必唯一。
- 头像裁成圆形后上传到 Storage `avatars/<uid>/`。
- 设置结构和网页 v30 一致：一个「数据」菜单（同步、导出、导入、重置、注销），隐私说明在「关于」里。
- 退出登录会先确认：「退出后会清除这台设备上的数据，云端数据保留。」然后登出并清掉这台设备上的数据，云端保留。
- 注销会先删掉自己的头像文件，再调用 `delete_my_account`。管理员会看到「管理员账号不能注销」。
- 导出的 JSON 带 `app`、`exportedAt`、`profile`、`data`、`settings.theme`，网页可以导入。导入会先确认，然后覆盖当前记录。
- 管理后台这一版不做，管理员继续用网页。

## 本机验证范围

这台开发环境是 Linux，没有 Xcode，也没有 iOS 模拟器。`ZenFlowCore` 里的连续天数、合并、导入和文案已用 Swift 6.0.3 跑过单元测试。SwiftUI、Supabase 调用和 Turnstile 网页组件没有在模拟器或真机上编译、运行过。
