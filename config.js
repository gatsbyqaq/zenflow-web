/* ZenFlow 云端配置
 * ------------------------------------------------------------------
 * 这两个值是给浏览器用的公开值（anon / publishable），可提交到仓库。
 * 数据安全由数据库行级安全策略保证。绝对不要填 service_role / sb_secret_。
 */
window.ZENFLOW_CONFIG = {
  supabaseUrl: 'https://ordgebjytixmbwabpsrj.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZGdlYmp5dGl4bWJ3YWJwc3JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MjUzMzAsImV4cCI6MjA5NzUwMTMzMH0.zqio9cmilSqSUL6TN4T16ob-gfCSadD2LYke5Qd3-N8',
  /* turnstile 或 hcaptcha。密钥为空时不加载组件，也不提交 captchaToken。Secret 只填在 Supabase，不要写在这里。 */
  CAPTCHA_PROVIDER: 'turnstile',
  CAPTCHA_SITE_KEY: '0x4AAAAAAFPDGNFTL22rfZGZ',
  /* false：登录页只显示邮箱。true：手机号为默认页，邮箱为第二页。手机号代码始终保留。 */
  PHONE_LOGIN_ENABLED: false
};
