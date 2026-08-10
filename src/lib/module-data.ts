import { SEED_BRANCH_IDS } from "@/lib/seed-locations";
import type {
  DiningOption,
  KitchenStatus,
  TableStatus,
  TicketStatus,
} from "@/lib/types";

export type { KitchenStatus, TableStatus, TicketStatus };

const D = SEED_BRANCH_IDS.dhanmondi;
const G = SEED_BRANCH_IDS.gulshan;

export interface TicketLine {
  name: string;
  quantity: number;
  /** Present on till / orders board lines; kitchen tickets omit pricing. */
  unitPrice?: number;
  discountAmount?: number;
  note?: string;
  promotionLabel?: string;
}

export interface TicketOrder {
  id: string;
  number: string;
  table?: string;
  channel: DiningOption;
  status: TicketStatus;
  /** Kitchen prep stage; independent of payment status. */
  kitchenStatus?: KitchenStatus | null;
  guestName?: string;
  items: TicketLine[];
  total: number;
  placedAt: string;
  server: string;
  receipt?: string;
  method?: "cash" | "card";
  held?: boolean;
  source?: "till" | "demo";
  branchId?: string;
  branchName?: string;
}

export interface KitchenTicket {
  id: string;
  orderId: string;
  orderNumber: string;
  table?: string;
  channel: DiningOption;
  status: KitchenStatus;
  items: TicketLine[];
  notes?: string;
  /** ISO timestamp when the ticket entered the kitchen (live KDS). */
  startedAt?: string;
  elapsedMinutes: number;
  branchId?: string;
}

export interface FloorTable {
  id: string;
  /** Owning restaurant (tenant). */
  restaurantId?: string;
  /** Location this floor plan seat belongs to. */
  branchId: string;
  label: string;
  seats: number;
  zone: "Main" | "Patio" | "Bar";
  status: TableStatus;
  guestCount?: number;
  openTotal?: number;
  server?: string;
  activeOrderId?: string | null;
}

export interface CustomerRecord {
  id: string;
  /** Owning restaurant (tenant). */
  restaurantId?: string;
  name: string;
  email: string;
  phone: string;
  visits: number;
  loyaltyPoints: number;
  lastVisit: string;
  notes?: string;
}

export interface InventoryItem {
  id: string;
  /** Owning restaurant (tenant). */
  restaurantId?: string;
  /** Location this stock row belongs to. */
  branchId: string;
  name: string;
  unit: string;
  onHand: number;
  parLevel: number;
  category: string;
}

