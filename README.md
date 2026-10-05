# ZenFlow · 戒色 · 自律 · 平静

一个温和、基于科学的自律小助手（第一版原型），采用 iOS 26「液态玻璃（Liquid Glass）」风格界面，支持深色模式。纯静态网页：HTML + CSS + 原生 JS，无构建步骤、无后端、无外部依赖。

**在线体验：** https://gatsbyqaq.github.io/zenflow-web/
（手机浏览器打开后，可"添加到主屏幕"像 App 一样使用，支持离线；在电脑上打开则是多栏桌面布局。）

## 功能

- **打卡计时**：实时显示坚持的天/时/分/秒；可调整开始时间；最佳纪录；1/3/7/14/30/60/90 天里程碑徽章 + 进度环；每日心情打卡（每天一次）+ 打卡日历。
- **急救 SOS**：冲浪式应对（Urge Surfing）流程 —— 引导呼吸动画（箱式 4-4-4-4 或 4-7-8，约 60–80 秒）→ 随机行动建议 → 激励语录 → 提醒你自己写下的坚持理由 →「我挺过来了」记录一次成功抵御。
- **记录与复盘**：记录破戒（时间、触发因素标签、备注），重新开始计时（保留历史和最佳纪录）；历史时间线。
- **统计**：抵御冲动次数、破戒次数、最长连续、抵御率、常见触发因素、时段分布、心情分布、个性化建议（纯 CSS/SVG 图表）。
- **设置**：外观（跟随系统 / 浅色 / 深色）、编辑坚持理由、导出/导入 JSON 备份、重置所有数据。
- **账号与云同步（可选）**：邮箱 + 密码登录；**邀请码注册**（每个邀请码只能使用一次）；登录后自动把打卡 / 记录 / 理由同步到你自己的 Supabase 项目。不配置 / 不登录时所有功能仍可用，数据只保存在本机。接入步骤见 [`supabase/README.md`](supabase/README.md)。

## 界面风格

- 液态玻璃：半透明毛玻璃卡片（`backdrop-filter: blur() saturate()`）、高光描边、柔和景深阴影
- 纯色背景：浅色 `#f0f2f7`、深色 `#0c111d`，与 `theme-color` 和页面边缘完全一致，让 iOS Safari 的状态栏/工具栏颜色与页面融为一体
- 悬浮胶囊式 Tab 栏 + 跟随切换的玻璃指示器；发光玻璃球 SOS 按钮；按压弹性缩放动画
- 外观可选「跟随系统 / 浅色 / 深色」（保存在本机，备份文件中包含该设置）；首帧前应用，无闪烁；适配刘海/安全区域；"添加到主屏幕"后全屏显示
- 响应式桌面版（窗口宽度 ≥ 1024px）：底部 Tab 栏变为左侧玻璃侧边栏（品牌、导航、醒目的 SOS 按钮、外观快捷切换、"仅本机"提示）；内容最宽约 1280px 居中，首页左侧为大号计时器 + SOS 入口（视口足够高时随滚动吸附），右侧为打卡 / 日历 / 徽章；记录、统计、设置、急救页均为多栏布局。同一套 HTML/JS，窄屏仍是原来的手机布局
- 键盘友好：`1`–`4` 切换打卡 / 记录 / 统计 / 设置，`S` 打开急救，`Esc` 关闭弹窗（在输入框中输入时不触发）；键盘焦点有清晰的焦点环
- 不支持毛玻璃的浏览器自动降级为不透明卡片；尊重"减少动态效果"设置
- 图标：SF Symbols 风格的线性图标（[Lucide](https://lucide.dev)），以内联 SVG sprite 形式嵌在 `index.html` 中，无需联网、支持 `file://`；心情使用带色调的线条表情，界面不使用 emoji

## 图标许可

图标来自 [Lucide](https://lucide.dev)（lucide-static v1.51.0），遵循 ISC 许可；其中源自 Feather 的图标另遵循 MIT 许可。完整许可文本见 [`LICENSE-icons`](LICENSE-icons)。（Apple SF Symbols 的许可不允许用于网页，因此未使用。）

云端客户端（可选）内嵌 [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) UMD 构建，MIT 许可，见 [`vendor/LICENSE-supabase.txt`](vendor/LICENSE-supabase.txt)。

## 隐私

所有数据只保存在你设备浏览器的 `localStorage` 中，不会上传到任何服务器，没有账号、没有统计追踪。清除浏览器数据会删除记录，建议定期导出备份。

## 本地使用

直接双击 `index.html` 即可（支持 `file://`）。Service Worker 与 manifest 仅在 http(s) 下启用。

## 截图

### 桌面端（1280×800）

| 打卡（浅色） | 打卡（深色） |
|---|---|
| ![](screenshots/desktop-21-home-light.png) | ![](screenshots/desktop-22-home-dark.png) |

| 急救 | 统计 |
|---|---|
| ![](screenshots/desktop-23-sos-light.png) | ![](screenshots/desktop-24-stats-light.png) |

| 急救 · 转移注意力（深色） | 统计（深色） |
|---|---|
| ![](screenshots/desktop-23c-sos-actions-dark.png) | ![](screenshots/desktop-24b-stats-dark.png) |

| 记录 | 设置 |
|---|---|
| ![](screenshots/desktop-25-log-light.png) | ![](screenshots/desktop-26-settings-light.png) |

### 账号 / 邀请码注册（未连接 Supabase 时显示「本机模式」）

| 登录 | 邀请码注册 | 设置 · 账号与同步 |
|---|---|---|
| ![](screenshots/desktop-30-auth-login.png) | ![](screenshots/desktop-30b-auth-register.png) | ![](screenshots/desktop-32-settings-account.png) |

### 手机端

| 打卡 | 急救 | 统计 | 设置 |
|---|---|---|---|
| ![](screenshots/01-home.png) | ![](screenshots/02c-sos-actions.png) | ![](screenshots/04-stats.png) | ![](screenshots/05-settings.png) |

心情打卡：

![](screenshots/01c-home-moods.png)

深色模式（设置 → 外观 → 深色，或跟随系统）：

| 打卡 | 急救 | 统计 |
|---|---|---|
| ![](screenshots/07-home-dark.png) | ![](screenshots/08-sos-dark.png) | ![](screenshots/09-stats-dark.png) |

> 本应用不能替代专业帮助。如果你感到长期困扰，寻求心理咨询师或医生的支持是勇敢而明智的选择。
