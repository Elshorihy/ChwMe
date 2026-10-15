-- ChwMe: secure WhatsApp verification admin dashboard
-- Run once in Supabase SQL Editor for project fvyzjqrlrfubgpsxnrng.
-- IMPORTANT: replace sheenomatp@gmail.com with the exact email of your admin account.

create schema if not exists private;

create table if not exists private.admin_allowlist (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

revoke all on schema private from public, anon, authenticated;
revoke all on private.admin_allowlist from public, anon, authenticated;

insert into private.admin_allowlist (email)
values (lower('admin-email@example.com'))
on conflict (email) do nothing;

create or replace function public.admin_list_whatsapp_requests()
returns table (
  user_id uuid,
  email text,
  display_name text,
  whatsapp_phone text,
  verification_code text,
  verification_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, auth, private
as $$
begin
  if not exists (
    select 1 from private.admin_allowlist a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) then
    raise exception 'Admin access required';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.raw_user_meta_data ->> 'display_name',
    u.raw_user_meta_data ->> 'whatsapp_phone',
    u.raw_user_meta_data ->> 'whatsapp_verification_code',
    u.raw_user_meta_data ->> 'whatsapp_verification_status',
    u.created_at
  from auth.users u
  where u.raw_user_meta_data ->> 'whatsapp_verification_status' in
    ('pending_manual_review', 'approved', 'rejected')
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_review_whatsapp_request(p_user_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, private
as $$
declare
  target_user auth.users%rowtype;
begin
  if not exists (
    select 1 from private.admin_allowlist a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) then
    raise exception 'Admin access required';
  end if;

  select * into target_user
  from auth.users
  where id = p_user_id
    and raw_user_meta_data ->> 'whatsapp_verification_status' = 'pending_manual_review'
  for update;

  if not found then
    raise exception 'Pending verification request not found';
  end if;

  update auth.users
  set raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{whatsapp_verification_status}',
        to_jsonb(case when p_approve then 'approved' else 'rejected' end),
        true
      ),
      email_confirmed_at = case
        when p_approve then coalesce(email_confirmed_at, now())
        else email_confirmed_at
      end,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('success', true, 'status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

revoke all on function public.admin_list_whatsapp_requests() from public, anon;
revoke all on function public.admin_review_whatsapp_request(uuid, boolean) from public, anon;
grant execute on function public.admin_list_whatsapp_requests() to authenticated;
grant execute on function public.admin_review_whatsapp_request(uuid, boolean) to authenticated;
