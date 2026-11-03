// 校验邀请码。Turnstile 通过后用 service role 调 validate_invite。
// 未部署或未配置密钥时不要对生产放开 anon 的 validate_invite。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const fail = () =>
    new Response(JSON.stringify({ ok: false, message: '邀请码无效或已过期' }), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body.code || '');
    const token = String(body.token || '');
    const secret = Deno.env.get('TURNSTILE_SECRET_KEY') || '';
    if (!secret || !token) return fail();
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const ts = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const verdict = await ts.json().catch(() => ({ success: false }));
    if (!verdict.success) return fail();
    const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const { data, error } = await sb.rpc('validate_invite', { p_code: code });
    if (error || data !== true) return fail();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'content-type': 'application/json' },
    });
  } catch (_e) {
    return fail();
  }
});