/** Demo ticket list — converted into OpsOrder rows when sample data is enabled. */
export const INITIAL_ORDERS: TicketOrder[] = [
  {
    id: "ord-1042",
    number: "#1042",
    table: "T4",
    channel: "eat_in",
    status: "open",
    guestName: "Harper Wells",
    items: [
      { name: "Chicken Burger", quantity: 2 },
      { name: "Fries", quantity: 2 },
      { name: "Cola", quantity: 2 },
    ],
    total: 41.0,
    placedAt: "14:12",
    server: "Maya",
  },
  {
    id: "ord-1041",
    number: "#1041",
    channel: "takeaway",
    status: "preparing",
    guestName: "Alex Chen",
    items: [
      { name: "Latte Regular", quantity: 2 },
      { name: "Club Sandwich", quantity: 1 },
    ],
    total: 15.75,
    placedAt: "14:05",
    server: "Kyle",
  },
  {
    id: "ord-1040",
    number: "#1040",
    table: "T1",
    channel: "eat_in",
    status: "ready",
    guestName: "Samira Khan",
    items: [
      { name: "Fish & Chips", quantity: 1 },
      { name: "Cola", quantity: 1 },
    ],
    total: 18.45,
    placedAt: "13:48",
    server: "Sam",
  },
  {
    id: "ord-1039",
    number: "#1039",
    table: "T2",
    channel: "eat_in",
    status: "ready",
    guestName: "Riley Morgan",
    items: [
      { name: "Veg Risotto", quantity: 1 },
      { name: "Side Salad", quantity: 1 },
    ],
    total: 16.45,
    placedAt: "13:35",
    server: "Maya",
  },
  {
    id: "ord-1038",
    number: "#1038",
    channel: "delivery",
    status: "paid",
    guestName: "Jordan Lee",
    items: [
      { name: "Carbonara", quantity: 1 },
      { name: "Garlic Bread", quantity: 1 },
      { name: "Cola", quantity: 1 },
    ],
    total: 19.7,
    placedAt: "13:20",
    server: "Maya",
    method: "card",
  },
  {
    id: "ord-1037",
    number: "#1037",
    table: "T3",
    channel: "eat_in",
    status: "paid",
    guestName: "Harper Wells",
    items: [
      { name: "Chicken Burger", quantity: 2 },
      { name: "Fries", quantity: 2 },
      { name: "Cola", quantity: 2 },
      { name: "Cheesecake", quantity: 1 },
    ],
    total: 47.5,
    placedAt: "12:40",
    server: "Maya",
    method: "card",
  },
  {
    id: "ord-1036",
    number: "#1036",
    channel: "takeaway",
    status: "paid",
    guestName: "Alex Chen",
    items: [
      { name: "Latte Regular", quantity: 3 },
      { name: "Chocolate Brownie", quantity: 2 },
    ],
    total: 22.1,
    placedAt: "10:15",
    server: "Kyle",
    method: "cash",
  },
  {
    id: "ord-1034",
    number: "#1034",
    table: "T5",
    channel: "eat_in",
    status: "paid",
    guestName: "Samira Khan",
    items: [
      { name: "Fish & Chips", quantity: 2 },
      { name: "Cola", quantity: 2 },
      { name: "Side Salad", quantity: 1 },
    ],
    total: 40.85,
    placedAt: "13:05",
    server: "Sam",
    method: "card",
  },
  {
    id: "ord-1033",
    number: "#1033",
    channel: "takeaway",
    status: "paid",
    guestName: "Riley Morgan",
    items: [
      { name: "Latte Regular", quantity: 2 },
      { name: "Cappuccino", quantity: 1 },
      { name: "Avocado Toast", quantity: 1 },
    ],
    total: 20.15,
    placedAt: "09:40",
    server: "Kyle",
    method: "cash",
  },
  {
    id: "ord-1032",
    number: "#1032",
    channel: "delivery",
    status: "paid",
    guestName: "Riley Morgan",
    items: [
      { name: "Chicken Burger", quantity: 1 },
      { name: "Fries", quantity: 1 },
      { name: "Cola", quantity: 1 },
    ],
    total: 20.5,
    placedAt: "14:30",
    server: "Maya",
    method: "card",
  },
  {
    id: "ord-1031",
    number: "#1031",
    table: "B3",
    channel: "eat_in",
    status: "paid",
    guestName: "Jordan Lee",
    items: [
      { name: "Fresh Orange Juice", quantity: 2 },
      { name: "Soup of the Day", quantity: 1 },
      { name: "Garlic Bread", quantity: 1 },
    ],
    total: 19.85,
    placedAt: "11:25",
    server: "Sam",
    method: "cash",
  },
  {
    id: "ord-1030",
    number: "#1030",
    channel: "takeaway",
    status: "paid",
    guestName: "Alex Chen",
    items: [
      { name: "Club Sandwich", quantity: 1 },
      { name: "Cola", quantity: 1 },
      { name: "Americano", quantity: 1 },
    ],
    total: 14.25,
    placedAt: "15:10",
    server: "Kyle",
    method: "card",
  },
  {
    id: "ord-1029",
    number: "#1029",
    table: "T6",
    channel: "eat_in",
    status: "paid",
    guestName: "Harper Wells",
    items: [
      { name: "Eggs Benedict", quantity: 2 },
      { name: "Berry Smoothie", quantity: 1 },
      { name: "Lemonade", quantity: 1 },
    ],
    total: 30.45,
    placedAt: "11:05",
    server: "Maya",
    method: "card",
  },
  {
    id: "ord-1028",
    number: "#1028",
    channel: "delivery",
    status: "paid",
    guestName: "Jordan Lee",
    items: [
      { name: "Stroganoff V", quantity: 1 },
      { name: "Fries", quantity: 1 },
      { name: "Lemonade", quantity: 2 },
    ],
    total: 22.45,
    placedAt: "18:40",
    server: "Sam",
    method: "card",
  },
  {
    id: "ord-1027",
    number: "#1027",
    table: "B1",
    channel: "eat_in",
    status: "paid",
    items: [
      { name: "Iced Latte", quantity: 2 },
      { name: "Bar Nuts", quantity: 1 },
      { name: "Loaded Fries", quantity: 1 },
    ],
    total: 25.0,
    placedAt: "19:15",
    server: "Kyle",
    method: "cash",
  },
  {
    id: "ord-1026",
    number: "#1026",
    channel: "takeaway",
    status: "paid",
    guestName: "Samira Khan",
    items: [
      { name: "Lunch Pasta", quantity: 1 },
      { name: "Lunch Salad", quantity: 1 },
      { name: "Cola", quantity: 2 },
    ],
    total: 21.98,
    placedAt: "12:10",
    server: "Maya",
    method: "card",
  },
  {
    id: "ord-1035",
    number: "#1035",
    table: "T7",
    channel: "eat_in",
    status: "void",
    items: [{ name: "Soup of the Day", quantity: 1 }],
    total: 5.5,
    placedAt: "12:55",
    server: "Kyle",
  },
];

