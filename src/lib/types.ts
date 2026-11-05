export type Business = {
  id: string;
  owner_user_id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  address: string | null;
  phone: string | null;
  public_slug: string;
  created_at: string;
};

export type Product = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  regular_price: number;
  is_active: boolean;
  promotion_enabled: boolean;
  promotional_price: number | null;
  created_at: string;
};

export type SaleItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  regular_unit_price: number;
  unit_price: number;
  promotion_applied: boolean;
  line_total: number;
};

export type Sale = {
  id: string;
  business_id: string;
  sale_number: number;
  sold_at: string;
  total_amount: number;
  sale_items?: SaleItem[];
};

export const priceFor = (product: Product) =>
  product.promotion_enabled && product.promotional_price != null
    ? Number(product.promotional_price)
    : Number(product.regular_price);

export const formatMoney = (amount: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', maximumFractionDigits: 2 }).format(amount);

export const formatDate = (value: string) => new Intl.DateTimeFormat('es-NI', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));
