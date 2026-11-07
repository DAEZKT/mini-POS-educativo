-- Canonical phone numbers are the deduplication key for each business.
alter table public.customers
  add constraint customers_phone_canonical
  check (phone ~ '^[0-9]{7,15}$');

grant insert on public.customers to authenticated;
grant update (name, phone, address, location_url, updated_at) on public.customers to authenticated;

create policy "Owners can add their customers" on public.customers
  for insert to authenticated with check (exists (
    select 1 from public.businesses b
    where b.id = customers.business_id and b.owner_user_id = (select auth.user_id())
  ));

create policy "Owners can update their customers" on public.customers
  for update to authenticated using (exists (
    select 1 from public.businesses b
    where b.id = customers.business_id and b.owner_user_id = (select auth.user_id())
  )) with check (exists (
    select 1 from public.businesses b
    where b.id = customers.business_id and b.owner_user_id = (select auth.user_id())
  ));
