create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text not null check (char_length(btrim(phone)) between 7 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table public.public_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_number bigint generated always as identity,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 120),
  customer_phone text not null check (char_length(btrim(customer_phone)) between 7 and 30),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, order_number)
);

create table public.public_order_items (
  id uuid primary key default gen_random_uuid(),
  public_order_id uuid not null references public.public_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  regular_unit_price numeric(12,2) not null check (regular_unit_price > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  promotion_applied boolean not null default false,
  line_total numeric(14,2) not null check (line_total > 0),
  created_at timestamptz not null default now()
);

create index customers_business_name_idx on public.customers (business_id, name);
create index public_orders_business_status_created_idx on public.public_orders (business_id, status, created_at desc);
create index public_order_items_order_idx on public.public_order_items (public_order_id);

alter table public.customers enable row level security;
alter table public.public_orders enable row level security;
alter table public.public_order_items enable row level security;

revoke all on public.customers, public.public_orders, public.public_order_items from anonymous;
grant select on public.customers to authenticated;
grant select on public.public_orders, public.public_order_items to authenticated;
grant update (status, updated_at) on public.public_orders to authenticated;

create policy "Owners can read their customers" on public.customers
  for select to authenticated using (exists (
    select 1 from public.businesses b
    where b.id = customers.business_id and b.owner_user_id = (select auth.user_id())
  ));

create policy "Owners can read their public orders" on public.public_orders
  for select to authenticated using (exists (
    select 1 from public.businesses b
    where b.id = public_orders.business_id and b.owner_user_id = (select auth.user_id())
  ));

create policy "Owners can update their public order status" on public.public_orders
  for update to authenticated using (exists (
    select 1 from public.businesses b
    where b.id = public_orders.business_id and b.owner_user_id = (select auth.user_id())
  )) with check (exists (
    select 1 from public.businesses b
    where b.id = public_orders.business_id and b.owner_user_id = (select auth.user_id())
  ));

create policy "Owners can read their public order items" on public.public_order_items
  for select to authenticated using (exists (
    select 1 from public.public_orders o join public.businesses b on b.id = o.business_id
    where o.id = public_order_items.public_order_id and b.owner_user_id = (select auth.user_id())
  ));

create or replace function public.create_public_order(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses%rowtype;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number bigint;
  v_order_total numeric(14,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric(14,2);
  v_phone text;
begin
  if char_length(btrim(coalesce(p_customer_name, ''))) not between 1 and 120 then
    raise exception 'Escribe tu nombre (máximo 120 caracteres).';
  end if;
  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  if char_length(v_phone) not between 7 and 15 then
    raise exception 'Escribe un número de WhatsApp válido con código de país.';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then
    raise exception 'Las notas no pueden superar 500 caracteres.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Agrega al menos un producto al pedido.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto al pedido.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'El pedido no puede tener más de 50 productos distintos.';
  end if;

  select * into v_business from public.businesses where public_slug = p_slug;
  if not found then raise exception 'No se encontró este catálogo.'; end if;
  if char_length(regexp_replace(coalesce(v_business.phone, ''), '[^0-9]', '', 'g')) < 10 then
    raise exception 'Este negocio todavía no ha configurado su número de WhatsApp.';
  end if;

  insert into public.customers (business_id, name, phone)
  values (v_business.id, btrim(p_customer_name), v_phone)
  on conflict (business_id, phone) do update
    set name = excluded.name, updated_at = now()
  returning id into v_customer_id;

  insert into public.public_orders (
    business_id, customer_id, customer_name, customer_phone, notes, total_amount
  ) values (
    v_business.id, v_customer_id, btrim(p_customer_name), v_phone,
    nullif(btrim(coalesce(p_notes, '')), ''), 0
  ) returning id, order_number into v_order_id, v_order_number;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'Las cantidades deben ser unidades enteras mayores que cero.';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity > 999 then raise exception 'La cantidad por producto no puede superar 999.'; end if;

    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid and business_id = v_business.id and is_active = true
    for share;
    if not found then raise exception 'Un producto del pedido ya no está disponible.'; end if;

    v_unit_price := case when v_product.promotion_enabled then v_product.promotional_price else v_product.regular_price end;
    v_line_total := round(v_unit_price * v_quantity, 2);
    insert into public.public_order_items (
      public_order_id, product_id, product_name, quantity,
      regular_unit_price, unit_price, promotion_applied, line_total
    ) values (
      v_order_id, v_product.id, v_product.name, v_quantity,
      v_product.regular_price, v_unit_price, v_product.promotion_enabled, v_line_total
    );
    v_order_total := v_order_total + v_line_total;
  end loop;

  update public.public_orders set total_amount = v_order_total where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_order_total,
    'business_name', v_business.name,
    'business_phone', v_business.phone,
    'currency_symbol', v_business.currency_symbol,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name, 'quantity', oi.quantity,
        'unit_price', oi.unit_price, 'line_total', oi.line_total
      ) order by oi.created_at)
      from public.public_order_items oi where oi.public_order_id = v_order_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_public_order(text, text, text, text, jsonb) from public;
grant execute on function public.create_public_order(text, text, text, text, jsonb) to anonymous, authenticated;
