-- Installation modes and administrator-controlled access to private business data.
create table public.installation_settings (
  singleton boolean primary key default true check (singleton),
  access_mode text not null default 'personal' check (access_mode in ('personal', 'saas')),
  initialized boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.installation_settings (singleton) values (true)
on conflict (singleton) do nothing;

create table public.installation_access (
  user_id text primary key,
  email text not null default '',
  status text not null check (status in ('pending', 'approved', 'revoked')),
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

-- Existing business owners keep access after this migration. Admin status is
-- deliberately assigned separately by the installation owner during bootstrap.
insert into public.installation_access (user_id, status, role, reviewed_at)
select b.owner_user_id, 'approved', 'owner', now()
from public.businesses b
on conflict (user_id) do nothing;

alter table public.installation_settings enable row level security;
alter table public.installation_access enable row level security;

revoke all on public.installation_settings, public.installation_access from public, anonymous, authenticated;
grant select on public.installation_settings to anonymous, authenticated;
grant select on public.installation_access to authenticated;

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

create policy "Users can read their own installation access" on public.installation_access
  for select to authenticated
  using (user_id = (select auth.user_id()) or (select public.is_installation_admin()));

drop policy "Owners can read their business" on public.businesses;
create policy "Approved owners can read their business" on public.businesses
  for select to authenticated
  using ((select public.is_installation_user_approved()) and owner_user_id = (select auth.user_id()));
drop policy "Owners can create their business" on public.businesses;
create policy "Approved owners can create their business" on public.businesses
  for insert to authenticated
  with check ((select public.is_installation_user_approved()) and owner_user_id = (select auth.user_id()));
drop policy "Owners can update their business" on public.businesses;
create policy "Approved owners can update their business" on public.businesses
  for update to authenticated
  using ((select public.is_installation_user_approved()) and owner_user_id = (select auth.user_id()))
  with check ((select public.is_installation_user_approved()) and owner_user_id = (select auth.user_id()));

drop policy "Owners can read their products" on public.products;
create policy "Approved owners can read their products" on public.products
  for select to authenticated using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can add their products" on public.products;
create policy "Approved owners can add their products" on public.products
  for insert to authenticated with check ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can update their products" on public.products;
create policy "Approved owners can update their products" on public.products
  for update to authenticated
  using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
  ))
  with check ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
  ));

drop policy "Owners can read their sales" on public.sales;
create policy "Approved owners can read their sales" on public.sales
  for select to authenticated using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = sales.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can read their sale items" on public.sale_items;
create policy "Approved owners can read their sale items" on public.sale_items
  for select to authenticated using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.sales s join public.businesses b on b.id = s.business_id
    where s.id = sale_items.sale_id and b.owner_user_id = (select auth.user_id())
  ));

drop policy "Owners can read their categories" on public.categories;
create policy "Approved owners can read their categories" on public.categories
  for select to authenticated using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can add their categories" on public.categories;
create policy "Approved owners can add their categories" on public.categories
  for insert to authenticated with check ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can update their categories" on public.categories;
create policy "Approved owners can update their categories" on public.categories
  for update to authenticated
  using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  ))
  with check ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can delete their categories" on public.categories;
create policy "Approved owners can delete their categories" on public.categories
  for delete to authenticated using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  ));

drop policy "Owners can read their customers" on public.customers;
create policy "Approved owners can read their customers" on public.customers
  for select to authenticated using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = customers.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can add their customers" on public.customers;
create policy "Approved owners can add their customers" on public.customers
  for insert to authenticated with check ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = customers.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can update their customers" on public.customers;
create policy "Approved owners can update their customers" on public.customers
  for update to authenticated
  using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = customers.business_id and b.owner_user_id = (select auth.user_id())
  ))
  with check ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = customers.business_id and b.owner_user_id = (select auth.user_id())
  ));

drop policy "Owners can read their public orders" on public.public_orders;
create policy "Approved owners can read their public orders" on public.public_orders
  for select to authenticated using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = public_orders.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can update their public order status" on public.public_orders;
create policy "Approved owners can update their public order status" on public.public_orders
  for update to authenticated
  using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = public_orders.business_id and b.owner_user_id = (select auth.user_id())
  ))
  with check ((select public.is_installation_user_approved()) and exists (
    select 1 from public.businesses b where b.id = public_orders.business_id and b.owner_user_id = (select auth.user_id())
  ));
drop policy "Owners can read their public order items" on public.public_order_items;
create policy "Approved owners can read their public order items" on public.public_order_items
  for select to authenticated using ((select public.is_installation_user_approved()) and exists (
    select 1 from public.public_orders o join public.businesses b on b.id = o.business_id
    where o.id = public_order_items.public_order_id and b.owner_user_id = (select auth.user_id())
  ));

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
