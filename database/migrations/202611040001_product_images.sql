alter table public.products
  add column image_url text;

alter table public.products
  add constraint products_image_url_valid check (
    image_url is null or (char_length(image_url) <= 2048 and image_url ~ '^https://')
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
        'id', p.id, 'business_id', p.business_id, 'name', p.name,
        'description', p.description, 'image_url', p.image_url,
        'regular_price', p.regular_price,
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

revoke all on function public.get_public_catalog(text) from public;
grant execute on function public.get_public_catalog(text) to anonymous, authenticated;
