export type Business = {
  id: string;
  owner_user_id: string;
  name: string;
  currency_symbol: string;
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
  category_id: string | null;
  category_name?: string | null;
  name: string;
  variant_label?: string | null;
  description: string | null;
  image_url: string | null;
  regular_price: number;
  is_active: boolean;
  promotion_enabled: boolean;
  promotional_price: number | null;
  created_at: string;
};

export type Category = {
  id: string;
  business_id: string;
  name: string;
  created_at: string;
};

export type Customer = {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  address: string | null;
  location_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicOrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export type PublicOrderItem = {
  id: string;
  public_order_id: string;
  product_id: string | null;
  product_name: string;
  variant_label: string | null;
  quantity: number;
  regular_unit_price: number;
  unit_price: number;
  promotion_applied: boolean;
  line_total: number;
};

export type PublicOrder = {
  id: string;
  business_id: string;
  order_number: number;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_location_url: string | null;
  notes: string | null;
  status: PublicOrderStatus;
  total_amount: number;
  created_at: string;
  updated_at: string;
  public_order_items?: PublicOrderItem[];
};

export type SaleItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  variant_label?: string | null;
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
  customer_id?: string | null;
  public_order_id?: string | null;
  public_order_number?: number | null;
  sold_at: string;
  total_amount: number;
  status: 'completed' | 'voided';
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  customer_updated_at?: string | null;
  customer_updated_by?: string | null;
  sale_items?: SaleItem[];
};

export const priceFor = (product: Product) =>
  product.promotion_enabled && product.promotional_price != null
    ? Number(product.promotional_price)
    : Number(product.regular_price);

export const formatMoney = (amount: number, currencySymbol = 'C$') =>
  `${currencySymbol.trim()} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

export const formatDate = (value: string) => new Intl.DateTimeFormat('es-NI', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));
