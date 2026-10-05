-- 生成首批邀请码（在 SQL Editor 中运行；结果表格里的 code 就是邀请码）
-- 参数：数量、有效天数（0 = 永不过期）、备注
select code, expires_at from public.create_invites(5, 0, '首批（管理员）');

-- 注册第一个账号后，把自己设为管理员（之后可在网页 设置 → 账号 中直接生成邀请码）：
-- update public.profiles set is_admin = true
--  where id = (select id from auth.users where email = 'you@example.com');

-- 查看所有邀请码及使用情况：
-- select i.code, i.note, i.expires_at, i.used_at, u.email as used_by_email
--   from public.invites i left join auth.users u on u.id = i.used_by order by i.created_at desc;

-- 作废一个未使用的邀请码：
-- delete from public.invites where code = 'ZF-XXXX-XXXX' and used_by is null;
