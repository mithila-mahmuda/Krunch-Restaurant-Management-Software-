import { inventoryCatalogKey } from "@/lib/branch-ops";
import type { InventoryItem } from "@/lib/module-data";
import { recipeDeductionsForLines, resolveProductRecipe } from "@/lib/recipes";
import type { OrderLine, Product } from "@/lib/types";

function matchInventoryItem(
  inventory: InventoryItem[],
  branchId: string,
  inventoryId: string,
): InventoryItem | undefined {
  return inventory.find((item) => {
    if (item.branchId !== branchId) return false;
    const catalog = inventoryCatalogKey(item.id);
    return inventoryId === catalog || inventoryId === item.id;
  });
}

export function applyInventoryDeductions(
  inventory: InventoryItem[],
  lines: OrderLine[],
  branchId: string,
  products?: Pick<Product, "id" | "restaurantId" | "recipe">[],
): InventoryItem[] {
  const deductions = recipeDeductionsForLines(lines, products);
  if (deductions.length === 0) return inventory;

  return inventory.map((item) => {
    if (item.branchId !== branchId) return item;
    const catalog = inventoryCatalogKey(item.id);
    const deduction = deductions.find(
      (entry) =>
        entry.inventoryId === catalog || entry.inventoryId === item.id,
    );
    if (!deduction) return item;
    return {
      ...item,
      onHand: Math.max(
        0,
        Math.round((item.onHand - deduction.quantity) * 1000) / 1000,
      ),
    };
  });
}

export function restoreInventory(
  inventory: InventoryItem[],
  lines: OrderLine[],
  branchId: string,
  products?: Pick<Product, "id" | "restaurantId" | "recipe">[],
): InventoryItem[] {
  const deductions = recipeDeductionsForLines(lines, products);
  if (deductions.length === 0) return inventory;

  return inventory.map((item) => {
    if (item.branchId !== branchId) return item;
    const catalog = inventoryCatalogKey(item.id);
    const deduction = deductions.find(
      (entry) =>
        entry.inventoryId === catalog || entry.inventoryId === item.id,
    );
    if (!deduction) return item;
    return {
      ...item,
      onHand: Math.round((item.onHand + deduction.quantity) * 1000) / 1000,
    };
  });
}

/**
 * Commit recipe stock for kitchen / sale. Restores prior committed lines first
 * so re-fires and pay-after-edit stay in sync without double-deducting.
 */
export function commitInventoryForLines(
  inventory: InventoryItem[],
  branchId: string,
  nextLines: OrderLine[],
  previous?: { lines: OrderLine[]; deducted: boolean },
  products?: Pick<Product, "id" | "restaurantId" | "recipe">[],
): InventoryItem[] {
  let next = inventory;
  if (previous?.deducted) {
    next = restoreInventory(next, previous.lines, branchId, products);
  }
  return applyInventoryDeductions(next, nextLines, branchId, products);
}

export type StockShortfall = {
  productId: string;
  name: string;
  ordered: number;
  available: number;
  unit: string;
};

/** How many whole units can be made from current branch stock (null = untracked). */
export function sellableUnitsForProduct(
  product: Pick<Product, "id" | "restaurantId" | "recipe" | "name">,
  inventory: InventoryItem[],
  branchId: string,
): { units: number; unit: string } | null {
  const recipe = resolveProductRecipe(product, product.id);
  if (recipe.length === 0) return null;

  let maxUnits = Number.POSITIVE_INFINITY;
  let limitingUnit = "";

  for (const step of recipe) {
    if (!(step.quantity > 0)) continue;
    const item = matchInventoryItem(inventory, branchId, step.inventoryId);
    // Ingredient not in stock yet (purchase-only inventory) — don't constrain.
    if (!item) continue;
    const units = Math.floor((item.onHand + 1e-9) / step.quantity);
    if (units < maxUnits) {
      maxUnits = units;
      limitingUnit = item.unit;
    }
  }

  if (!Number.isFinite(maxUnits)) return null;
  return { units: Math.max(0, maxUnits), unit: limitingUnit };
}

/** Inventory as the till should see it (add back stock already held by this open order). */
export function inventoryForTillCheck(
  inventory: InventoryItem[],
  branchId: string,
  editingOrder?: { lines: OrderLine[]; inventoryDeducted: boolean } | null,
  products?: Pick<Product, "id" | "restaurantId" | "recipe">[],
): InventoryItem[] {
  if (!editingOrder?.inventoryDeducted) return inventory;
  return restoreInventory(
    inventory,
    editingOrder.lines,
    branchId,
    products,
  );
}

export function stockShortfallsForLines(
  lines: OrderLine[],
  products: Pick<Product, "id" | "restaurantId" | "recipe" | "name">[],
  inventory: InventoryItem[],
  branchId: string,
): StockShortfall[] {
  const byProduct = new Map<
    string,
    { name: string; ordered: number; product: (typeof products)[number] }
  >();

  for (const line of lines) {
    const product =
      products.find((item) => item.id === line.productId) ??
      ({
        id: line.productId,
        name: line.name,
        recipe: undefined,
      } as (typeof products)[number]);
    const existing = byProduct.get(line.productId);
    if (existing) {
      existing.ordered += line.quantity;
    } else {
      byProduct.set(line.productId, {
        name: line.name,
        ordered: line.quantity,
        product,
      });
    }
  }

  const shortfalls: StockShortfall[] = [];
  for (const [productId, entry] of byProduct) {
    const sellable = sellableUnitsForProduct(
      entry.product,
      inventory,
      branchId,
    );
    if (!sellable) continue;
    if (entry.ordered > sellable.units) {
      shortfalls.push({
        productId,
        name: entry.name,
        ordered: entry.ordered,
        available: sellable.units,
        unit: sellable.unit,
      });
    }
  }
  return shortfalls;
}

export function formatStockWarning(shortfalls: StockShortfall[]): string {
  if (shortfalls.length === 0) return "";
  if (shortfalls.length === 1) {
    const item = shortfalls[0];
    const unit = item.unit ? ` ${item.unit}` : "";
    return `Only ${item.available}${unit} of ${item.name} left (ordering ${item.ordered})`;
  }
  return `Low stock: ${shortfalls
    .map((item) => {
      const unit = item.unit ? ` ${item.unit}` : "";
      return `${item.name} ${item.available}${unit} left (${item.ordered} ordered)`;
    })
    .join("; ")}`;
}
