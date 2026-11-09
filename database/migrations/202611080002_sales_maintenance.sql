-- Keep sales as an auditable ledger: customers can be corrected and sales can
-- be voided, but the original sale and its consecutive number are preserved.
alter table public.sales
  add column status text not null default 'completed'
    check (status in ('completed', 'voided')),
  add column voided_at timestamptz,
  add column voided_by text,
  add column void_reason text,
  add column customer_updated_at timestamptz,
  add column customer_updated_by text;

revoke update on public.sales from authenticated;

create or replace function public.update_sale_customer(p_sale_id uuid, p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text := auth.user_id();
  v_business_id uuid;
begin
  if v_user_id is null or not public.is_installation_user_approved() then
    raise exception 'Tu cuenta no está autorizada para editar ventas.';
  end if;

  select s.business_id into v_business_id
  from public.sales s
  join public.businesses b on b.id = s.business_id
  where s.id = p_sale_id and b.owner_user_id = v_user_id and s.status = 'completed';
  if v_business_id is null then raise exception 'No se encontró una venta activa de tu negocio.'; end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.business_id = v_business_id
  ) then raise exception 'El cliente seleccionado no pertenece a tu negocio.'; end if;

  update public.sales
  set customer_id = p_customer_id, customer_updated_at = now(), customer_updated_by = v_user_id
  where id = p_sale_id;
end;
$$;

create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text := auth.user_id();
  v_reason text := left(trim(coalesce(p_reason, '')), 300);
begin
  if v_user_id is null or not public.is_installation_user_approved() then
    raise exception 'Tu cuenta no está autorizada para anular ventas.';
  end if;
  if char_length(v_reason) < 3 then raise exception 'Escribe un motivo de al menos 3 caracteres.'; end if;

  update public.sales s
  set status = 'voided', voided_at = now(), voided_by = v_user_id, void_reason = v_reason
  from public.businesses b
  where s.id = p_sale_id and s.business_id = b.id and b.owner_user_id = v_user_id and s.status = 'completed';
  if not found then raise exception 'No se encontró una venta activa de tu negocio.'; end if;
end;
$$;

revoke all on function public.update_sale_customer(uuid, uuid) from public;
revoke all on function public.void_sale(uuid, text) from public;
grant execute on function public.update_sale_customer(uuid, uuid) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
