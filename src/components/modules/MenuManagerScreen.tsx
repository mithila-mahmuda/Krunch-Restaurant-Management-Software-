"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  GripVertical,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { inventoryIngredientOptions } from "@/lib/branch-ops";
import {
  CATEGORY_COLOR_PRESETS,
  DEFAULT_CATEGORY_COLOR,
  resolveCategoryColor,
} from "@/lib/category-color";
import { compareSortOrder } from "@/lib/catalog-order";
import {
  imageFileFromClipboardData,
  tileImageFromFile,
} from "@/lib/catalog-image";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { categoryTileStyle, productTileStyle } from "@/lib/tile-style";
import { ModuleShell } from "@/components/modules/ModuleShell";
import { PosDialog } from "@/components/pos/PosDialog";
import { useTileReorder } from "@/hooks/useTileReorder";
import { useAuthStore } from "@/store/auth-store";
import { useCatalogStore } from "@/store/catalog-store";

type RecipeFormRow = { inventoryId: string; quantity: string };

const INGREDIENT_OPTIONS = inventoryIngredientOptions();

const fieldClass =
  "mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2";

export function MenuManagerScreen() {
  const categories = useCatalogStore((state) => state.categories);
  const products = useCatalogStore((state) => state.products);
  const toggleAvailability = useCatalogStore(
    (state) => state.toggleAvailability,
  );
  const setCategoryAvailability = useCatalogStore(
    (state) => state.setCategoryAvailability,
  );
  const reorderCategories = useCatalogStore((state) => state.reorderCategories);
  const reorderProducts = useCatalogStore((state) => state.reorderProducts);
  const addProduct = useCatalogStore((state) => state.addProduct);
  const updateProduct = useCatalogStore((state) => state.updateProduct);
  const duplicateProduct = useCatalogStore((state) => state.duplicateProduct);
  const removeProduct = useCatalogStore((state) => state.removeProduct);
  const addCategory = useCatalogStore((state) => state.addCategory);
  const updateCategory = useCatalogStore((state) => state.updateCategory);
  const removeCategory = useCatalogStore((state) => state.removeCategory);
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = can(role, "edit_menu");

  const [query, setQuery] = useState("");
  const [previewCategoryId, setPreviewCategoryId] = useState<string | null>(
    null,
  );

  const [productEditorOpen, setProductEditorOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAvailable, setFormAvailable] = useState(true);
  const [productColor, setProductColor] = useState<string>(
    DEFAULT_CATEGORY_COLOR,
  );
  const [productImageDataUrl, setProductImageDataUrl] = useState<string | null>(
    null,
  );
  const [recipeRows, setRecipeRows] = useState<RecipeFormRow[]>([]);
  const [productError, setProductError] = useState("");
  const [productImageError, setProductImageError] = useState("");

  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState<string>(
    DEFAULT_CATEGORY_COLOR,
  );
  const [categoryImageDataUrl, setCategoryImageDataUrl] = useState<
    string | null
  >(null);
  const [categoryError, setCategoryError] = useState("");
  const [categoryImageError, setCategoryImageError] = useState("");

  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const isEditingProduct = editingProductId !== null;
  const isEditingCategory = editingCategoryId !== null;
  const deleteProductTarget = deleteProductId
    ? products.find((product) => product.id === deleteProductId)
    : null;
  const deleteCategoryTarget = deleteCategoryId
    ? categories.find((category) => category.id === deleteCategoryId)
    : null;

  const q = query.trim().toLowerCase();

  const sortedCategories = useMemo(
    () => [...categories].sort(compareSortOrder),
    [categories],
  );

  const visibleCategories = useMemo(() => {
    if (!q) return sortedCategories;
    return sortedCategories.filter((category) => {
      if (category.name.toLowerCase().includes(q)) return true;
      return products.some(
        (product) =>
          product.categoryId === category.id &&
          (product.name.toLowerCase().includes(q) ||
            product.id.toLowerCase().includes(q)),
      );
    });
  }, [products, q, sortedCategories]);

  const previewCategory = categories.find(
    (category) => category.id === previewCategoryId,
  );

  const previewProducts = useMemo(() => {
    if (!previewCategoryId) return [];
    return products
      .filter((product) => {
        if (product.categoryId !== previewCategoryId) return false;
        if (!q) return true;
        return (
          product.name.toLowerCase().includes(q) ||
          product.id.toLowerCase().includes(q) ||
          Boolean(previewCategory?.name.toLowerCase().includes(q))
        );
      })
      .sort(compareSortOrder);
  }, [previewCategory?.name, previewCategoryId, products, q]);

  const visibleCategoryIds = useMemo(
    () => visibleCategories.map((category) => category.id),
    [visibleCategories],
  );
  const previewProductIds = useMemo(
    () => previewProducts.map((product) => product.id),
    [previewProducts],
  );

  const categoryReorder = useTileReorder({
    ids: visibleCategoryIds,
    enabled: canEdit && !q,
    onReorder: reorderCategories,
  });
  const productReorder = useTileReorder({
    ids: previewProductIds,
    enabled: canEdit && !q && Boolean(previewCategoryId),
    onReorder: (orderedIds) => {
      if (!previewCategoryId) return;
      reorderProducts(previewCategoryId, orderedIds);
    },
  });

  const orderedVisibleCategories = useMemo(() => {
    const byId = new Map(
      visibleCategories.map((category) => [category.id, category]),
    );
    return categoryReorder.displayIds
      .map((id) => byId.get(id))
      .filter((category): category is NonNullable<typeof category> =>
        Boolean(category),
      );
  }, [categoryReorder.displayIds, visibleCategories]);

  const orderedPreviewProducts = useMemo(() => {
    const byId = new Map(
      previewProducts.map((product) => [product.id, product]),
    );
    return productReorder.displayIds
      .map((id) => byId.get(id))
      .filter((product): product is NonNullable<typeof product> =>
        Boolean(product),
      );
  }, [previewProducts, productReorder.displayIds]);

  const hasAppliedDefaultCategory = useRef(false);

  useEffect(() => {
    if (sortedCategories.length === 0) {
      hasAppliedDefaultCategory.current = false;
      if (previewCategoryId !== null) setPreviewCategoryId(null);
      return;
    }

    const selectionIsValid =
      previewCategoryId !== null &&
      sortedCategories.some((category) => category.id === previewCategoryId);

    if (selectionIsValid) {
      hasAppliedDefaultCategory.current = true;
      return;
    }

    // Deleted or missing selection → fall back to the first category.
    if (previewCategoryId !== null) {
      setPreviewCategoryId(sortedCategories[0].id);
      return;
    }

    // First load: open the first category so its items are visible.
    if (!hasAppliedDefaultCategory.current) {
      hasAppliedDefaultCategory.current = true;
      setPreviewCategoryId(sortedCategories[0].id);
    }
  }, [previewCategoryId, sortedCategories]);

  function resetProductForm() {
    setProductError("");
    setProductImageError("");
    setName("");
    setPrice("");
    setCost("");
    const categoryId = previewCategoryId || categories[0]?.id || "";
    setFormCategoryId(categoryId);
    setFormAvailable(true);
    const category = categories.find((item) => item.id === categoryId);
    setProductColor(resolveCategoryColor(category));
    setProductImageDataUrl(null);
    setRecipeRows([]);
  }

  function openAddProduct() {
    if (categories.length === 0) {
      openAddCategory();
      return;
    }
    resetProductForm();
    setEditingProductId(null);
    setProductEditorOpen(true);
  }

  function openEditProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setProductError("");
    setProductImageError("");
    setEditingProductId(product.id);
    setName(product.name);
    setPrice(String(product.price));
    setCost(
      product.cost !== undefined && product.cost !== null
        ? String(product.cost)
        : "",
    );
    setFormCategoryId(product.categoryId);
    setFormAvailable(product.available !== false);
    const category = categories.find(
      (item) => item.id === product.categoryId,
    );
    setProductColor(
      product.color
        ? resolveCategoryColor({ color: product.color })
        : resolveCategoryColor(category),
    );
    setProductImageDataUrl(product.imageDataUrl ?? null);
    setRecipeRows(
      (product.recipe ?? []).map((step) => ({
        inventoryId: step.inventoryId,
        quantity: String(step.quantity),
      })),
    );
    setProductEditorOpen(true);
  }

  function saveProduct() {
    const parsedPrice = Number(price);
    const trimmedCost = cost.trim();
    const parsedCost =
      trimmedCost === "" ? null : Number(trimmedCost);
    const recipe = recipeRows.map((row) => ({
      inventoryId: row.inventoryId,
      quantity: Number(row.quantity),
    }));
    const payload = {
      name,
      price: parsedPrice,
      categoryId: formCategoryId,
      available: formAvailable,
      cost: parsedCost,
      color: productColor,
      imageDataUrl: productImageDataUrl,
      recipe,
    };
    const result = isEditingProduct
      ? updateProduct(editingProductId, payload)
      : addProduct(payload);

    if (!result.ok) {
      setProductError(result.error);
      return;
    }

    if (formCategoryId) {
      setPreviewCategoryId(formCategoryId);
    }
    setProductEditorOpen(false);
  }

  function handleDuplicateProduct() {
    if (!editingProductId) return;
    const result = duplicateProduct(editingProductId);
    if (!result.ok) {
      setProductError(result.error);
      return;
    }
    if (result.product.categoryId) {
      setPreviewCategoryId(result.product.categoryId);
    }
    openEditProduct(result.product.id);
  }

  async function onProductImageSelected(file: File | null) {
    setProductImageError("");
    if (!file) return;
    try {
      const dataUrl = await tileImageFromFile(file);
      setProductImageDataUrl(dataUrl);
    } catch (error) {
      setProductImageError(
        error instanceof Error ? error.message : "Could not read that image.",
      );
    }
  }

  async function onCategoryImageSelected(file: File | null) {
    setCategoryImageError("");
    if (!file) return;
    try {
      const dataUrl = await tileImageFromFile(file);
      setCategoryImageDataUrl(dataUrl);
    } catch (error) {
      setCategoryImageError(
        error instanceof Error ? error.message : "Could not read that image.",
      );
    }
  }

  useEffect(() => {
    if (!productEditorOpen && !categoryEditorOpen) return;

    function onPaste(event: ClipboardEvent) {
      const file = imageFileFromClipboardData(event.clipboardData);
      if (!file) return;

      const active = document.activeElement;
      const typingInField =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      const pastedText = event.clipboardData?.getData("text/plain")?.trim();
      if (typingInField && pastedText) return;

      event.preventDefault();
      if (productEditorOpen) {
        void onProductImageSelected(file);
        return;
      }
      void onCategoryImageSelected(file);
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [categoryEditorOpen, productEditorOpen]);

  function requestDeleteProduct() {
    if (!editingProductId) return;
    setDeleteError("");
    setDeleteProductId(editingProductId);
    setProductEditorOpen(false);
  }

  function cancelDeleteProduct() {
    const productId = deleteProductId;
    setDeleteProductId(null);
    setDeleteError("");
    if (productId) openEditProduct(productId);
  }

  function confirmDeleteProduct() {
    if (!deleteProductId) return;
    const result = removeProduct(deleteProductId);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setDeleteProductId(null);
    setEditingProductId(null);
  }

  function resetCategoryForm() {
    setCategoryError("");
    setCategoryImageError("");
    setCategoryName("");
    setCategoryColor(DEFAULT_CATEGORY_COLOR);
    setCategoryImageDataUrl(null);
  }

  function openAddCategory() {
    resetCategoryForm();
    setEditingCategoryId(null);
    setCategoryEditorOpen(true);
  }

  function openEditCategory(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    setCategoryError("");
    setCategoryImageError("");
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryColor(resolveCategoryColor(category));
    setCategoryImageDataUrl(category.imageDataUrl ?? null);
    setCategoryEditorOpen(true);
  }

  function saveCategory() {
    const result = isEditingCategory
      ? updateCategory(editingCategoryId, {
          name: categoryName,
          color: categoryColor,
          imageDataUrl: categoryImageDataUrl,
        })
      : addCategory({
          name: categoryName,
          color: categoryColor,
          imageDataUrl: categoryImageDataUrl,
        });

    if (!result.ok) {
      setCategoryError(result.error);
      return;
    }

    setPreviewCategoryId(result.category.id);
    setFormCategoryId(result.category.id);
    setCategoryEditorOpen(false);
  }

  function requestDeleteCategory() {
    if (!editingCategoryId) return;
    setDeleteError("");
    setDeleteCategoryId(editingCategoryId);
    setCategoryEditorOpen(false);
  }

  function cancelDeleteCategory() {
    const categoryId = deleteCategoryId;
    setDeleteCategoryId(null);
    setDeleteError("");
    if (categoryId) openEditCategory(categoryId);
  }

  function confirmDeleteCategory() {
    if (!deleteCategoryId) return;
    const categoryId = deleteCategoryId;
    const result = removeCategory(categoryId);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    if (previewCategoryId === categoryId) {
      const nextCategory = sortedCategories.find(
        (category) => category.id !== categoryId,
      );
      setPreviewCategoryId(nextCategory?.id ?? null);
    }
    setDeleteCategoryId(null);
    setEditingCategoryId(null);
  }

  const categoryPanelOpen = Boolean(previewCategoryId);
  const compactCategories = categoryPanelOpen;

  return (
    <ModuleShell title="Menu Manager" wide>
      <div className="mb-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search menu"
          className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-[var(--pos-accent)] focus:ring-2 sm:w-56"
        />
        {canEdit ? (
          <button
            type="button"
            onClick={openAddProduct}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--pos-header)] px-4 text-sm font-semibold text-pos-on-header hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Add product
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-300 bg-slate-100 shadow-sm">
        {categories.length === 0 && !canEdit ? (
          <div className="flex flex-1 items-center justify-center bg-slate-100 px-4 py-16 text-center">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                No categories yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Ask a manager to add categories and products.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 overflow-hidden bg-slate-100">
            <div
              className={`min-w-0 overflow-hidden ${
                categoryPanelOpen ? "w-1/2 border-r border-slate-200" : "w-full"
              }`}
            >
              <div
                ref={categoryReorder.containerRef}
                className={
                  compactCategories
                    ? "grid h-full grid-cols-1 content-start gap-2 overflow-auto overscroll-contain bg-slate-100 p-2 sm:grid-cols-2 sm:gap-3 sm:p-3"
                    : "grid h-full grid-cols-2 content-start gap-2 overflow-auto overscroll-contain bg-slate-100 p-2 sm:gap-3 sm:p-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                }
              >
                {canEdit ? (
                  <button
                    type="button"
                    onClick={openAddCategory}
                    aria-label="Add category"
                    className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-slate-300 bg-transparent px-2 py-3 text-slate-500 transition hover:border-slate-400 hover:bg-slate-200/60 hover:text-slate-700 active:scale-[0.98] sm:px-3 sm:py-4 ${
                      compactCategories
                        ? "min-h-[64px] sm:min-h-[80px] md:min-h-[88px]"
                        : "min-h-[80px] sm:min-h-[96px] md:min-h-[104px]"
                    }`}
                  >
                    <Plus className="h-6 w-6" strokeWidth={2} />
                    <span className="text-xs font-bold uppercase tracking-wide sm:text-sm">
                      Add category
                    </span>
                  </button>
                ) : null}
                {orderedVisibleCategories.map((category, index) => {
                  const isActive = previewCategoryId === category.id;
                  const reorder = categoryReorder.tileProps(category.id);
                  const categoryProducts = products.filter(
                    (product) => product.categoryId === category.id,
                  );
                  const unavailable =
                    categoryProducts.length > 0 &&
                    categoryProducts.every(
                      (product) => product.available === false,
                    );
                  return (
                    <div
                      key={category.id}
                      data-reorder-id={reorder["data-reorder-id"]}
                      data-dragging={reorder["data-dragging"]}
                      className={`relative ${reorder.className}`}
                      style={reorder.style}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (categoryReorder.isDragging) return;
                          setPreviewCategoryId(category.id);
                        }}
                        aria-pressed={isActive}
                        className={`pos-tile relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-md px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-white shadow-sm transition sm:px-3 sm:py-4 sm:text-sm md:text-base ${
                          compactCategories
                            ? "min-h-[64px] sm:min-h-[80px] md:min-h-[88px]"
                            : "min-h-[80px] sm:min-h-[96px] md:min-h-[104px]"
                        } ${
                          unavailable
                            ? ""
                            : "hover:brightness-105 active:scale-[0.98]"
                        } ${
                          isActive
                            ? "ring-2 ring-[var(--pos-header)] ring-offset-2 ring-offset-slate-100 brightness-110"
                            : ""
                        }`}
                        style={{
                          animationDelay: categoryReorder.isDragging
                            ? undefined
                            : `${index * 20}ms`,
                          ...categoryTileStyle(category),
                        }}
                      >
                        {unavailable ? (
                          <span
                            className="pointer-events-none absolute inset-0 bg-slate-950/50"
                            aria-hidden
                          />
                        ) : null}
                        <span className="relative z-[1]">{category.name}</span>
                        {unavailable ? (
                          <span className="relative z-[1] inline-flex items-center gap-1 rounded bg-slate-950/70 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white sm:text-xs">
                            <Ban
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={2.5}
                            />
                            Unavailable
                          </span>
                        ) : null}
                      </button>
                      {canEdit ? (
                        <>
                          {!q ? (
                            <button
                              type="button"
                              {...categoryReorder.handleProps(category.id)}
                              className="menu-tile-drag-handle absolute left-1.5 top-1.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40"
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!unavailable}
                            aria-label={
                              unavailable
                                ? `${category.name} is unavailable. Turn on to make all items available.`
                                : `${category.name} is available. Turn off to mark all items unavailable.`
                            }
                            onClick={() =>
                              setCategoryAvailability(
                                category.id,
                                unavailable,
                              )
                            }
                            className="absolute right-1.5 top-1.5 z-10"
                          >
                            <span
                              className={`relative block h-5 w-9 rounded-full shadow-sm transition ${
                                unavailable ? "bg-rose-500" : "bg-emerald-500"
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                                  unavailable ? "left-0.5" : "left-[1.125rem]"
                                }`}
                              />
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Edit ${category.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditCategory(category.id);
                            }}
                            className="absolute bottom-1.5 right-1.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  );
                })}
                {visibleCategories.length === 0 && (q || !canEdit) ? (
                  <p className="col-span-full px-4 py-16 text-center text-sm text-slate-500">
                    {q
                      ? "No categories match your search."
                      : "No categories yet."}
                  </p>
                ) : null}
              </div>
            </div>

            {previewCategoryId && previewCategory ? (
              <div className="flex min-w-0 w-1/2 flex-col overflow-hidden bg-slate-100">
                <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-slate-200 px-2 py-2.5 sm:gap-3 sm:px-3 sm:py-3">
                  <h2 className="min-w-0 flex-1 truncate text-base font-bold uppercase tracking-wide text-slate-800 sm:text-lg">
                    {previewCategory.name}
                  </h2>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => openEditCategory(previewCategory.id)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-md bg-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPreviewCategoryId(null)}
                    aria-label="Close products"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-200 text-slate-700 transition hover:bg-slate-300 active:scale-95"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div
                  ref={productReorder.containerRef}
                  className="grid flex-1 grid-cols-2 content-start gap-2 overflow-auto overscroll-contain p-2 sm:gap-3 sm:p-3 xl:grid-cols-3"
                >
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={openAddProduct}
                      aria-label="Add product"
                      className="flex min-h-[88px] w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-slate-300 bg-transparent px-2 py-3 text-slate-500 transition hover:border-slate-400 hover:bg-slate-200/60 hover:text-slate-700 active:scale-[0.98] sm:min-h-[96px] sm:px-3 sm:py-4"
                    >
                      <Plus className="h-6 w-6" strokeWidth={2} />
                      <span className="text-xs font-bold uppercase tracking-wide sm:text-sm">
                        Add item
                      </span>
                    </button>
                  ) : null}

                  {orderedPreviewProducts.map((product, index) => {
                    const unavailable = product.available === false;
                    const reorder = productReorder.tileProps(product.id);
                    return (
                      <div
                        key={product.id}
                        data-reorder-id={reorder["data-reorder-id"]}
                        data-dragging={reorder["data-dragging"]}
                        className={`relative ${reorder.className}`}
                        style={reorder.style}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (productReorder.isDragging) return;
                            if (canEdit) openEditProduct(product.id);
                          }}
                          className={`pos-tile relative flex min-h-[88px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md px-2 py-3 text-center text-white shadow-sm transition sm:min-h-[96px] sm:px-3 sm:py-4 ${
                            unavailable
                              ? ""
                              : "hover:brightness-105 active:scale-[0.98]"
                          } ${canEdit ? "" : "cursor-default"}`}
                          style={{
                            animationDelay: productReorder.isDragging
                              ? undefined
                              : `${index * 20}ms`,
                            ...productTileStyle(product, previewCategory),
                          }}
                        >
                          {unavailable ? (
                            <span
                              className="pointer-events-none absolute inset-0 bg-slate-950/50"
                              aria-hidden
                            />
                          ) : null}
                          <span className="relative z-[1] text-xs font-bold uppercase leading-tight tracking-wide sm:text-sm md:text-base">
                            {product.name}
                          </span>
                          {unavailable ? (
                            <span className="relative z-[1] inline-flex items-center gap-1 rounded bg-slate-950/70 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white sm:text-xs">
                              <Ban
                                className="h-3.5 w-3.5 shrink-0"
                                strokeWidth={2.5}
                              />
                              Unavailable
                            </span>
                          ) : (
                            <span className="relative z-[1] text-sm font-medium text-white/90">
                              {formatMoney(product.price)}
                            </span>
                          )}
                        </button>
                        {canEdit ? (
                          <>
                            {!q ? (
                              <button
                                type="button"
                                {...productReorder.handleProps(product.id)}
                                className="menu-tile-drag-handle absolute left-1.5 top-1.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!unavailable}
                              aria-label={
                                unavailable
                                  ? `${product.name} is unavailable. Turn on to make available.`
                                  : `${product.name} is available. Turn off to mark unavailable.`
                              }
                              onClick={() => toggleAvailability(product.id)}
                              className="absolute right-1.5 top-1.5 z-10"
                            >
                              <span
                                className={`relative block h-5 w-9 rounded-full shadow-sm transition ${
                                  unavailable ? "bg-rose-500" : "bg-emerald-500"
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                                    unavailable ? "left-0.5" : "left-[1.125rem]"
                                  }`}
                                />
                              </span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    );
                  })}

                  {previewProducts.length === 0 && (q || !canEdit) ? (
                    <p className="col-span-full px-4 py-10 text-center text-sm text-slate-500">
                      {q
                        ? "No products match your search in this category."
                        : "No products in this category yet."}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <PosDialog
        open={productEditorOpen}
        title={isEditingProduct ? "Edit product" : "Add product"}
        onClose={() => setProductEditorOpen(false)}
        headerActions={
          isEditingProduct ? (
            <button
              type="button"
              onClick={handleDuplicateProduct}
              className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              aria-label="Duplicate product"
              title="Duplicate"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Duplicate</span>
            </button>
          ) : null
        }
        footer={
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setProductEditorOpen(false)}
              className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveProduct}
              className="min-h-11 flex-1 rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header hover:brightness-110"
            >
              {isEditingProduct ? "Save changes" : "Save product"}
            </button>
          </div>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveProduct();
          }}
        >
          <button
            type="button"
            role="switch"
            aria-checked={formAvailable}
            onClick={() => setFormAvailable((value) => !value)}
            className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-3 text-left"
          >
            <span
              className={`text-sm font-semibold ${
                formAvailable ? "text-emerald-800" : "text-rose-700"
              }`}
            >
              {formAvailable ? "Available" : "Unavailable"}
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                formAvailable ? "bg-emerald-500" : "bg-rose-500"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                  formAvailable ? "left-[1.375rem]" : "left-0.5"
                }`}
              />
            </span>
          </button>
          <label className="block text-sm font-semibold text-slate-700">
            Category
            <select
              value={formCategoryId}
              onChange={(event) => setFormCategoryId(event.target.value)}
              className={fieldClass}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Flat White"
              autoFocus
              className={fieldClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              Price
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="e.g. 3.50"
                inputMode="decimal"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Cost
              <input
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="Optional"
                inputMode="decimal"
                className={fieldClass}
              />
            </label>
          </div>
          {cost.trim() !== "" &&
          Number.isFinite(Number(price)) &&
          Number.isFinite(Number(cost)) ? (
            <p className="text-xs text-slate-500">
              Margin after cost:{" "}
              <span className="font-semibold text-slate-700">
                {formatMoney(Number(price) - Number(cost))}
              </span>
            </p>
          ) : null}

          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">
              Colour & image
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              Colour fills the till tile. Optional image: upload or paste
              (Ctrl/Cmd+V).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORY_COLOR_PRESETS.map((preset) => {
                const selected = productColor === preset.value;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-label={preset.label}
                    aria-pressed={selected}
                    title={preset.label}
                    onClick={() => setProductColor(preset.value)}
                    className={`relative h-10 w-10 rounded-md shadow-sm transition ${
                      selected
                        ? "ring-2 ring-[var(--pos-header)] ring-offset-2"
                        : "hover:brightness-110"
                    }`}
                    style={{ backgroundColor: preset.value }}
                  >
                    {selected ? (
                      <Check
                        className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow"
                        strokeWidth={3}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
              <label
                className="relative flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-white text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:border-slate-400 hover:bg-slate-50"
                title="Custom colour"
              >
                <span className="pointer-events-none">Custom</span>
                <input
                  type="color"
                  value={productColor}
                  onChange={(event) => setProductColor(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Custom colour"
                />
              </label>
              <label
                className={`relative flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed text-slate-500 hover:border-slate-400 hover:bg-slate-50 ${
                  productImageDataUrl
                    ? "border-[var(--pos-header)] ring-2 ring-[var(--pos-header)] ring-offset-2"
                    : "border-slate-300 bg-white"
                }`}
                title="Tile image"
                style={
                  productImageDataUrl
                    ? productTileStyle(
                        {
                          color: productColor,
                          imageDataUrl: productImageDataUrl,
                        },
                        categories.find(
                          (category) => category.id === formCategoryId,
                        ),
                      )
                    : undefined
                }
              >
                <ImagePlus
                  className={`h-4 w-4 ${productImageDataUrl ? "text-white drop-shadow" : ""}`}
                />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Upload item image"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void onProductImageSelected(file);
                    event.target.value = "";
                  }}
                />
              </label>
              {productImageDataUrl ? (
                <button
                  type="button"
                  onClick={() => setProductImageDataUrl(null)}
                  className="h-10 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Remove image
                </button>
              ) : null}
            </div>
            {productImageError ? (
              <p className="mt-2 text-xs text-rose-700">{productImageError}</p>
            ) : null}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">
              Ingredients
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              Amounts used from inventory each time this item is sold.
            </p>
            <div className="mt-2 space-y-2">
              {recipeRows.map((row, index) => {
                const unit =
                  INGREDIENT_OPTIONS.find(
                    (option) => option.id === row.inventoryId,
                  )?.unit ?? "";
                return (
                  <div
                    key={`recipe-${index}`}
                    className="grid grid-cols-[1fr_5.5rem_auto] gap-2"
                  >
                    <select
                      value={row.inventoryId}
                      onChange={(event) => {
                        const inventoryId = event.target.value;
                        setRecipeRows((rows) =>
                          rows.map((item, rowIndex) =>
                            rowIndex === index
                              ? { ...item, inventoryId }
                              : item,
                          ),
                        );
                      }}
                      className={fieldClass}
                    >
                      {INGREDIENT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={row.quantity}
                      onChange={(event) => {
                        const quantity = event.target.value;
                        setRecipeRows((rows) =>
                          rows.map((item, rowIndex) =>
                            rowIndex === index ? { ...item, quantity } : item,
                          ),
                        );
                      }}
                      inputMode="decimal"
                      aria-label={`Quantity in ${unit || "units"}`}
                      placeholder={unit || "Qty"}
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      aria-label="Remove ingredient"
                      onClick={() =>
                        setRecipeRows((rows) =>
                          rows.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                      className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                setRecipeRows((rows) => [
                  ...rows,
                  {
                    inventoryId: INGREDIENT_OPTIONS[0]?.id ?? "i1",
                    quantity: "1",
                  },
                ])
              }
              className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add ingredient
            </button>
          </fieldset>

          {productError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {productError}
            </p>
          ) : null}
          {isEditingProduct ? (
            <div className="border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={requestDeleteProduct}
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete this product
              </button>
            </div>
          ) : null}
        </form>
      </PosDialog>

      <PosDialog
        open={categoryEditorOpen}
        title={isEditingCategory ? "Edit category" : "Add category"}
        onClose={() => setCategoryEditorOpen(false)}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setCategoryEditorOpen(false)}
              className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveCategory}
              className="min-h-11 flex-1 rounded-md bg-[var(--pos-header)] text-sm font-semibold text-pos-on-header hover:brightness-110"
            >
              {isEditingCategory ? "Save changes" : "Save category"}
            </button>
          </div>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveCategory();
          }}
        >
          <label className="block text-sm font-semibold text-slate-700">
            Name
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="e.g. Hot Drinks"
              autoFocus
              className={fieldClass}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">
              Colour & image
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              Colour fills the till tile. Optional image: upload or paste
              (Ctrl/Cmd+V). Used for this category and its items.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORY_COLOR_PRESETS.map((preset) => {
                const selected = categoryColor === preset.value;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-label={preset.label}
                    aria-pressed={selected}
                    title={preset.label}
                    onClick={() => setCategoryColor(preset.value)}
                    className={`relative h-10 w-10 rounded-md shadow-sm transition ${
                      selected
                        ? "ring-2 ring-[var(--pos-header)] ring-offset-2"
                        : "hover:brightness-110"
                    }`}
                    style={{ backgroundColor: preset.value }}
                  >
                    {selected ? (
                      <Check
                        className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow"
                        strokeWidth={3}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
              <label
                className="relative flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-white text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:border-slate-400 hover:bg-slate-50"
                title="Custom colour"
              >
                <span className="pointer-events-none">Custom</span>
                <input
                  type="color"
                  value={categoryColor}
                  onChange={(event) => setCategoryColor(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Custom colour"
                />
              </label>
              <label
                className={`relative flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed text-slate-500 hover:border-slate-400 hover:bg-slate-50 ${
                  categoryImageDataUrl
                    ? "border-[var(--pos-header)] ring-2 ring-[var(--pos-header)] ring-offset-2"
                    : "border-slate-300 bg-white"
                }`}
                title="Tile image"
                style={
                  categoryImageDataUrl
                    ? categoryTileStyle({
                        color: categoryColor,
                        imageDataUrl: categoryImageDataUrl,
                      })
                    : undefined
                }
              >
                <ImagePlus
                  className={`h-4 w-4 ${categoryImageDataUrl ? "text-white drop-shadow" : ""}`}
                />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Upload category image"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void onCategoryImageSelected(file);
                    event.target.value = "";
                  }}
                />
              </label>
              {categoryImageDataUrl ? (
                <button
                  type="button"
                  onClick={() => setCategoryImageDataUrl(null)}
                  className="h-10 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Remove image
                </button>
              ) : null}
            </div>
            {categoryImageError ? (
              <p className="mt-2 text-xs text-rose-700">{categoryImageError}</p>
            ) : null}
          </fieldset>
          {categoryError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {categoryError}
            </p>
          ) : null}
          {isEditingCategory ? (
            <div className="border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={requestDeleteCategory}
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete this category
              </button>
            </div>
          ) : null}
        </form>
      </PosDialog>

      <PosDialog
        open={Boolean(deleteProductTarget)}
        title="Delete product?"
        onClose={cancelDeleteProduct}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={cancelDeleteProduct}
              className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm font-semibold hover:bg-slate-50"
            >
              Keep product
            </button>
            <button
              type="button"
              onClick={confirmDeleteProduct}
              className="min-h-11 flex-1 rounded-md bg-rose-700 text-sm font-semibold text-white hover:bg-rose-800"
            >
              Delete forever
            </button>
          </div>
        }
      >
        {deleteProductTarget ? (
          <p className="text-sm text-slate-600">
            Remove{" "}
            <span className="font-semibold">{deleteProductTarget.name}</span>{" "}
            from the menu? It will no longer appear on the POS till.
          </p>
        ) : null}
        {deleteError ? (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {deleteError}
          </p>
        ) : null}
      </PosDialog>

      <PosDialog
        open={Boolean(deleteCategoryTarget)}
        title="Delete category?"
        onClose={cancelDeleteCategory}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={cancelDeleteCategory}
              className="min-h-11 flex-1 rounded-md border border-slate-300 text-sm font-semibold hover:bg-slate-50"
            >
              Keep category
            </button>
            <button
              type="button"
              onClick={confirmDeleteCategory}
              className="min-h-11 flex-1 rounded-md bg-rose-700 text-sm font-semibold text-white hover:bg-rose-800"
            >
              Delete forever
            </button>
          </div>
        }
      >
        {deleteCategoryTarget ? (
          <p className="text-sm text-slate-600">
            Remove{" "}
            <span className="font-semibold">{deleteCategoryTarget.name}</span>?
            Categories with products must be emptied first.
          </p>
        ) : null}
        {deleteError ? (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {deleteError}
          </p>
        ) : null}
      </PosDialog>
    </ModuleShell>
  );
}
