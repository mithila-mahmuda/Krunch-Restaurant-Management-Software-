/** Supplier and stock purchase (stock-in) records. */

export type Supplier = {
  id: string;
  restaurantId?: string;
  /** Human-facing reference shown in the create dialog, e.g. `v-1786389316030`. */
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
};

/** Demo / empty-workspace seed suppliers. */
export const INITIAL_SUPPLIERS: Omit<Supplier, "restaurantId">[] = [
  {
    id: "sup-bengal-meat",
    code: "v-1001001001",
    name: "Bengal Meat",
    contactPerson: "Karim Hassan",
    phone: "01711-220033",
    email: "orders@bengalmeat.example",
    address: "Tejgaon Industrial Area, Dhaka",
    notes: "Halal beef, chicken, and mutton — weekly delivery",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "sup-fresh-valley",
    code: "v-1001001002",
    name: "Fresh Valley Produce",
    contactPerson: "Nusrat Jahan",
    phone: "01812-445566",
    email: "sales@freshvalley.example",
    address: "Kawran Bazar, Dhaka",
    notes: "Vegetables and herbs — Tue / Thu / Sat",
    createdAt: "2026-01-12T09:00:00.000Z",
  },
  {
    id: "sup-dairy-king",
    code: "v-1001001003",
    name: "Dairy King Ltd",
    contactPerson: "Rafiq Ahmed",
    phone: "01913-778899",
    email: "dispatch@dairyking.example",
    address: "Savar, Dhaka",
    notes: "Milk, cheese, yogurt — cold chain",
    createdAt: "2026-01-15T09:00:00.000Z",
  },
  {
    id: "sup-ocean-catch",
    code: "v-1001001004",
    name: "Ocean Catch Seafood",
    contactPerson: "Farhana Akter",
    phone: "01614-556677",
    email: "catch@oceancatch.example",
    address: "Fisheries Ghat, Chattogram",
    notes: "Fish and prawns — pre-order by 6am",
    createdAt: "2026-01-18T09:00:00.000Z",
  },
  {
    id: "sup-grain-house",
    code: "v-1001001005",
    name: "Grain House Trading",
    contactPerson: "Imran Chowdhury",
    phone: "01515-990011",
    email: "trade@grainhouse.example",
    address: "Nawabpur Road, Dhaka",
    notes: "Rice, flour, oil, dry goods",
    createdAt: "2026-01-20T09:00:00.000Z",
  },
  {
    id: "sup-city-pack",
    code: "v-1001001006",
    name: "City Pack Disposables",
    contactPerson: "Sadia Rahman",
    phone: "01316-334455",
    email: "hello@citypack.example",
    address: "Mirpur-1, Dhaka",
    notes: "Containers, cups, packaging",
    createdAt: "2026-01-22T09:00:00.000Z",
  },
];

export type PurchaseLine = {
  id: string;
  /** Inventory row id when matched/created at save time. */
  inventoryItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
};

export type PurchaseAttachment = {
  id: string;
  name: string;
  /** Optional local preview / download payload for small files. */
  dataUrl?: string;
};

export type PurchaseEntry = {
  id: string;
  restaurantId?: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  lines: PurchaseLine[];
  total: number;
  /** Amount paid to the supplier for this entry. */
  paid: number;
  /** Remaining balance (total − paid). */
  due: number;
  note?: string;
  attachments?: PurchaseAttachment[];
  purchasedAt: string;
  createdByName?: string;
};
