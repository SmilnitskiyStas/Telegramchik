export type Store = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

export const stores: Store[] = [
  {
    id: "store-1",
    code: "M1/1",
    name: "Магазин Поділ",
    isActive: true,
  },
  {
    id: "store-2",
    code: "M2",
    name: "Магазин Оболонь",
    isActive: true,
  },
  {
    id: "store-3",
    code: "M3",
    name: "Магазин Лівобережна",
    isActive: true,
  },
];

export function findStoreById(id: string) {
  return stores.find((store) => store.id === id) ?? null;
}