export const INITIAL_KITCHEN: KitchenTicket[] = [
  {
    id: "k-1",
    orderId: "ord-1042",
    orderNumber: "#1042",
    table: "T4",
    channel: "eat_in",
    status: "queued",
    items: [
      { name: "Chicken Burger", quantity: 2 },
      { name: "Fries", quantity: 2 },
    ],
    notes: "No onions on one burger",
    elapsedMinutes: 2,
  },
  {
    id: "k-2",
    orderId: "ord-1041",
    orderNumber: "#1041",
    channel: "takeaway",
    status: "preparing",
    items: [{ name: "Club Sandwich", quantity: 1 }],
    elapsedMinutes: 8,
  },
  {
    id: "k-3",
    orderId: "ord-1040",
    orderNumber: "#1040",
    table: "T1",
    channel: "eat_in",
    status: "preparing",
    items: [{ name: "Fish & Chips", quantity: 1 }],
    elapsedMinutes: 14,
  },
  {
    id: "k-4",
    orderId: "ord-1039",
    orderNumber: "#1039",
    table: "T2",
    channel: "eat_in",
    status: "ready",
    items: [
      { name: "Veg Risotto", quantity: 1 },
      { name: "Side Salad", quantity: 1 },
    ],
    elapsedMinutes: 18,
  },
];

/** Legacy single-branch floor — ops normalizes to all branches on hydrate. */
export const INITIAL_TABLES: FloorTable[] = [
  { id: `${D}:t1`, branchId: D, label: "T1", seats: 2, zone: "Main", status: "free" },
  { id: `${D}:t2`, branchId: D, label: "T2", seats: 4, zone: "Main", status: "free" },
  { id: `${D}:t3`, branchId: D, label: "T3", seats: 4, zone: "Main", status: "free" },
  { id: `${D}:t4`, branchId: D, label: "T4", seats: 4, zone: "Main", status: "free" },
  { id: `${D}:t5`, branchId: D, label: "T5", seats: 2, zone: "Main", status: "free" },
  { id: `${D}:t6`, branchId: D, label: "T6", seats: 6, zone: "Patio", status: "free" },
  { id: `${D}:t7`, branchId: D, label: "T7", seats: 4, zone: "Patio", status: "free" },
  { id: `${D}:t8`, branchId: D, label: "T8", seats: 2, zone: "Patio", status: "free" },
  { id: `${D}:b1`, branchId: D, label: "B1", seats: 1, zone: "Bar", status: "free" },
  { id: `${D}:b2`, branchId: D, label: "B2", seats: 1, zone: "Bar", status: "free" },
  { id: `${D}:b3`, branchId: D, label: "B3", seats: 2, zone: "Bar", status: "free" },
  { id: `${D}:b4`, branchId: D, label: "B4", seats: 1, zone: "Bar", status: "free" },
];

