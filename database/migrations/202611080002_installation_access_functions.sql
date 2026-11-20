create or replace function public.is_installation_user_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.installation_access a
    where a.user_id = auth.user_id() and a.status = 'approved'
      and (
        (select s.access_mode from public.installation_settings s where s.singleton) = 'saas'
        or a.role = 'admin'
      )
  );
$$;

create or replace function public.is_installation_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.installation_access a
    where a.user_id = auth.user_id() and a.status = 'approved' and a.role = 'admin'
  );
$$;

create or replace function public.get_installation_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('access_mode', s.access_mode, 'initialized', s.initialized)
  from public.installation_settings s where s.singleton;
$$;

create or replace function public.request_installation_access()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text := auth.user_id();
  v_mode text;
  v_email text;
begin
  if v_user_id is null then raise exception 'Debes iniciar sesión para solicitar acceso.'; end if;
  select s.access_mode into v_mode from public.installation_settings s where s.singleton;
  if v_mode <> 'saas' then raise exception 'Esta instalación no acepta nuevas solicitudes de negocio.'; end if;
  select u.email into v_email from neon_auth."user" u where u.id::text = v_user_id;
  if v_email is null then raise exception 'No se pudo verificar la cuenta en Neon Auth.'; end if;

  insert into public.installation_access (user_id, email, status)
  values (v_user_id, left(v_email, 254), 'pending')
  on conflict (user_id) do nothing;

  return (select a.status from public.installation_access a where a.user_id = v_user_id);
end;
$$;

create or replace function public.get_my_installation_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('status', a.status, 'role', a.role)
  from public.installation_access a where a.user_id = auth.user_id();
$$;

create or replace function public.admin_approve_installation_user(p_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_installation_admin() then raise exception 'Solo un superadministrador puede aprobar cuentas.'; end if;
  if (select s.access_mode from public.installation_settings s where s.singleton) <> 'saas' then
    raise exception 'Cambia el modo de acceso a SaaS antes de aprobar otros negocios.';
  end if;
  update public.installation_access
  set status = 'approved', role = 'owner', reviewed_at = now(), reviewed_by = auth.user_id()
  where user_id = p_user_id and status = 'pending';
  if not found then raise exception 'No se encontró una solicitud pendiente para esa cuenta.'; end if;
end;
$$;

create or replace function public.admin_revoke_installation_user(p_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_installation_admin() then raise exception 'Solo un superadministrador puede revocar cuentas.'; end if;
  if p_user_id = auth.user_id() then raise exception 'No puedes revocar tu propia cuenta de administrador.'; end if;
  update public.installation_access
  set status = 'revoked', reviewed_at = now(), reviewed_by = auth.user_id()
  where user_id = p_user_id and role <> 'admin';
  if not found then raise exception 'No se encontró una cuenta de negocio para revocar.'; end if;
end;
$$;

create or replace function public.admin_set_installation_mode(p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_installation_admin() then raise exception 'Solo un superadministrador puede cambiar el modo.'; end if;
  if p_mode not in ('personal', 'saas') then raise exception 'El modo debe ser personal o saas.'; end if;
  update public.installation_settings set access_mode = p_mode, updated_at = now() where singleton;
end;
$$;

revoke all on function public.is_installation_user_approved() from public;
revoke all on function public.is_installation_admin() from public;
revoke all on function public.get_installation_config() from public;
revoke all on function public.request_installation_access() from public;
revoke all on function public.get_my_installation_access() from public;
revoke all on function public.admin_approve_installation_user(text) from public;
revoke all on function public.admin_revoke_installation_user(text) from public;
revoke all on function public.admin_set_installation_mode(text) from public;
grant execute on function public.is_installation_user_approved() to authenticated;
grant execute on function public.is_installation_admin() to authenticated;
grant execute on function public.get_installation_config() to anonymous, authenticated;
grant execute on function public.request_installation_access() to authenticated;
grant execute on function public.get_my_installation_access() to authenticated;
grant execute on function public.admin_approve_installation_user(text) to authenticated;
grant execute on function public.admin_revoke_installation_user(text) to authenticated;
grant execute on function public.admin_set_installation_mode(text) to authenticated;
