create extension if not exists pgcrypto;
create extension if not exists pg_session_jwt;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null unique,
  name text not null default 'Mi negocio' check (char_length(name) between 1 and 80),
  primary_color text not null default '#6d5ce8' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#ece9ff' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  address text check (address is null or char_length(address) <= 180),
  phone text check (phone is null or char_length(phone) <= 30),
  public_slug text not null unique check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 300),
  regular_price numeric(12,2) not null check (regular_price > 0),
  is_active boolean not null default true,
  promotion_enabled boolean not null default false,
  promotional_price numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_promotion_price_valid check (
    (promotion_enabled = false and (promotional_price is null or (promotional_price > 0 and promotional_price < regular_price)))
    or (promotion_enabled = true and promotional_price is not null and promotional_price > 0 and promotional_price < regular_price)
  )
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_number bigint generated always as identity,
  sold_at timestamptz not null default now(),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now(),
  unique (business_id, sale_number)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  regular_unit_price numeric(12,2) not null check (regular_unit_price > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  promotion_applied boolean not null default false,
  line_total numeric(14,2) not null check (line_total > 0),
  created_at timestamptz not null default now()
);

create index products_business_active_idx on public.products (business_id, is_active, name);
create index sales_business_sold_at_idx on public.sales (business_id, sold_at desc);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

revoke all on public.businesses, public.products, public.sales, public.sale_items from anonymous;
grant select, insert, update on public.businesses, public.products to authenticated;
grant select on public.sales, public.sale_items to authenticated;

create policy "Owners can read their business" on public.businesses
  for select to authenticated using (owner_user_id = (select auth.user_id()));
create policy "Owners can create their business" on public.businesses
  for insert to authenticated with check (owner_user_id = (select auth.user_id()));
create policy "Owners can update their business" on public.businesses
  for update to authenticated using (owner_user_id = (select auth.user_id())) with check (owner_user_id = (select auth.user_id()));

create policy "Owners can read their products" on public.products
  for select to authenticated using (exists (
    select 1 from public.businesses b where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
  ));
create policy "Owners can add their products" on public.products
  for insert to authenticated with check (exists (
    select 1 from public.businesses b where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
  ));
create policy "Owners can update their products" on public.products
  for update to authenticated using (exists (
    select 1 from public.businesses b where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
  )) with check (exists (
    select 1 from public.businesses b where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
  ));

create policy "Owners can read their sales" on public.sales
  for select to authenticated using (exists (
    select 1 from public.businesses b where b.id = sales.business_id and b.owner_user_id = (select auth.user_id())
  ));
create policy "Owners can read their sale items" on public.sale_items
  for select to authenticated using (exists (
    select 1 from public.sales s join public.businesses b on b.id = s.business_id
    where s.id = sale_items.sale_id and b.owner_user_id = (select auth.user_id())
  ));

create or replace function public.get_public_catalog(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'id', b.id, 'name', b.name, 'primary_color', b.primary_color,
      'secondary_color', b.secondary_color, 'address', b.address,
      'phone', b.phone, 'public_slug', b.public_slug
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'business_id', p.business_id, 'name', p.name,
        'description', p.description, 'regular_price', p.regular_price,
        'is_active', p.is_active, 'promotion_enabled', p.promotion_enabled,
        'promotional_price', p.promotional_price, 'created_at', p.created_at
      ) order by p.name)
      from public.products p where p.business_id = b.id and p.is_active = true
    ), '[]'::jsonb)
  )
  from public.businesses b
  where b.public_slug = p_slug
  limit 1;
$$;

create or replace function public.create_sale(p_items jsonb)
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

  insert into public.sales (business_id, total_amount) values (v_business_id, 0) returning id into v_sale_id;

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

revoke all on function public.get_public_catalog(text) from public;
grant execute on function public.get_public_catalog(text) to anonymous, authenticated;
revoke all on function public.create_sale(jsonb) from public;
grant execute on function public.create_sale(jsonb) to authenticated;
