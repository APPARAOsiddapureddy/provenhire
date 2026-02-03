create or replace function public.email_login_status(email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_exists boolean;
begin
  select exists(
    select 1
    from auth.users u
    where lower(u.email) = lower(email)
  ) into v_exists;

  return jsonb_build_object('exists', v_exists);
end;
$$;

grant execute on function public.email_login_status(text) to anon, authenticated;
