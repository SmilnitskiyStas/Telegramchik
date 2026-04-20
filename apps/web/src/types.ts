export type ProductStatus =
  | "нове"
  | "перевірити"
  | "в роботі"
  | "на погодженні"
  | "вирішено"
  | "списано";

export type Product = {
  id: string;
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
