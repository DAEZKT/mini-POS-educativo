-- Allow point-of-sale transactions to reference a customer and retain that
-- relationship for public orders already represented in sales.
alter table public.sales
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

update public.sales s
set customer_id = o.customer_id
from public.public_orders o
where s.public_order_id = o.id and s.customer_id is null;

create or replace function public.record_completed_public_order_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select id into v_sale_id from public.sales where public_order_id = new.id;
  if found then return new; end if;

  insert into public.sales (
    business_id, sold_at, total_amount, public_order_id,
    public_order_number, customer_id
  ) values (
    new.business_id, coalesce(new.updated_at, now()), new.total_amount,
    new.id, new.order_number, new.customer_id
  ) returning id into v_sale_id;

  insert into public.sale_items (
    sale_id, product_id, product_name, variant_label, quantity,
    regular_unit_price, unit_price, promotion_applied, line_total
  )
  select v_sale_id, product_id, product_name, variant_label, quantity,
         regular_unit_price, unit_price, promotion_applied, line_total
  from public.public_order_items where public_order_id = new.id;

  return new;
end;
$$;

-- Replace the old RPC so customer validation and sale creation are atomic.
drop function public.create_sale(jsonb);

create function public.create_sale(p_items jsonb, p_customer_id uuid default null)
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
  if v_user_id is null then raise exception 'Debes iniciar sesión para registrar una venta.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Agrega al menos un producto a la venta.';
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un producto a la venta.'; end if;

  select b.id into v_business_id from public.businesses b where b.owner_user_id = v_user_id;
  if v_business_id is null then raise exception 'No se encontró el negocio de esta cuenta.'; end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.business_id = v_business_id
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
      where p.id = (v_item->>'product_id')::uuid and p.business_id = v_business_id and p.is_active = true
      for share;
    if not found then raise exception 'Un producto de la venta no está activo o no pertenece a tu negocio.'; end if;

    v_unit_price := case when v_product.promotion_enabled then v_product.promotional_price else v_product.regular_price end;
    v_line_total := round(v_unit_price * v_quantity, 2);
    insert into public.sale_items (
      sale_id, product_id, product_name, quantity, regular_unit_price,
      unit_price, promotion_applied, line_total
    ) values (
      v_sale_id, v_product.id, v_product.name, v_quantity, v_product.regular_price,
      v_unit_price, v_product.promotion_enabled, v_line_total
    );
    v_sale_total := v_sale_total + v_line_total;
  end loop;

  update public.sales set total_amount = v_sale_total where id = v_sale_id;
  return v_sale_id;
end;
$$;

revoke all on function public.create_sale(jsonb, uuid) from public;
grant execute on function public.create_sale(jsonb, uuid) to authenticated;
