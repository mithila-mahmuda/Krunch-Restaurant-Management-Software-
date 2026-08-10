export type CategoryTone = "drinks" | "food" | "special" | "retail";

export type DiningOption = "eat_in" | "takeaway" | "delivery";

export type SidebarTab = "menu" | "customers" | "orders" | "tables";

export type TicketStatus = "open" | "preparing" | "ready" | "paid" | "void";
export type KitchenStatus = "queued" | "preparing" | "ready" | "served";
export type TableStatus = "free" | "seated" | "ordered" | "bill";

/** One inventory ingredient used to make a product (per unit sent to kitchen). */
export interface RecipeIngredient {
  /** Inventory catalog key (`i1`) or scoped id — matched via `inventoryCatalogKey`. */
  inventoryId: string;
  quantity: number;
}

export interface Category {
  id: string;
  /** Owning restaurant (tenant). */
  restaurantId?: string;
  name: string;
  /** Hex colour for category + item tiles on the till (`#rrggbb`). */
  color?: string;
  /** Optional photo used as the till tile background (data URL). */
  imageDataUrl?: string | null;
  /** Display order on the till (lower first). */
  sortOrder?: number;
  /** @deprecated Prefer `color`. Kept for older stored rows. */
  tone?: CategoryTone;
}

export interface Product {
  id: string;
  /** Owning restaurant (tenant). */
  restaurantId?: string;
  categoryId: string;
  name: string;
  price: number;
  /** Optional unit cost for margin / utilisation tracking. */
  cost?: number;
  available?: boolean;
  /** Optional till-tile colour (`#rrggbb`). Falls back to category colour. */
  color?: string;
  /** Optional photo used as the till tile background (data URL). */
  imageDataUrl?: string | null;
  /** Ingredients deducted from inventory when sent to kitchen (or paid if never kitchened). */
  recipe?: RecipeIngredient[];
  /** Display order within its category (lower first). */
  sortOrder?: number;
}

export interface Promotion {
  id: string;
  label: string;
  productIds: string[];
  discountedUnitPrice: number;
  requiredQuantity: number;
}

export interface OrderLine {
  id: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  note?: string;
  /** Staff-entered discount; survives promotion recalculation. */
  manualDiscountAmount: number;
  /** Combined manual + promo discount used for totals. */
  discountAmount: number;
  promotionLabel?: string;
}

export interface HeldOrder {
  id: string;
  number: string;
  lines: OrderLine[];
  diningOption: DiningOption;
  serviceEnabled: boolean;
  customerId: string | null;
  customerName: string | null;
  tableId: string | null;
  tableLabel: string | null;
  heldAt: string;
  total: number;
}

export interface CompletedOrder {
  id: string;
  number: string;
  lines: OrderLine[];
  diningOption: DiningOption;
  serviceEnabled: boolean;
  customerId: string | null;
  customerName: string | null;
  tableId: string | null;
  tableLabel: string | null;
  paidAt: string;
  total: number;
  method: "cash" | "card";
  receipt: string;
  server: string;
}

/** Single source of truth for Orders + Kitchen + table tabs. */
export interface OpsOrder {
  id: string;
  /** Owning restaurant (tenant). */
  restaurantId?: string;
  number: string;
  lines: OrderLine[];
  diningOption: DiningOption;
  serviceEnabled: boolean;
  customerId: string | null;
  customerName: string | null;
  tableId: string | null;
  tableLabel: string | null;
  status: TicketStatus;
  kitchenStatus: KitchenStatus | null;
  kitchenNotes?: string;
  /** ISO timestamp when the ticket was fired to kitchen; drives the live KDS clock. */
  kitchenStartedAt: string | null;
  /** Legacy whole-minute offset; kept for persisted rows without kitchenStartedAt. */
  kitchenElapsedMinutes: number;
  server: string;
  placedAt: string;
  paidAt?: string;
  method?: "cash" | "card";
  receipt?: string;
  total: number;
  /** Demo seed rows — optional display; live till rows have source "till". */
  source: "till" | "demo";
  /** Which location / POS station took the order (live till rows). */
  branchId?: string;
  branchName?: string;
  tillId?: string;
  tillName?: string;
  inventoryDeducted: boolean;
  held: boolean;
}

export interface PaymentResult {
  method: "cash" | "card";
  amountPaid: number;
  change: number;
}

/** Till cash-drawer audit trail (no-sale, petty cash, float, cash sales). */
export type CashEventType =
  | "no_sale"
  | "petty_cash"
  | "float_adjust"
  | "cash_sale";

export interface CashDrawerEvent {
  id: string;
  /** Owning restaurant (tenant). */
  restaurantId?: string;
  type: CashEventType;
  /** Monetary value for the event (0 for no-sale). */
  amount: number;
  reason: string;
  staffName: string;
  createdAt: string;
  floatAfter: number;
  orderNumber?: string;
  branchId?: string;
  branchName?: string;
  tillId?: string;
  tillName?: string;
}

export interface OrderTotals {
  itemCount: number;
  subtotal: number;
  totalDiscount: number;
  serviceCharge: number;
  tax: number;
  total: number;
  due: number;
}
