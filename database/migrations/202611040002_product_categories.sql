create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create unique index categories_business_name_unique
  on public.categories (business_id, lower(btrim(name)));

alter table public.products
  add column category_id uuid references public.categories(id) on delete set null;

create index products_category_idx on public.products (category_id);

alter table public.categories enable row level security;
revoke all on public.categories from anonymous;
grant select, insert, update, delete on public.categories to authenticated;

create policy "Owners can read their categories" on public.categories
  for select to authenticated using (exists (
    select 1 from public.businesses b
    where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  ));
create policy "Owners can add their categories" on public.categories
  for insert to authenticated with check (exists (
    select 1 from public.businesses b
    where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  ));
create policy "Owners can update their categories" on public.categories
  for update to authenticated using (exists (
    select 1 from public.businesses b
    where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  )) with check (exists (
    select 1 from public.businesses b
    where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  ));
create policy "Owners can delete their categories" on public.categories
  for delete to authenticated using (exists (
    select 1 from public.businesses b
    where b.id = categories.business_id and b.owner_user_id = (select auth.user_id())
  ));

drop policy "Owners can add their products" on public.products;
create policy "Owners can add their products" on public.products
  for insert to authenticated with check (
    exists (
      select 1 from public.businesses b
      where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
    ) and (
      products.category_id is null or exists (
        select 1 from public.categories c
        where c.id = products.category_id and c.business_id = products.business_id
      )
    )
  );

drop policy "Owners can update their products" on public.products;
create policy "Owners can update their products" on public.products
  for update to authenticated using (exists (
    select 1 from public.businesses b
    where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
  )) with check (
    exists (
      select 1 from public.businesses b
      where b.id = products.business_id and b.owner_user_id = (select auth.user_id())
    ) and (
      products.category_id is null or exists (
        select 1 from public.categories c
        where c.id = products.category_id and c.business_id = products.business_id
      )
    )
  );

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
        'id', p.id, 'business_id', p.business_id, 'category_id', p.category_id,
        'category_name', c.name, 'name', p.name,
        'description', p.description, 'image_url', p.image_url,
        'regular_price', p.regular_price,
        'is_active', p.is_active, 'promotion_enabled', p.promotion_enabled,
        'promotional_price', p.promotional_price, 'created_at', p.created_at
      ) order by c.name nulls last, p.name)
      from public.products p
      left join public.categories c on c.id = p.category_id
      where p.business_id = b.id and p.is_active = true
    ), '[]'::jsonb)
  )
  from public.businesses b
  where b.public_slug = p_slug
  limit 1;
$$;

revoke all on function public.get_public_catalog(text) from public;
grant execute on function public.get_public_catalog(text) to anonymous, authenticated;
