# 手机号登录与人机验证

这些开关在 Supabase 控制台，密钥不能放进网页。项目：`ordgebjytixmbwabpsrj`。

## 1. 关闭 Google

Authentication → Providers → Google → 关闭并保存。

登录页已经没有 Google 按钮，也不再走 OAuth。

## 2. 打开手机号短信

Authentication → Providers → Phone → Enable。

选一个 Supabase 支持的短信通道，填该通道要求的密钥后保存：

- Twilio
- Twilio Verify
- Vonage
- MessageBird
- Textlocal

国内短信（例如阿里云）用 Send SMS Hook，把钩子指到你自己的发送接口。Hook 的密钥同样只放在 Supabase，不要写进 `config.js`。

未配置短信时，获取验证码会提示「短信服务未配置」。

## 3. 打开 Captcha

Authentication → Attack Protection → Captcha（有的项目写在 Bot and Abuse Protection）→ Enable CAPTCHA protection。

- Provider 选 Cloudflare Turnstile（要换 hCaptcha 也可以，须和下面的 `CAPTCHA_PROVIDER` 一致）
- 只把 **Secret key** 填在这里

## 4. 站点密钥写在 config.js

`config.js` 里已有这两项。Secret 不要写进来。

```javascript
CAPTCHA_PROVIDER: 'turnstile', // 或 'hcaptcha'
CAPTCHA_SITE_KEY: ''           // Turnstile / hCaptcha 的 Site key
```

`CAPTCHA_SITE_KEY` 为空时，登录页不加载验证组件，请求里也不带 `captchaToken`。填上之后才会在登录页加载对应脚本（Turnstile 用 `challenges.cloudflare.com`，hCaptcha 用 `js.hcaptcha.com`）。

Turnstile 的域名白名单加上：

- `gatsbyqaq.github.io`
- 本地调试用的主机名（例如 `localhost`）

Captcha 一旦在 Supabase 打开，登录、注册、发验证码、重置密码都要带上 token。

## 5. 登录方式

- 默认是手机号。国家区号默认 +86，可改其他区号，提交前规范成 E.164。
- 已有账号：手机号 + 短信验证码。
- 新用户：先填昵称、@ID、邀请码，再获取验证码。这些字段放在 `signInWithOtp` 的 `options.data` 里。
- 邮箱密码仍在「邮箱」一页，同样会带 captchaToken。
