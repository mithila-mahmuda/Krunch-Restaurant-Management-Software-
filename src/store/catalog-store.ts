"use client";

import { create } from "zustand";
import {
  loadCatalog,
  loadCategories,
  saveCatalog,
  saveCategories,
} from "@/lib/db/repos";
import { queueDbWrite } from "@/lib/db/write";
import {
  DEFAULT_CATEGORY_COLOR,
  normalizeCategoryColor,
  resolveCategoryColor,
} from "@/lib/category-color";
import {
  applySortOrderByIds,
  withSequentialSortOrder,
} from "@/lib/catalog-order";
import {
  categories as seedCategoryList,
  products as seedProducts,
} from "@/lib/mock-data";
import { assertCan } from "@/lib/permissions";
import {
  seedRecipeForProductId,
  withoutSeedInventoryRecipeSteps,
} from "@/lib/recipes";
import {
  DEMO_RESTAURANT_ID,
  localEntityKey,
  tenantEntityId,
} from "@/lib/tenant";
import type { Category, Product, RecipeIngredient } from "@/lib/types";
import { useAuthStore } from "@/store/auth-store";

export type ProductWriteInput = {
  name: string;
  price: number;
  categoryId: string;
  available?: boolean;
  /** Omit to leave unchanged on update; `null` clears. */
  cost?: number | null;
  color?: string | null;
  imageDataUrl?: string | null;
  recipe?: RecipeIngredient[];
};

export type ProductWriteResult =
  | { ok: true; product: Product }
  | { ok: false; error: string };

export type CategoryWriteInput = {
  name: string;
  color: string;
  /** Omit to leave unchanged on update; `null` clears. */
  imageDataUrl?: string | null;
};

export type CategoryWriteResult =
  | { ok: true; category: Category }
  | { ok: false; error: string };

interface CatalogState {
  restaurantId: string | null;
  categories: Category[];
  products: Product[];
  hydrated: boolean;
  hydrateForRestaurant: (restaurantId: string) => Promise<void>;
  hydrate: () => Promise<void>;
  setAvailability: (productId: string, available: boolean) => void;
  toggleAvailability: (productId: string) => void;
  setCategoryAvailability: (categoryId: string, available: boolean) => void;
  reorderCategories: (orderedIds: string[]) => void;
  reorderProducts: (categoryId: string, orderedIds: string[]) => void;
  updatePrice: (productId: string, price: number) => void;
  addProduct: (input: ProductWriteInput) => ProductWriteResult;
  updateProduct: (
    productId: string,
    input: ProductWriteInput,
  ) => ProductWriteResult;
  duplicateProduct: (productId: string) => ProductWriteResult;
  removeProduct: (productId: string) => ProductWriteResult;
  addCategory: (input: CategoryWriteInput) => CategoryWriteResult;
  updateCategory: (
    categoryId: string,
    input: CategoryWriteInput,
  ) => CategoryWriteResult;
  removeCategory: (categoryId: string) => CategoryWriteResult;
  getProduct: (productId: string) => Product | undefined;
  persist: () => void;
}

function withResolvedColor(category: Category): Category {
  return {
    ...category,
    color: resolveCategoryColor(category),
  };
}

function seedCategories(restaurantId: string): Category[] {
  return withSequentialSortOrder(
    seedCategoryList.map((seed, index) =>
      withResolvedColor({
        ...seed,
        id: tenantEntityId(restaurantId, seed.id),
        restaurantId,
        color: resolveCategoryColor(seed),
        sortOrder: seed.sortOrder ?? index,
      }),
    ),
  );
}

function normalizeRecipe(
  recipe: RecipeIngredient[] | undefined,
): RecipeIngredient[] | undefined {
  if (recipe === undefined) return undefined;
  return withoutSeedInventoryRecipeSteps(
    recipe
      .map((step) => ({
        inventoryId: step.inventoryId.trim(),
        quantity: Number(step.quantity),
      }))
      .filter(
        (step) =>
          step.inventoryId.length > 0 &&
          Number.isFinite(step.quantity) &&
          step.quantity > 0,
      ),
  );
}

