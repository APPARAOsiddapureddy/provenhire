create or replace function public.email_login_status(email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_exists boolean;
  v_is_active boolean;
  v_has_password boolean;
begin
  select exists(
    select 1 from auth.users u where lower(u.email) = lower(email)
  ) into v_exists;

  select
    (u.banned_until is null or u.banned_until < now()),
    (u.encrypted_password is not null)
  into v_is_active, v_has_password
  from auth.users u
  where lower(u.email) = lower(email)
  limit 1;

  return jsonb_build_object(
    'exists', v_exists,
    'is_active', coalesce(v_is_active, true),
    'has_password', coalesce(v_has_password, false)
  );
end;
$$;

grant execute on function public.email_login_status(text) to anon, authenticated;
