export type ProductStatus =
  | "нове"
  | "перевірити"
  | "в роботі"
  | "на погодженні"
  | "вирішено"
  | "списано";

export type Product = {
  id: string;
  productId: string;
  deliveryBatchId?: string;
  deliveryBatchLabel?: string;
  deliveryBatchNumber?: number;
  name: string;
  category: string;
  barcode: string;
  imageUrl?: string;
  batch: string;
  storeId: string;
  storeName?: string;
  quantity: number;
  receivedAt: string;
  expiresAt: string;
  status: ProductStatus;
  notes: string;
  receivedByUserId: string;
  receiverFullName?: string;
};

export type DeliveryBatchStatus = "open" | "closed";

export type DeliveryBatchItem = Product;

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
  items: DeliveryBatchItem[];
};
