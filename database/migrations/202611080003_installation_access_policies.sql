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

