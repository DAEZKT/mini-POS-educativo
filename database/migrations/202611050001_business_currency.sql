alter table public.businesses
  add column currency_code text not null default 'NIO'
  check (currency_code ~ '^[A-Z]{3}$');

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
      'secondary_color', b.secondary_color, 'currency_code', b.currency_code,
      'address', b.address, 'phone', b.phone, 'public_slug', b.public_slug
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