function withHydratedRecipe(
  product: Product,
  restaurantId: string,
): Product {
  if (product.recipe !== undefined) {
    return {
      ...product,
      recipe: normalizeRecipe(product.recipe) ?? [],
    };
  }
  const seeded = seedRecipeForProductId(product.id, restaurantId);
  // Persist an explicit recipe list so hydrate does not keep rewriting.
  return { ...product, recipe: seeded ?? [] };
}

function seedCatalog(restaurantId: string): Product[] {
  return withSequentialSortOrder(
    seedProducts.map((seed, index) => {
      const id = tenantEntityId(restaurantId, seed.id);
      return withHydratedRecipe(
        {
          ...seed,
          id,
          categoryId: tenantEntityId(restaurantId, seed.categoryId),
          restaurantId,
          available: seed.available ?? true,
          sortOrder: seed.sortOrder ?? index,
          recipe: seed.recipe ?? seedRecipeForProductId(seed.id),
        },
        restaurantId,
      );
    }),
  );
}

function nextSortOrder(items: { sortOrder?: number }[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((item) => item.sortOrder ?? 0)) + 1;
}

/** Older demo menus that should be replaced by the refreshed seed catalog. */
const RETIRED_CATEGORY_KEYS = new Set([
  "spirits",
  "wines",
  "beers",
  "aprons",
  "ceramics",
  "branded",
  "pantry",
  "bar-buddies",
  "lunch-4-less",
  "barista",
  "deli",
  "soft-drinks",
  "brunch",
]);

function shouldReseedLegacyCatalog(
  categories: Category[],
  restaurantId: string,
): boolean {
  return categories.some((category) =>
    RETIRED_CATEGORY_KEYS.has(localEntityKey(restaurantId, category.id)),
  );
}

function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

function uniqueEntityId(
  restaurantId: string,
  name: string,
  existingIds: Set<string>,
): string {
  const base = slugifyName(name);
  let localId = base;
  let n = 2;
  while (existingIds.has(tenantEntityId(restaurantId, localId))) {
    localId = `${base}-${n}`;
    n += 1;
  }
  return tenantEntityId(restaurantId, localId);
}

function normalizeProductInput(input: ProductWriteInput) {
  const costRaw =
    input.cost === null
      ? null
      : input.cost === undefined
        ? undefined
        : Number(input.cost);
  return {
    name: input.name.trim(),
    price: Number(input.price),
    categoryId: input.categoryId.trim(),
    available: input.available !== false,
    cost: costRaw,
    color:
      input.color === undefined
        ? undefined
        : input.color === null
          ? null
          : normalizeCategoryColor(input.color),
    imageDataUrl:
      input.imageDataUrl === undefined
        ? undefined
        : input.imageDataUrl?.trim() || null,
    recipe: normalizeRecipe(input.recipe),
  };
}

function normalizeCategoryInput(input: CategoryWriteInput) {
  return {
    name: input.name.trim(),
    color: normalizeCategoryColor(input.color) ?? "",
    imageDataUrl:
      input.imageDataUrl === undefined
        ? undefined
        : input.imageDataUrl?.trim() || null,
  };
}

function validateProductInput(
  products: Product[],
  categories: Category[],
  input: ReturnType<typeof normalizeProductInput>,
  excludeId?: string,
): string | null {
  if (input.name.length < 2) {
    return "Enter a product name (at least 2 characters).";
  }
  if (!Number.isFinite(input.price) || !(input.price > 0)) {
    return "Enter a price greater than 0.";
  }
  if (
    input.cost !== undefined &&
    input.cost !== null &&
    (!Number.isFinite(input.cost) || input.cost < 0)
  ) {
    return "Enter a cost of 0 or more, or leave it blank.";
  }
  if (
    input.color !== undefined &&
    input.color !== null &&
    !input.color
  ) {
    return "Choose a valid tile colour.";
  }
  if (!input.categoryId) {
    return "Choose a category.";
  }
  if (!categories.some((category) => category.id === input.categoryId)) {
    return "Choose a valid category.";
  }
  const duplicate = products.find(
    (product) =>
      product.id !== excludeId &&
      product.name.toLowerCase() === input.name.toLowerCase() &&
      product.categoryId === input.categoryId,
  );
  if (duplicate) {
    return "A product with that name already exists in this category.";
  }
  return null;
}

