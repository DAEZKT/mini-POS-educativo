-- Accept Google Maps URLs that put coordinates in the query string, such as /maps?q=lat,lon.
create or replace function public.create_public_order(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_customer_location_url text,
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
  v_location text := nullif(btrim(coalesce(p_customer_location_url, '')), '');
begin
  if char_length(btrim(coalesce(p_customer_name, ''))) not between 1 and 120 then
    raise exception 'Escribe tu nombre (máximo 120 caracteres).';
  end if;
  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  if char_length(v_phone) not between 7 and 15 then
    raise exception 'Escribe un número de WhatsApp válido con código de país.';
  end if;
  if char_length(btrim(coalesce(p_customer_address, ''))) not between 1 and 300 then
    raise exception 'Escribe una dirección (máximo 300 caracteres).';
  end if;
  if v_location is not null and (char_length(v_location) > 500 or v_location !~* '^https://(www\.)?(google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl)([/?#]|$)') then
    raise exception 'La ubicación debe ser un enlace HTTPS de Google Maps.';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then
    raise exception 'Las notas no pueden superar 500 caracteres.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Agrega entre 1 y 50 productos distintos al pedido.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Agrega entre 1 y 50 productos distintos al pedido.';
  end if;

  select * into v_business from public.businesses where public_slug = p_slug;
  if not found then raise exception 'No se encontró este catálogo.'; end if;
  if char_length(regexp_replace(coalesce(v_business.phone, ''), '[^0-9]', '', 'g')) < 10 then
    raise exception 'Este negocio todavía no ha configurado su número de WhatsApp.';
  end if;

  insert into public.customers (business_id, name, phone, address, location_url)
  values (v_business.id, btrim(p_customer_name), v_phone, btrim(p_customer_address), v_location)
  on conflict (business_id, phone) do update
    set name = excluded.name, address = excluded.address,
        location_url = excluded.location_url, updated_at = now()
  returning id into v_customer_id;

  insert into public.public_orders (
    business_id, customer_id, customer_name, customer_phone,
    customer_address, customer_location_url, notes, total_amount
  ) values (
    v_business.id, v_customer_id, btrim(p_customer_name), v_phone,
    btrim(p_customer_address), v_location, nullif(btrim(coalesce(p_notes, '')), ''), 0
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
      public_order_id, product_id, product_name, variant_label, quantity,
      regular_unit_price, unit_price, promotion_applied, line_total
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.variant_label, v_quantity,
      v_product.regular_price, v_unit_price, v_product.promotion_enabled, v_line_total
    );
    v_order_total := v_order_total + v_line_total;
  end loop;

  update public.public_orders set total_amount = v_order_total where id = v_order_id;
  return jsonb_build_object(
    'id', v_order_id, 'order_number', v_order_number,
    'total_amount', v_order_total, 'business_name', v_business.name,
    'business_phone', v_business.phone, 'currency_symbol', v_business.currency_symbol,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name, 'variant_label', oi.variant_label,
        'quantity', oi.quantity, 'unit_price', oi.unit_price, 'line_total', oi.line_total
      ) order by oi.created_at)
      from public.public_order_items oi where oi.public_order_id = v_order_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_public_order(text, text, text, text, text, text, jsonb) from public, anonymous, authenticated;
