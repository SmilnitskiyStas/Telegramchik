export type ProductStatus =
  | "нове"
  | "перевірити"
  | "в роботі"
  | "на погодженні"
  | "вирішено"
  | "списано";

export type ProductCatalogItem = {
  id: string;
  name: string;
  category: string;
  barcode: string;
  imageUrl?: string;
};

export type ProductBatch = {
  id: string;
  productId: string;
  batch: string;
  storeId: string;
  quantity: number;
  receivedAt: string;
  expiresAt: string;
  status: ProductStatus;
  notes: string;
  receivedByUserId: string;
};

export type Product = ProductCatalogItem &
  Omit<ProductBatch, "productId"> & {
    productId: string;
    deliveryBatchId?: string;
    deliveryBatchLabel?: string;
    deliveryBatchNumber?: number;
    storeName?: string;
    receiverFullName?: string;
  };

export type DeliveryBatchStatus = "open" | "closed";

export type DeliveryBatch = {
  id: string;
  storeId: string;
  storeName: string;
  deliveryDate: string;
  batchNumber: number;
  status: DeliveryBatchStatus;
  label: string;
  createdByUserId?: string;
  createdByFullName?: string;
  createdAt: string;
  closedAt?: string | null;
  items: Product[];
};
