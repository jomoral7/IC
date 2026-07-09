export type Party = {
  id: string;
  kind: "supplier" | "customer";
  name: string;
  tax_id: string | null;
  phone: string | null;
};

export type Seller = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  commission_rate: number; // 0..1 (fraccion). 0.10 = 10%
  active: boolean;
};

export type SellerGoal = {
  id: string;
  seller_id: string;
  name: string;
  min_sales: number;
  bonus: number;
  active: boolean;
};

export type Commission = {
  id: string;
  seller_id: string;
  document_id: string;
  base_amount: number;
  commission_amount: number;
  status: string; // pending | hold | paid | cancelled
  created_at: string;
  doc: { document_number: string; customer_name: string | null; total: number; created_at: string } | null;
};

export type BonusPayment = {
  id: string;
  seller_id: string;
  goal_id: string;
  period: string; // YYYY-MM-DD (primer dia del mes)
  bonus: number;
};
export type Location = { id: string; name: string };

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normal_side: "debit" | "credit";
  is_postable: boolean;
  system_key: string | null;
  active: boolean;
};

/** Un movimiento de caja (gasto o ingreso) ya resumido desde su asiento. */
export type CashMovement = {
  id: string; // entry_id
  entry_date: string;
  memo: string | null;
  type: "expense" | "income";
  amount: number;
  category_name: string | null;
  pay_account_name: string | null;
  created_at: string;
};

export type JournalLine = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType | null;
  debit: number;
  credit: number;
  description: string | null;
};

export type JournalEntryFull = {
  id: string;
  entry_date: string;
  memo: string | null;
  source: string; // manual | expense | income | sale | void
  created_at: string;
  lines: JournalLine[];
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Activo",
  liability: "Pasivo",
  equity: "Patrimonio",
  income: "Ingreso",
  expense: "Gasto",
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  barcode: string | null;
  min_stock: number;
  cost: number;
  price: number;
  real_cost: number;
  sale_price: number;
  supplier_id: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  gender: string | null;
  season: string | null;
  internal_code: string | null;
  qr_payload: string | null;
  active: boolean;
  /** Stock total sumando todas las sucursales. */
  stock: number;
  /** Stock desglosado por location_id. */
  stockByLocation: Record<string, number>;
  /** Unidades pedidas que aun no llegan (pedidos en camino). */
  incoming: number;
};

export type ProductForm = Omit<Product, "id" | "active" | "stock" | "stockByLocation" | "incoming"> & { stock: number };

export type CartLine = Product & { qty: number };

export type UserProfile = {
  id: string;
  full_name: string;
  username: string | null;
  role: string;
  active: boolean;
};

export type AdjustmentDraft = { product: Product; quantity: number; reason: string; notes: string };

/** Una linea de una entrada de pedido / compra. */
export type PurchaseLine = { product: Product; qty: number; unit_cost: number };

export type StockRequest = {
  id: string;
  product_id: string;
  location_id: string | null;
  min_quantity: number;
  current_quantity: number;
  requested_quantity: number;
  status: "pending" | "ordered" | "received" | "cancelled";
  supplier_id: string | null;
  notes: string | null;
};

export const GENDERS = ["Unisex", "Mujer", "Hombre", "Niño", "Niña"] as const;

/** Catalogos precargados. Se fusionan con los valores ya existentes en los productos. */
export const CATEGORY_OPTIONS = [
  "Camisa",
  "Camiseta / Polo",
  "Blusa",
  "Pantalon",
  "Jeans",
  "Short",
  "Falda",
  "Vestido",
  "Chaqueta",
  "Sueter / Hoodie",
  "Ropa interior",
  "Pijama",
  "Zapato",
  "Tenis",
  "Sandalia",
  "Bota",
  "Cartera",
  "Bolso / Mochila",
  "Cinturon",
  "Gorra / Sombrero",
  "Accesorio",
  "Otro",
];

export const LETTER_SIZES = ["Unica", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
export const SHOE_SIZES = ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45"];
export const ACCESSORY_SIZES = ["Unica"];

/** Sugerencias de talla segun la categoria del producto. */
export function sizesForCategory(category: string): string[] {
  const c = (category || "").toLowerCase();
  if (/(zapato|tenis|sandalia|bota|calzado)/.test(c)) return SHOE_SIZES;
  if (/(cartera|bolso|mochila|cinturon|gorra|sombrero|accesorio)/.test(c)) return ACCESSORY_SIZES;
  return LETTER_SIZES;
}

export const COLOR_OPTIONS = [
  "Negro",
  "Blanco",
  "Gris",
  "Azul",
  "Azul marino",
  "Celeste",
  "Rojo",
  "Vino",
  "Verde",
  "Amarillo",
  "Naranja",
  "Rosado",
  "Morado",
  "Cafe",
  "Beige",
  "Dorado",
  "Plateado",
  "Multicolor",
];

export const ADJUSTMENT_REASONS: { value: string; label: string }[] = [
  { value: "damaged", label: "Dañado" },
  { value: "return", label: "Devolucion" },
  { value: "manual_count", label: "Conteo fisico" },
  { value: "lost", label: "Perdida" },
  { value: "found", label: "Encontrado / sobrante" },
  { value: "other", label: "Otro" },
];

export const emptyProduct: ProductForm = {
  sku: "",
  name: "",
  category: "",
  barcode: "",
  min_stock: 0,
  cost: 0,
  price: 0,
  real_cost: 0,
  sale_price: 0,
  supplier_id: null,
  brand: "",
  size: "",
  color: "",
  gender: "Unisex",
  season: "",
  internal_code: "",
  qr_payload: "",
  stock: 0,
};