function validateCategoryInput(
  categories: Category[],
  input: ReturnType<typeof normalizeCategoryInput>,
  excludeId?: string,
): string | null {
  if (input.name.length < 2) {
    return "Enter a category name (at least 2 characters).";
  }
  if (!input.color) {
    return "Choose a category colour.";
  }
  const duplicate = categories.find(
    (category) =>
      category.id !== excludeId &&
      category.name.toLowerCase() === input.name.toLowerCase(),
  );
  if (duplicate) {
    return "A category with that name already exists.";
  }
  return null;
}

const initialRestaurantId = DEMO_RESTAURANT_ID;

export const useCatalogStore = create<CatalogState>((set, get) => ({
  restaurantId: null,
  categories: seedCategories(initialRestaurantId),
  products: seedCatalog(initialRestaurantId),
  hydrated: false,

  hydrateForRestaurant: async (restaurantId) => {
    if (get().hydrated && get().restaurantId === restaurantId) return;
    const [storedProducts, storedCategories] = await Promise.all([
      loadCatalog(restaurantId),
      loadCategories(restaurantId),
    ]);
    const reseed =
      storedCategories.length === 0 ||
      shouldReseedLegacyCatalog(storedCategories, restaurantId);
    const categories = withSequentialSortOrder(
      (reseed ? seedCategories(restaurantId) : storedCategories).map(
        withResolvedColor,
      ),
    );
    const rawProducts = reseed
      ? seedCatalog(restaurantId)
      : storedProducts.length > 0
        ? storedProducts
        : seedCatalog(restaurantId);
    const products = withSequentialSortOrder(
      rawProducts.map((product) => withHydratedRecipe(product, restaurantId)),
    );
    const needsCategoryPersist =
      reseed ||
      storedCategories.some(
        (category) =>
          normalizeCategoryColor(category.color ?? "") !==
          resolveCategoryColor(category),
      ) ||
      storedCategories.some((category) => category.sortOrder == null);
    const recipesStrippedSeedInventory = products.some((product, index) => {
      const before = rawProducts[index]?.recipe;
      if (!before || !product.recipe) return false;
      return before.length !== product.recipe.length;
    });
    const needsProductPersist =
      reseed ||
      storedProducts.length === 0 ||
      storedProducts.some((product) => product.sortOrder == null) ||
      recipesStrippedSeedInventory ||
      (!reseed &&
        storedProducts.some((product) => product.recipe === undefined));
    set({
      restaurantId,
      categories,
      products,
      hydrated: true,
    });
    if (needsProductPersist || needsCategoryPersist) {
      get().persist();
    }
  },

  hydrate: async () => {
    await get().hydrateForRestaurant(get().restaurantId ?? DEMO_RESTAURANT_ID);
  },

  persist: () => {
    if (!get().hydrated) return;
    const restaurantId = get().restaurantId;
    if (!restaurantId) return;
    queueDbWrite(
      () => saveCatalog(restaurantId, get().products),
      "save catalog",
    );
    queueDbWrite(
      () => saveCategories(restaurantId, get().categories),
      "save categories",
    );
  },

  setAvailability: (productId, available) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return;

    set((state) => {
      const products = state.products.map((product) =>
        product.id === productId ? { ...product, available } : product,
      );
      return { products };
    });
    get().persist();
  },

  toggleAvailability: (productId) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return;

    const product = get().products.find((item) => item.id === productId);
    if (!product) return;
    get().setAvailability(productId, product.available === false);
  },

  setCategoryAvailability: (categoryId, available) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return;

    set((state) => ({
      products: state.products.map((product) =>
        product.categoryId === categoryId ? { ...product, available } : product,
      ),
    }));
    get().persist();
  },

  reorderCategories: (orderedIds) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return;

    set((state) => ({
      categories: applySortOrderByIds(state.categories, orderedIds),
    }));
    get().persist();
  },

  reorderProducts: (categoryId, orderedIds) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return;

    set((state) => ({
      products: state.products.map((product) => {
        if (product.categoryId !== categoryId) return product;
        const rank = orderedIds.indexOf(product.id);
        return rank >= 0 ? { ...product, sortOrder: rank } : product;
      }),
    }));
    get().persist();
  },

  updatePrice: (productId, price) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return;
    if (!(price > 0)) return;

    set((state) => ({
      products: state.products.map((product) =>
        product.id === productId ? { ...product, price } : product,
      ),
    }));
    get().persist();
  },

  addProduct: (input) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return { ok: false, error: denied.error };

    const normalized = normalizeProductInput(input);
    const error = validateProductInput(
      get().products,
      get().categories,
      normalized,
    );
    if (error) return { ok: false, error };

    const restaurantId = get().restaurantId ?? DEMO_RESTAURANT_ID;
    const existingIds = new Set(get().products.map((product) => product.id));
    const siblings = get().products.filter(
      (product) => product.categoryId === normalized.categoryId,
    );
    const product: Product = {
      id: uniqueEntityId(restaurantId, normalized.name, existingIds),
      restaurantId,
      name: normalized.name,
      price: normalized.price,
      categoryId: normalized.categoryId,
      available: normalized.available,
      sortOrder: nextSortOrder(siblings),
      ...(normalized.cost !== undefined && normalized.cost !== null
        ? { cost: normalized.cost }
        : {}),
      ...(normalized.color ? { color: normalized.color } : {}),
      ...(normalized.imageDataUrl
        ? { imageDataUrl: normalized.imageDataUrl }
        : {}),
      recipe: normalized.recipe ?? [],
    };

    set((state) => ({ products: [...state.products, product] }));
    get().persist();
    return { ok: true, product };
  },

  updateProduct: (productId, input) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return { ok: false, error: denied.error };

    const existing = get().products.find((product) => product.id === productId);
    if (!existing) {
      return { ok: false, error: "Product not found." };
    }

    const normalized = normalizeProductInput({
      ...input,
      available: input.available ?? existing.available !== false,
    });
    const error = validateProductInput(
      get().products,
      get().categories,
      normalized,
      productId,
    );
    if (error) return { ok: false, error };

    const product: Product = {
      ...existing,
      name: normalized.name,
      price: normalized.price,
      categoryId: normalized.categoryId,
      available: normalized.available,
      cost:
        normalized.cost === undefined
          ? existing.cost
          : normalized.cost === null
            ? undefined
            : normalized.cost,
      color:
        normalized.color === undefined
          ? existing.color
          : normalized.color === null
            ? undefined
            : normalized.color,
      imageDataUrl:
        normalized.imageDataUrl === undefined
          ? existing.imageDataUrl
          : normalized.imageDataUrl,
      recipe:
        normalized.recipe === undefined
          ? existing.recipe
          : normalized.recipe,
    };
    if (product.cost === undefined) {
      delete product.cost;
    }
    if (!product.color) {
      delete product.color;
    }
    if (!product.imageDataUrl) {
      delete product.imageDataUrl;
    }

    set((state) => ({
      products: state.products.map((item) =>
        item.id === productId ? product : item,
      ),
    }));
    get().persist();
    return { ok: true, product };
  },

  duplicateProduct: (productId) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return { ok: false, error: denied.error };

    const existing = get().products.find((product) => product.id === productId);
    if (!existing) {
      return { ok: false, error: "Product not found." };
    }

    const siblings = get().products.filter(
      (product) => product.categoryId === existing.categoryId,
    );
    let copyName = `Copy of ${existing.name}`;
    let suffix = 2;
    while (
      siblings.some(
        (product) => product.name.toLowerCase() === copyName.toLowerCase(),
      )
    ) {
      copyName = `Copy of ${existing.name} (${suffix})`;
      suffix += 1;
    }

    return get().addProduct({
      name: copyName,
      price: existing.price,
      categoryId: existing.categoryId,
      available: existing.available !== false,
      cost: existing.cost ?? null,
      color: existing.color ?? null,
      imageDataUrl: existing.imageDataUrl ?? null,
      recipe: existing.recipe
        ? existing.recipe.map((step) => ({ ...step }))
        : [],
    });
  },

  removeProduct: (productId) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return { ok: false, error: denied.error };

    const existing = get().products.find((product) => product.id === productId);
    if (!existing) {
      return { ok: false, error: "Product not found." };
    }

    set((state) => ({
      products: state.products.filter((product) => product.id !== productId),
    }));
    get().persist();
    return { ok: true, product: existing };
  },

  addCategory: (input) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return { ok: false, error: denied.error };

    const normalized = normalizeCategoryInput(input);
    const error = validateCategoryInput(get().categories, normalized);
    if (error) return { ok: false, error };

    const restaurantId = get().restaurantId ?? DEMO_RESTAURANT_ID;
    const existingIds = new Set(
      get().categories.map((category) => category.id),
    );
    const category: Category = {
      id: uniqueEntityId(restaurantId, normalized.name, existingIds),
      restaurantId,
      name: normalized.name,
      color: normalized.color || DEFAULT_CATEGORY_COLOR,
      sortOrder: nextSortOrder(get().categories),
      ...(normalized.imageDataUrl
        ? { imageDataUrl: normalized.imageDataUrl }
        : {}),
    };

    set((state) => ({ categories: [...state.categories, category] }));
    get().persist();
    return { ok: true, category };
  },

  updateCategory: (categoryId, input) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return { ok: false, error: denied.error };

    const existing = get().categories.find(
      (category) => category.id === categoryId,
    );
    if (!existing) {
      return { ok: false, error: "Category not found." };
    }

    const normalized = normalizeCategoryInput(input);
    const error = validateCategoryInput(
      get().categories,
      normalized,
      categoryId,
    );
    if (error) return { ok: false, error };

    const category: Category = {
      ...existing,
      name: normalized.name,
      color: normalized.color || DEFAULT_CATEGORY_COLOR,
      imageDataUrl:
        normalized.imageDataUrl === undefined
          ? existing.imageDataUrl
          : normalized.imageDataUrl,
    };
    if (!category.imageDataUrl) {
      delete category.imageDataUrl;
    }

    set((state) => ({
      categories: state.categories.map((item) =>
        item.id === categoryId ? category : item,
      ),
    }));
    get().persist();
    return { ok: true, category };
  },

  removeCategory: (categoryId) => {
    const denied = assertCan(useAuthStore.getState().user?.role, "edit_menu");
    if (!denied.ok) return { ok: false, error: denied.error };

    const existing = get().categories.find(
      (category) => category.id === categoryId,
    );
    if (!existing) {
      return { ok: false, error: "Category not found." };
    }

    const hasProducts = get().products.some(
      (product) => product.categoryId === categoryId,
    );
    if (hasProducts) {
      return {
        ok: false,
        error: "Move or delete products in this category before removing it.",
      };
    }

    set((state) => ({
      categories: state.categories.filter(
        (category) => category.id !== categoryId,
      ),
    }));
    get().persist();
    return { ok: true, category: existing };
  },

  getProduct: (productId) =>
    get().products.find((product) => product.id === productId),
}));
