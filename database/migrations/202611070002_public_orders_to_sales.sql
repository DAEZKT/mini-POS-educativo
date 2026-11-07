-- A completed web order is recorded once in the shared sales history.
alter table public.sales
  add column if not exists public_order_id uuid references public.public_orders(id) on delete set null,
  add column if not exists public_order_number bigint;

create unique index if not exists sales_public_order_unique_idx
  on public.sales (public_order_id)
  where public_order_id is not null;

alter table public.sale_items
  add column if not exists variant_label text;

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

  select id into v_sale_id
  from public.sales
  where public_order_id = new.id;
  if found then return new; end if;

  insert into public.sales (
    business_id, sold_at, total_amount, public_order_id, public_order_number
  ) values (
    new.business_id, coalesce(new.updated_at, now()), new.total_amount,
    new.id, new.order_number
  ) returning id into v_sale_id;

  insert into public.sale_items (
    sale_id, product_id, product_name, variant_label, quantity,
    regular_unit_price, unit_price, promotion_applied, line_total
  )
  select
    v_sale_id, product_id, product_name, variant_label, quantity,
    regular_unit_price, unit_price, promotion_applied, line_total
  from public.public_order_items
  where public_order_id = new.id;

  return new;
end;
$$;

revoke all on function public.record_completed_public_order_sale() from public, anonymous, authenticated;

drop trigger if exists public_order_completion_to_sale on public.public_orders;
create trigger public_order_completion_to_sale
  after update of status on public.public_orders
  for each row
  when (new.status = 'completed' and old.status is distinct from new.status)
  execute function public.record_completed_public_order_sale();

-- Include orders already marked completed before this migration was installed.
do $$
declare
  v_order record;
  v_sale_id uuid;
begin
  for v_order in
    select o.*
    from public.public_orders o
    where o.status = 'completed'
      and not exists (select 1 from public.sales s where s.public_order_id = o.id)
  loop
    insert into public.sales (
      business_id, sold_at, total_amount, public_order_id, public_order_number
    ) values (
      v_order.business_id, coalesce(v_order.updated_at, v_order.created_at),
      v_order.total_amount, v_order.id, v_order.order_number
    ) returning id into v_sale_id;

    insert into public.sale_items (
      sale_id, product_id, product_name, variant_label, quantity,
      regular_unit_price, unit_price, promotion_applied, line_total
    )
    select
      v_sale_id, product_id, product_name, variant_label, quantity,
      regular_unit_price, unit_price, promotion_applied, line_total
    from public.public_order_items
    where public_order_id = v_order.id;
  end loop;
end;
$$;
