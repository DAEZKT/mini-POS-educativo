-- Distinguish rejected access requests from users who previously had access.
alter table public.installation_access
  drop constraint if exists installation_access_status_check;

alter table public.installation_access
  add constraint installation_access_status_check
  check (status in ('pending', 'approved', 'revoked', 'rejected'));

create or replace function public.admin_reject_installation_user(p_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_installation_admin() then raise exception 'Solo un superadministrador puede rechazar solicitudes.'; end if;
  if (select s.access_mode from public.installation_settings s where s.singleton) <> 'saas' then
    raise exception 'Las solicitudes solo se pueden revisar en modo SaaS educativo.';
  end if;
  update public.installation_access
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.user_id()
  where user_id = p_user_id and status = 'pending' and role <> 'admin';
  if not found then raise exception 'No se encontró una solicitud pendiente para esa cuenta.'; end if;
end;
$$;

create or replace function public.admin_reconsider_installation_user(p_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_installation_admin() then raise exception 'Solo un superadministrador puede reconsiderar solicitudes.'; end if;
  if (select s.access_mode from public.installation_settings s where s.singleton) <> 'saas' then
    raise exception 'Las solicitudes solo se pueden revisar en modo SaaS educativo.';
  end if;
  update public.installation_access
  set status = 'pending', reviewed_at = now(), reviewed_by = auth.user_id()
  where user_id = p_user_id and status = 'rejected' and role <> 'admin';
  if not found then raise exception 'No se encontró una solicitud rechazada para esa cuenta.'; end if;
end;
$$;

revoke all on function public.admin_reject_installation_user(text) from public;
revoke all on function public.admin_reconsider_installation_user(text) from public;
grant execute on function public.admin_reject_installation_user(text) to authenticated;
grant execute on function public.admin_reconsider_installation_user(text) to authenticated;