export const DEMO_TABLES: FloorTable[] = [
  { id: `${G}:t1`, branchId: G, label: "T1", seats: 2, zone: "Main", status: "ordered", guestCount: 2, openTotal: 21.15, server: "Sam", activeOrderId: "ord-1040" },
  { id: `${D}:t2`, branchId: D, label: "T2", seats: 4, zone: "Main", status: "ordered", guestCount: 2, openTotal: 16.45, server: "Maya", activeOrderId: "ord-1039" },
  { id: `${D}:t3`, branchId: D, label: "T3", seats: 4, zone: "Main", status: "seated", guestCount: 3, server: "Maya" },
  { id: `${D}:t4`, branchId: D, label: "T4", seats: 4, zone: "Main", status: "ordered", guestCount: 4, openTotal: 41.0, server: "Maya", activeOrderId: "ord-1042" },
  { id: `${D}:t5`, branchId: D, label: "T5", seats: 2, zone: "Main", status: "bill", guestCount: 2, openTotal: 28.4, server: "Kyle" },
  { id: `${G}:t8`, branchId: G, label: "T8", seats: 2, zone: "Patio", status: "seated", guestCount: 2, server: "Sam" },
  { id: `${D}:b1`, branchId: D, label: "B1", seats: 1, zone: "Bar", status: "ordered", guestCount: 1, openTotal: 7.5, server: "Kyle" },
  { id: `${D}:b3`, branchId: D, label: "B3", seats: 2, zone: "Bar", status: "bill", guestCount: 2, openTotal: 16.4, server: "Maya" },
];

export const INITIAL_CUSTOMERS: CustomerRecord[] = [
  {
    id: "c1",
    name: "Harper Wells",
    email: "harper@email.com",
    phone: "07700 900123",
    visits: 18,
    loyaltyPoints: 240,
    lastVisit: "Today",
    notes: "Prefers oat milk",
  },
  {
    id: "c2",
    name: "Alex Chen",
    email: "alex.chen@email.com",
    phone: "07700 900456",
    visits: 7,
    loyaltyPoints: 90,
    lastVisit: "Today",
  },
  {
    id: "c3",
    name: "Jordan Lee",
    email: "jordan@email.com",
    phone: "07700 900789",
    visits: 32,
    loyaltyPoints: 510,
    lastVisit: "Yesterday",
    notes: "Allergic to nuts",
  },
  {
    id: "c4",
    name: "Riley Morgan",
    email: "riley@email.com",
    phone: "07700 900321",
    visits: 4,
    loyaltyPoints: 40,
    lastVisit: "3 days ago",
  },
  {
    id: "c5",
    name: "Samira Khan",
    email: "samira@email.com",
    phone: "07700 900654",
    visits: 12,
    loyaltyPoints: 160,
    lastVisit: "Last week",
  },
];

/** Legacy export — inventory is purchase-driven; kept empty for compatibility. */
export const INITIAL_INVENTORY: InventoryItem[] = [];

export const REPORT_SUMMARY = {
  dateLabel: "Today",
  netSales: 1842.5,
  grossSales: 2211.0,
  orders: 96,
  averageTicket: 19.19,
  covers: 148,
  voids: 3,
  discounts: 86.4,
  topItems: [
    { name: "Latte Regular", qty: 62, revenue: 210.8 },
    { name: "Chicken Burger", qty: 28, revenue: 406.0 },
    { name: "Fish & Chips", qty: 19, revenue: 303.05 },
    { name: "Cola", qty: 41, revenue: 102.5 },
  ],
  hourly: [
    { hour: "09", sales: 96 },
    { hour: "10", sales: 142 },
    { hour: "11", sales: 188 },
    { hour: "12", sales: 312 },
    { hour: "13", sales: 365 },
    { hour: "14", sales: 278 },
    { hour: "15", sales: 210 },
  ],
};
