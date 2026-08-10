import { isSeedInventoryCatalogKey } from "@/lib/branch-ops";
import { localEntityKey } from "@/lib/tenant";
import type { Product, RecipeIngredient } from "@/lib/types";

/**
 * Seed recipes used to point at demo inventory (i1–i10).
 * Inventory is purchase-only now, so demo products start with no recipe links.
 */
export const PRODUCT_RECIPES: Record<string, RecipeIngredient[]> = {};

export function seedRecipeForProductId(
  productId: string,
  restaurantId?: string | null,
): RecipeIngredient[] | undefined {
  const key = restaurantId
    ? localEntityKey(restaurantId, productId)
    : productId.includes(":")
      ? productId.slice(productId.indexOf(":") + 1)
      : productId;
  const recipe = PRODUCT_RECIPES[key];
  return recipe ? recipe.map((step) => ({ ...step })) : undefined;
}

/** Drop recipe steps that still reference removed demo inventory keys. */
export function withoutSeedInventoryRecipeSteps(
  recipe: RecipeIngredient[] | undefined,
): RecipeIngredient[] | undefined {
  if (recipe === undefined) return undefined;
  return recipe.filter(
    (step) => !isSeedInventoryCatalogKey(step.inventoryId),
  );
}

export function resolveProductRecipe(
  product: Pick<Product, "id" | "restaurantId" | "recipe"> | undefined,
  productId: string,
): RecipeIngredient[] {
  if (product && product.recipe !== undefined) {
    return withoutSeedInventoryRecipeSteps(product.recipe) ?? [];
  }
  return (
    seedRecipeForProductId(productId, product?.restaurantId) ??
    seedRecipeForProductId(productId) ??
    []
  );
}

export function recipeDeductionsForLines(
  lines: { productId: string; quantity: number }[],
  products?: Pick<Product, "id" | "restaurantId" | "recipe">[],
): RecipeIngredient[] {
  const byId = new Map(products?.map((product) => [product.id, product]));
  const totals = new Map<string, number>();

  for (const line of lines) {
    const product = byId.get(line.productId);
    const recipe = resolveProductRecipe(product, line.productId);
    for (const step of recipe) {
      const qty = step.quantity * line.quantity;
      totals.set(
        step.inventoryId,
        (totals.get(step.inventoryId) ?? 0) + qty,
      );
    }
  }

  return [...totals.entries()].map(([inventoryId, quantity]) => ({
    inventoryId,
    quantity: Math.round(quantity * 1000) / 1000,
  }));
}
