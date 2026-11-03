// 用调用者的 JWT 列出并删除 avatars 桶里 owner 为自己的文件，再调用 delete_my_account。
// 删 storage.objects 行不一定会删掉对象存储里的文件，所以这里走 Storage API。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') || '';
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!auth || !url || !service) {
    return new Response(JSON.stringify({ error: 'NOT_AUTHENTICATED' }), { status: 401, headers: cors });
  }
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'NOT_AUTHENTICATED' }), { status: 401, headers: cors });
  }
  const uid = userData.user.id;
  const admin = createClient(url, service);
  const { data: rows } = await admin.schema('storage').from('objects').select('name').eq('bucket_id', 'avatars').eq('owner', uid);
  const names = (rows || []).map((r: { name: string }) => r.name).filter(Boolean);
  if (names.length) {
    const removed = await admin.storage.from('avatars').remove(names);
    if (removed.error) {
      return new Response(JSON.stringify({ error: 'AVATAR_DELETE', message: removed.error.message }), {
        status: 500,
        headers: { ...cors, 'content-type': 'application/json' },
      });
    }
  }
  const { error } = await userClient.rpc('delete_my_account');
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'content-type': 'application/json' } });
});
