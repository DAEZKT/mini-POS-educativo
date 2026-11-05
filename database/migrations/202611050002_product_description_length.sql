alter table public.products
  drop constraint if exists products_description_check;

alter table public.products
  add constraint products_description_check
  check (description is null or char_length(description) <= 2000);
