import { Product, ProductBatch, ProductCatalogItem } from "./types.js";

export const productCatalog: ProductCatalogItem[] = [
  {
    id: "prd-1",
    name: "Молоко 2.5%",
    category: "Молочні продукти",
    barcode: "4820000012345",
    imageUrl: "https://placehold.co/160x160/f4efe5/17324d?text=%D0%9C%D0%BE%D0%BB%D0%BE%D0%BA%D0%BE",
  },
  {
    id: "prd-2",
    name: "Йогурт полуниця",
    category: "Йогурти",
    barcode: "4820000098765",
    imageUrl: "https://placehold.co/160x160/e9f5f8/0f5f79?text=%D0%99%D0%BE%D0%B3%D1%83%D1%80%D1%82",
  },
];

export const productBatches: ProductBatch[] = [
  {
    id: "batch-1",
    productId: "prd-1",
    batch: "2026-04-10",
    storeId: "store-2",
    quantity: 18,
    receivedAt: "2026-04-10",
    expiresAt: "2026-04-20",
    status: "перевірити",
    notes: "Тестовий товар для MVP",
    receivedByUserId: "emp-2",
  },
  {
    id: "batch-2",
    productId: "prd-2",
    batch: "2026-04-08",
    storeId: "store-2",
    quantity: 9,
    receivedAt: "2026-04-08",
    expiresAt: "2026-04-14",
    status: "в роботі",
    notes: "Потрібно узгодити акцію",
    receivedByUserId: "emp-2",
  },
];

export function getJoinedProducts(): Product[] {
  return productBatches.flatMap((batch) => {
    const catalogItem = productCatalog.find((product) => product.id === batch.productId);

    if (!catalogItem) {
      return [];
    }

    return [
      {
        ...catalogItem,
        ...batch,
      },
    ];
  });
}

export function findJoinedProductByBatchId(batchId: string) {
  return getJoinedProducts().find((product) => product.id === batchId) ?? null;
}

export function findBatchById(batchId: string) {
  return productBatches.find((batch) => batch.id === batchId) ?? null;
}

export function findCatalogItemByBarcode(barcode: string) {
  const cleanBarcode = barcode.trim();
  return productCatalog.find((product) => product.barcode === cleanBarcode) ?? null;
}

export function createCatalogItem(input: Omit<ProductCatalogItem, "id">) {
  const catalogItem: ProductCatalogItem = {
    id: `prd-${Date.now()}`,
    ...input,
  };

  productCatalog.unshift(catalogItem);
  return catalogItem;
}

export function createProductBatch(input: Omit<ProductBatch, "id">) {
  const batch: ProductBatch = {
    id: `batch-${Date.now()}`,
    ...input,
  };

  productBatches.unshift(batch);
  return batch;
}
