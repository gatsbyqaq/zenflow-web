# ZenFlow · 戒色 · 自律 · 平静

一个温和、基于科学的自律小助手。界面是杂志排版：衬线大标题、细线分隔、暖纸色（深色为近黑），支持深色模式。纯静态网页：HTML + CSS + 原生 JS，无构建步骤。云同步为可选的 Supabase 配置。

**在线体验：** https://gatsbyqaq.github.io/zenflow-web/
（手机浏览器打开后，可"添加到主屏幕"像 App 一样使用，支持离线；在电脑上打开则是多栏桌面布局。）

## 功能

- **打卡计时**：首页大标题显示「连续 N 天」，并实时显示时/分/秒；可调整开始时间；最佳纪录；1/3/7/14/30/60/90 天里程碑徽章 + 细线进度；每日心情打卡（每天一次）+ 打卡日历。
- **急救 SOS**：冲浪式应对（Urge Surfing）流程 —— 引导呼吸动画（箱式 4-4-4-4 或 4-7-8，约 60–80 秒）→ 随机行动建议 → 激励语录 → 提醒你自己写下的坚持理由 →「我挺过来了」记录一次成功抵御。
- **记录与复盘**：记录破戒（时间、触发因素标签、备注），重新开始计时（保留历史和最佳纪录）；历史时间线。
- **统计**：抵御冲动次数、破戒次数、最长连续、抵御率、常见触发因素、时段分布、心情分布、个性化建议（纯 CSS/SVG 图表）。
- **设置**：外观（跟随系统 / 浅色 / 深色）、编辑坚持理由、导出/导入 JSON 备份、重置所有数据。
- **账号与云同步（可选）**：邮箱 + 密码登录；**邀请码注册**（每个邀请码只能使用一次）；登录后自动把打卡 / 记录 / 理由同步到你自己的 Supabase 项目。不配置 / 不登录时所有功能仍可用，数据只保存在本机。接入步骤见 [`supabase/README.md`](supabase/README.md)。管理员可在「设置 → 账号与同步」打开**管理后台**（`#admin`），查看用户 / 邀请码 / 活跃概览。

## 界面风格

- 杂志排版：衬线大标题（首页为「连续 N 天」）、正文列表、发丝分隔线；少图标、少边框卡片、无毛玻璃与重阴影
- 纸色背景：浅色 `#f4f1ea`、深色 `#12110f`，与 `theme-color` 和页面边缘一致，让 iOS Safari 的状态栏/工具栏颜色与页面融为一体
- 导航保持可用但更安静：手机为底部细线字标，桌面为左侧文字侧栏；急救是描边文字按钮，不再用发光玻璃球
- 外观可选「跟随系统 / 浅色 / 深色」（保存在本机，备份文件中包含该设置）；首帧前应用，无闪烁；适配刘海/安全区域；"添加到主屏幕"后全屏显示
- 响应式桌面版（窗口宽度 ≥ 1024px）：底部栏变为左侧侧栏（字标、导航、急救、外观、本机提示）；内容最宽约 1200px，首页左侧为大标题计时 + 急救入口（视口足够高时随滚动吸附），右侧为打卡 / 日历 / 徽章；记录、统计、设置、急救页为多栏。窄屏仍是手机布局
- 键盘友好：`1`–`4` 切换打卡 / 记录 / 统计 / 设置，`S` 打开急救，`Esc` 关闭弹窗（在输入框中输入时不触发）；键盘焦点有清晰的焦点环
- 尊重"减少动态效果"设置；中文标题使用系统衬线（如苹方旁的宋体 / Songti），无需联网字体
- 图标：仍使用内联 [Lucide](https://lucide.dev) 线性图标，但只留在导航、心情、关闭等需要辨认的位置；界面不使用 emoji

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

### 管理后台（管理员）

| 总览 | 用户 | 邀请码 |
|---|---|---|
| ![](screenshots/40-admin-overview-desktop.png) | ![](screenshots/41-admin-users-desktop.png) | ![](screenshots/42-admin-invites-desktop.png) |

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
