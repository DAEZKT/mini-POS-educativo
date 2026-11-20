-- Allow explicit deletion only for records that have never been referenced by
-- a sale. The exact name confirmation is checked again inside each RPC.
create or replace function public.delete_product(p_product_id uuid, p_confirmation_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text := auth.user_id();
  v_business_id uuid;
  v_name text;
begin
  if v_user_id is null or not public.is_installation_user_approved() then
    raise exception 'Tu cuenta no está autorizada para eliminar productos.';
  end if;

  select p.business_id, p.name into v_business_id, v_name
  from public.products p
  join public.businesses b on b.id = p.business_id
  where p.id = p_product_id and b.owner_user_id = v_user_id
  for update of p;
  if v_business_id is null then raise exception 'No se encontró el producto de tu negocio.'; end if;
  if p_confirmation_name is distinct from v_name then
    raise exception 'El nombre escrito no coincide exactamente con el producto.';
  end if;
  if exists (select 1 from public.sale_items si where si.product_id = p_product_id) then
    raise exception 'No se puede eliminar: el producto aparece en una venta.';
  end if;
  if exists (select 1 from public.public_order_items oi where oi.product_id = p_product_id) then
    raise exception 'No se puede eliminar: el producto aparece en un pedido web.';
  end if;

  delete from public.products where id = p_product_id and business_id = v_business_id;
end;
$$;

create or replace function public.delete_customer(p_customer_id uuid, p_confirmation_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text := auth.user_id();
  v_business_id uuid;
  v_name text;
begin
  if v_user_id is null or not public.is_installation_user_approved() then
    raise exception 'Tu cuenta no está autorizada para eliminar clientes.';
  end if;

  select c.business_id, c.name into v_business_id, v_name
  from public.customers c
  join public.businesses b on b.id = c.business_id
  where c.id = p_customer_id and b.owner_user_id = v_user_id
  for update of c;
  if v_business_id is null then raise exception 'No se encontró el cliente de tu negocio.'; end if;
  if p_confirmation_name is distinct from v_name then
    raise exception 'El nombre escrito no coincide exactamente con el cliente.';
  end if;
  if exists (select 1 from public.sales s where s.customer_id = p_customer_id) then
    raise exception 'No se puede eliminar: el cliente aparece en una venta.';
  end if;
  if exists (select 1 from public.public_orders o where o.customer_id = p_customer_id) then
    raise exception 'No se puede eliminar: el cliente está vinculado a un pedido web.';
  end if;

  delete from public.customers where id = p_customer_id and business_id = v_business_id;
end;
$$;

revoke all on function public.delete_product(uuid, text) from public;
revoke all on function public.delete_customer(uuid, text) from public;
grant execute on function public.delete_product(uuid, text) to authenticated;
grant execute on function public.delete_customer(uuid, text) to authenticated;
