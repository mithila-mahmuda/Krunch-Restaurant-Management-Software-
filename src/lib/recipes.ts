import { localEntityKey } from "@/lib/tenant";
import type { Product, RecipeIngredient } from "@/lib/types";

/** Seed recipes (local product id → inventory deductions per unit sent to kitchen). */
export const PRODUCT_RECIPES: Record<string, RecipeIngredient[]> = {
  "americano-reg": [{ inventoryId: "i1", quantity: 0.018 }],
  "americano-large": [{ inventoryId: "i1", quantity: 0.024 }],
  "latte-reg": [
    { inventoryId: "i1", quantity: 0.018 },
    { inventoryId: "i2", quantity: 0.2 },
  ],
  "latte-large": [
    { inventoryId: "i1", quantity: 0.024 },
    { inventoryId: "i2", quantity: 0.28 },
  ],
  "cappuccino-reg": [
    { inventoryId: "i1", quantity: 0.018 },
    { inventoryId: "i2", quantity: 0.15 },
  ],
  "cappuccino-large": [
    { inventoryId: "i1", quantity: 0.024 },
    { inventoryId: "i2", quantity: 0.2 },
  ],
  "chicken-burger": [
    { inventoryId: "i4", quantity: 1 },
    { inventoryId: "i8", quantity: 1 },
  ],
  "beef-burger": [
    { inventoryId: "i4", quantity: 1 },
    { inventoryId: "i8", quantity: 1 },
  ],
  fries: [{ inventoryId: "i5", quantity: 0.2 }],
  "french-fries-reg": [{ inventoryId: "i5", quantity: 0.2 }],
  "french-fries-large": [{ inventoryId: "i5", quantity: 0.3 }],
  "fish-chips": [
    { inventoryId: "i6", quantity: 1 },
    { inventoryId: "i5", quantity: 0.25 },
  ],
  cola: [{ inventoryId: "i10", quantity: 0.05 }],
  cheesecake: [{ inventoryId: "i9", quantity: 1 }],
  "classic-bubble": [{ inventoryId: "i3", quantity: 0.2 }],
  "taro-bubble": [{ inventoryId: "i3", quantity: 0.2 }],
  "brown-sugar-bubble": [{ inventoryId: "i3", quantity: 0.2 }],
};

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

export function resolveProductRecipe(
  product: Pick<Product, "id" | "restaurantId" | "recipe"> | undefined,
  productId: string,
): RecipeIngredient[] {
  if (product && product.recipe !== undefined) {
    return product.recipe;
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
    const recipe = resolveProductRecipe(byId.get(line.productId), line.productId);
    for (const step of recipe) {
      totals.set(
        step.inventoryId,
        (totals.get(step.inventoryId) ?? 0) + step.quantity * line.quantity,
      );
    }
  }

  return [...totals.entries()].map(([inventoryId, quantity]) => ({
    inventoryId,
    quantity: Math.round(quantity * 1000) / 1000,
  }));
}
