-- SECURITY DEFINER sale/order-management RPCs bypass table RLS, so they must
-- enforce approval explicitly too.
create or replace function public.create_sale(p_items jsonb, p_customer_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text := auth.user_id();
  v_business_id uuid;
  v_sale_id uuid;
  v_sale_total numeric(14,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric(14,2);
begin
  if v_user_id is null or not public.is_installation_user_approved() then
    raise exception 'Tu cuenta no está autorizada para registrar ventas.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto a la venta.';
  end if;
  select b.id into v_business_id from public.businesses b where b.owner_user_id = v_user_id;
  if v_business_id is null then raise exception 'No se encontró el negocio de esta cuenta.'; end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.business_id = v_business_id
  ) then raise exception 'El cliente seleccionado no pertenece a tu negocio.'; end if;

  insert into public.sales (business_id, total_amount, customer_id)
  values (v_business_id, 0, p_customer_id) returning id into v_sale_id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Las cantidades deben ser unidades enteras mayores que cero.';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    select p.* into v_product from public.products p
    where p.id = (v_item->>'product_id')::uuid and p.business_id = v_business_id and p.is_active = true for share;
    if not found then raise exception 'Un producto de la venta no está activo o no pertenece a tu negocio.'; end if;
    v_unit_price := case when v_product.promotion_enabled then v_product.promotional_price else v_product.regular_price end;
    v_line_total := round(v_unit_price * v_quantity, 2);
    insert into public.sale_items (sale_id, product_id, product_name, quantity, regular_unit_price, unit_price, promotion_applied, line_total)
    values (v_sale_id, v_product.id, v_product.name, v_quantity, v_product.regular_price, v_unit_price, v_product.promotion_enabled, v_line_total);
    v_sale_total := v_sale_total + v_line_total;
  end loop;
  update public.sales set total_amount = v_sale_total where id = v_sale_id;
  return v_sale_id;
end;
$$;

create or replace function public.complete_public_order(p_order_id uuid, p_update_customer boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.public_orders%rowtype;
begin
  if auth.user_id() is null or not public.is_installation_user_approved() then
    raise exception 'Tu cuenta no está autorizada para administrar pedidos.';
  end if;
  select o.* into v_order
  from public.public_orders o join public.businesses b on b.id = o.business_id
  where o.id = p_order_id and b.owner_user_id = auth.user_id()
  for update of o;
  if not found then raise exception 'No se encontró el pedido o no tienes permiso para completarlo.'; end if;
  if v_order.status = 'completed' then return; end if;
  if v_order.status not in ('pending', 'confirmed') then raise exception 'Solo puedes completar pedidos pendientes o confirmados.'; end if;
  if coalesce(p_update_customer, false) then
    update public.customers set name = v_order.customer_name, phone = v_order.customer_phone,
      address = v_order.customer_address, location_url = v_order.customer_location_url, updated_at = now()
    where id = v_order.customer_id and business_id = v_order.business_id;
  end if;
  update public.public_orders set status = 'completed', updated_at = now() where id = v_order.id;
end;
$$;

revoke all on function public.complete_public_order(uuid, boolean) from public, anonymous;
grant execute on function public.complete_public_order(uuid, boolean) to authenticated;

-- Do not promote the current first business owner automatically. The installer
-- must explicitly bootstrap an administrator with a database-owner SQL action.
