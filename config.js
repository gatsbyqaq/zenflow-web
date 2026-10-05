/* ZenFlow 云端配置（可选）
 * ------------------------------------------------------------------
 * 留空 = 纯本机模式（和以前完全一样，不加载任何云端代码）。
 * 要启用「登录 + 邀请码注册 + 云同步」，在 Supabase 控制台 → Project Settings → API 中复制：
 *   - Project URL                       → supabaseUrl
 *   - anon public key（或 Publishable key）→ supabaseAnonKey
 * 这两个值本来就是给浏览器用的公开值（数据安全由数据库的行级安全策略保证），可以提交到仓库。
 * ⚠️ 绝对不要填 service_role / sb_secret_ 开头的密钥 —— 它可以绕过所有安全策略。（填了也会被拒绝使用）
 * 详细步骤见 supabase/README.md
 */
window.ZENFLOW_CONFIG = {
  supabaseUrl: '',      // 例如 'https://abcdefghijklmnop.supabase.co'
  supabaseAnonKey: ''   // 例如 'eyJhbGciOiJIUzI1NiIs...' 或 'sb_publishable_...'
};
