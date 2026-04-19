import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Product } from "./types";

type LayoutObjectType = "shelf" | "fridge" | "cashier" | "passage";

type LayoutShelf = {
  level: number;
  name: string;
  status: "ok" | "warning" | "critical";
  products: string[];
};

type LayoutObject = {
  id: string;
  name: string;
  type: LayoutObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  shelves: LayoutShelf[];
};

type StoreLayoutDraft = {
  id: string;
  name: string;
  code: string;
  rows: number;
  cols: number;
  cellSize: number;
  objects: LayoutObject[];
  updatedAt: string;
};

type Props = {
  onBack: () => void;
  products: Product[];
};

type DragState = {
  objectIds: string[];
  startPointerX: number;
  startPointerY: number;
  origins: Array<{
    objectId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
};

type ResizeState = {
  objectId: string;
  startPointerX: number;
  startPointerY: number;
  startWidth: number;
  startHeight: number;
};

type SelectionBoxState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  keepExisting: boolean;
};

const STORAGE_KEY = "telegramchick-store-layouts";
const DB_NAME = "telegramchick-store-layout-db";
const DB_VERSION = 1;
const DRAFT_STORE_NAME = "drafts";

const objectTypeOptions: Array<{ value: LayoutObjectType; label: string }> = [
  { value: "shelf", label: "Стелаж" },
  { value: "fridge", label: "Холодильник" },
  { value: "cashier", label: "Каса" },
  { value: "passage", label: "Прохід" },
];

function createShelves(type: LayoutObjectType) {
  if (type === "shelf") {
    return [
      { level: 1, name: "Полиця 1", status: "ok" as const, products: [] },
      { level: 2, name: "Полиця 2", status: "ok" as const, products: [] },
      { level: 3, name: "Полиця 3", status: "ok" as const, products: [] },
    ];
  }

  return [];
}

function createObject(type: LayoutObjectType, x = 0, y = 0): LayoutObject {
  const baseSize =
    type === "cashier"
      ? { width: 2, height: 1 }
      : type === "passage"
        ? { width: 3, height: 1 }
        : { width: 2, height: 2 };

  return {
    id: `obj-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name:
      type === "shelf"
        ? "Новий стелаж"
        : type === "fridge"
          ? "Новий холодильник"
          : type === "cashier"
            ? "Нова каса"
            : "Новий прохід",
    type,
    x,
    y,
    width: baseSize.width,
    height: baseSize.height,
    shelves: createShelves(type),
  };
}

function createDraft(): StoreLayoutDraft {
  return {
    id: `layout-${Date.now()}`,
    name: "Новий магазин",
    code: `M-${new Date().getTime().toString().slice(-4)}`,
    rows: 10,
    cols: 14,
    cellSize: 36,
    objects: [
      createObject("shelf", 1, 1),
      createObject("fridge", 5, 2),
      createObject("cashier", 10, 8),
    ],
    updatedAt: new Date().toISOString(),
  };
}

function clampObjectToGrid(object: LayoutObject, rows: number, cols: number): LayoutObject {
  const width = Math.max(1, Math.min(object.width, cols));
  const height = Math.max(1, Math.min(object.height, rows));

  return {
    ...object,
    width,
    height,
    x: Math.max(0, Math.min(object.x, cols - width)),
    y: Math.max(0, Math.min(object.y, rows - height)),
  };
}

function normalizeDraft(draft: StoreLayoutDraft) {
  return {
    ...draft,
    objects: (draft.objects ?? []).map((object) =>
      clampObjectToGrid(
        {
          ...object,
          shelves: (object.shelves ?? []).map((shelf, index) => ({
            level: shelf.level ?? index + 1,
            name: shelf.name ?? `Полиця ${shelf.level ?? index + 1}`,
            status: shelf.status ?? "ok",
            products: Array.isArray(shelf.products) ? shelf.products : [],
          })),
        },
        draft.rows,
        draft.cols,
      ),
    ),
  };
}

function readDraftsFromLocalStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [createDraft()];
    }

    const parsed = JSON.parse(raw) as StoreLayoutDraft[];
    if (!Array.isArray(parsed) || !parsed.length) {
      return [createDraft()];
    }

    return parsed.map(normalizeDraft);
  } catch {
    return [createDraft()];
  }
}

function saveDraftsToLocalStorage(drafts: StoreLayoutDraft[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        database.createObjectStore(DRAFT_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

async function readDraftsFromIndexedDb() {
  const database = await openDraftDatabase();

  return new Promise<StoreLayoutDraft[]>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE_NAME, "readonly");
    const store = transaction.objectStore(DRAFT_STORE_NAME);
    const request = store.get("layouts");

    request.onsuccess = () => {
      const value = request.result;
      database.close();

      if (!Array.isArray(value) || !value.length) {
        resolve([]);
        return;
      }

      resolve((value as StoreLayoutDraft[]).map(normalizeDraft));
    };

    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Failed to read drafts from IndexedDB"));
    };
  });
}

async function saveDraftsToIndexedDb(drafts: StoreLayoutDraft[]) {
  const database = await openDraftDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(DRAFT_STORE_NAME);

    store.put(drafts, "layouts");

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Failed to save drafts to IndexedDB"));
    };
  });
}

function getObjectClass(type: LayoutObjectType, selected: boolean) {
  const selectedClass = selected ? " layoutObjectSelected" : "";

  switch (type) {
    case "shelf":
      return `layoutObject layoutObjectShelf${selectedClass}`;
    case "fridge":
      return `layoutObject layoutObjectFridge${selectedClass}`;
    case "cashier":
      return `layoutObject layoutObjectCashier${selectedClass}`;
    default:
      return `layoutObject layoutObjectPassage${selectedClass}`;
  }
}

export function StoreLayoutPage({ onBack, products }: Props) {
  const [drafts, setDrafts] = useState<StoreLayoutDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string>("");
  const [selectedType, setSelectedType] = useState<LayoutObjectType>("shelf");
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null);
  const [copiedObject, setCopiedObject] = useState<LayoutObject | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorShelfLevel, setEditorShelfLevel] = useState<number>(1);
  const [editorSlotIndex, setEditorSlotIndex] = useState<number>(0);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDrafts() {
      try {
        const indexedDbDrafts = await readDraftsFromIndexedDb();
        const nextDrafts = indexedDbDrafts.length
          ? indexedDbDrafts
          : readDraftsFromLocalStorage();

        if (!indexedDbDrafts.length) {
          await saveDraftsToIndexedDb(nextDrafts);
        }

        if (cancelled) {
          return;
        }

        setDrafts(nextDrafts);
        setActiveDraftId(nextDrafts[0]?.id ?? "");
        setSelectedObjectIds(nextDrafts[0]?.objects[0]?.id ? [nextDrafts[0].objects[0].id] : []);
      } catch {
        const fallbackDrafts = readDraftsFromLocalStorage();
        if (cancelled) {
          return;
        }

        setDrafts(fallbackDrafts);
        setActiveDraftId(fallbackDrafts[0]?.id ?? "");
        setSelectedObjectIds(
          fallbackDrafts[0]?.objects[0]?.id ? [fallbackDrafts[0].objects[0].id] : [],
        );
      }
    }

    void loadDrafts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!drafts.length) {
      return;
    }

    saveDraftsToLocalStorage(drafts);
    void saveDraftsToIndexedDb(drafts);
  }, [drafts]);

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) ?? drafts[0] ?? null,
    [activeDraftId, drafts],
  );

  const selectedObjects = useMemo(
    () => activeDraft?.objects.filter((object) => selectedObjectIds.includes(object.id)) ?? [],
    [activeDraft, selectedObjectIds],
  );

  const selectedObject = selectedObjects[0] ?? null;
  const hasMultipleSelection = selectedObjects.length > 1;
  const activeEditorShelf =
    selectedObject?.shelves.find((shelf) => shelf.level === editorShelfLevel) ?? selectedObject?.shelves[0] ?? null;
  const activeEditorProduct = getProductById(activeEditorShelf?.products[editorSlotIndex] ?? "");

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const activeDrag = dragState;

    function handleMouseMove(event: globalThis.MouseEvent) {
      setDrafts((current) =>
        current.map((draft) => {
          if (draft.id !== activeDraftId) {
            return draft;
          }

          if (!activeDrag.origins.length) {
            return draft;
          }

          const deltaX = event.clientX - activeDrag.startPointerX;
          const deltaY = event.clientY - activeDrag.startPointerY;
          const offsetX = Math.round(deltaX / draft.cellSize);
          const offsetY = Math.round(deltaY / draft.cellSize);
          const minAllowedOffsetX = Math.max(...activeDrag.origins.map((origin) => -origin.x));
          const maxAllowedOffsetX = Math.min(
            ...activeDrag.origins.map((origin) => draft.cols - origin.width - origin.x),
          );
          const minAllowedOffsetY = Math.max(...activeDrag.origins.map((origin) => -origin.y));
          const maxAllowedOffsetY = Math.min(
            ...activeDrag.origins.map((origin) => draft.rows - origin.height - origin.y),
          );
          const clampedOffsetX = Math.max(
            minAllowedOffsetX,
            Math.min(offsetX, maxAllowedOffsetX),
          );
          const clampedOffsetY = Math.max(
            minAllowedOffsetY,
            Math.min(offsetY, maxAllowedOffsetY),
          );

          return {
            ...draft,
            updatedAt: new Date().toISOString(),
            objects: draft.objects.map((object) => {
              const origin = activeDrag.origins.find((item) => item.objectId === object.id);
              if (!origin) {
                return object;
              }

              return {
                ...object,
                x: origin.x + clampedOffsetX,
                y: origin.y + clampedOffsetY,
              };
            }),
          };
        }),
      );
    }

    function handleMouseUp() {
      setDragState(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeDraftId, dragState]);

  useEffect(() => {
    if (!activeDraft) {
      return;
    }

    setSelectedObjectIds((current) =>
      current.filter((objectId) => activeDraft.objects.some((object) => object.id === objectId)),
    );
  }, [activeDraft]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const activeResize = resizeState;

    function handleMouseMove(event: globalThis.MouseEvent) {
      setDrafts((current) =>
        current.map((draft) => {
          if (draft.id !== activeDraftId) {
            return draft;
          }

          const resizedObject = draft.objects.find((object) => object.id === activeResize.objectId);
          if (!resizedObject) {
            return draft;
          }

          const deltaX = event.clientX - activeResize.startPointerX;
          const deltaY = event.clientY - activeResize.startPointerY;
          const snappedWidth = Math.round(
            (activeResize.startWidth * draft.cellSize + deltaX) / draft.cellSize,
          );
          const snappedHeight = Math.round(
            (activeResize.startHeight * draft.cellSize + deltaY) / draft.cellSize,
          );
          const nextWidth = Math.max(1, Math.min(snappedWidth, draft.cols - resizedObject.x));
          const nextHeight = Math.max(1, Math.min(snappedHeight, draft.rows - resizedObject.y));

          return {
            ...draft,
            updatedAt: new Date().toISOString(),
            objects: draft.objects.map((object) =>
              object.id === activeResize.objectId
                ? {
                    ...object,
                    width: nextWidth,
                    height: nextHeight,
                  }
                : object,
            ),
          };
        }),
      );
    }

    function handleMouseUp() {
      setResizeState(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeDraftId, resizeState]);

  useEffect(() => {
    if (!selectionBox || !activeDraft) {
      return;
    }

    const activeSelectionBox = selectionBox;

    function handleMouseMove(event: globalThis.MouseEvent) {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const bounds = stage.getBoundingClientRect();
      const nextX = Math.max(0, Math.min(event.clientX - bounds.left, bounds.width));
      const nextY = Math.max(0, Math.min(event.clientY - bounds.top, bounds.height));

      setSelectionBox((current) =>
        current
          ? {
              ...current,
              currentX: nextX,
              currentY: nextY,
            }
          : current,
      );
    }

    function handleMouseUp() {
      const minX = Math.min(activeSelectionBox.startX, activeSelectionBox.currentX);
      const maxX = Math.max(activeSelectionBox.startX, activeSelectionBox.currentX);
      const minY = Math.min(activeSelectionBox.startY, activeSelectionBox.currentY);
      const maxY = Math.max(activeSelectionBox.startY, activeSelectionBox.currentY);

      const selectedFromBox = activeDraft.objects
        .filter((object) => {
          const objectLeft = object.x * activeDraft.cellSize;
          const objectTop = object.y * activeDraft.cellSize;
          const objectRight = objectLeft + object.width * activeDraft.cellSize - 4;
          const objectBottom = objectTop + object.height * activeDraft.cellSize - 4;

          return !(
            objectRight < minX ||
            objectLeft > maxX ||
            objectBottom < minY ||
            objectTop > maxY
          );
        })
        .map((object) => object.id);

      setSelectedObjectIds((current) => {
        if (activeSelectionBox.keepExisting) {
          return Array.from(new Set([...current, ...selectedFromBox]));
        }

        return selectedFromBox;
      });

      setSelectionBox(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeDraft, selectionBox]);

  function updateActiveDraft(updater: (draft: StoreLayoutDraft) => StoreLayoutDraft) {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== activeDraft?.id) {
          return draft;
        }

        const nextDraft = normalizeDraft(updater(draft));
        return {
          ...nextDraft,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }

  function handleCreateDraft() {
    const nextDraft = createDraft();
    setDrafts((current) => [nextDraft, ...current]);
    setActiveDraftId(nextDraft.id);
    setSelectedObjectIds(nextDraft.objects[0]?.id ? [nextDraft.objects[0].id] : []);
  }

  function handleResizeGrid(rows: number, cols: number) {
    updateActiveDraft((draft) => ({
      ...draft,
      rows: Math.max(4, rows),
      cols: Math.max(4, cols),
    }));
  }

  function handleAddObject() {
    if (!activeDraft) {
      return;
    }

    const nextObject = createObject(selectedType, 0, 0);

    updateActiveDraft((draft) => ({
      ...draft,
      objects: [...draft.objects, nextObject],
    }));

    setSelectedObjectIds([nextObject.id]);
  }

  function handleDeleteObject() {
    if (!activeDraft || !selectedObjectIds.length) {
      return;
    }

    updateActiveDraft((draft) => ({
      ...draft,
      objects: draft.objects.filter((object) => !selectedObjectIds.includes(object.id)),
    }));

    const nextSelected = activeDraft.objects.find((object) => !selectedObjectIds.includes(object.id));
    setSelectedObjectIds(nextSelected?.id ? [nextSelected.id] : []);
  }

  function handleCopyObject() {
    if (!selectedObject || hasMultipleSelection) {
      return;
    }

    setCopiedObject({
      ...selectedObject,
      shelves: selectedObject.shelves.map((shelf) => ({ ...shelf })),
    });
  }

  function handlePasteObject() {
    if (!activeDraft || !copiedObject) {
      return;
    }

    const nextObject = clampObjectToGrid(
      {
        ...copiedObject,
        id: `obj-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        name: `${copiedObject.name} копія`,
        x: copiedObject.x + 1,
        y: copiedObject.y + 1,
        shelves: copiedObject.shelves.map((shelf) => ({ ...shelf })),
      },
      activeDraft.rows,
      activeDraft.cols,
    );

    updateActiveDraft((draft) => ({
      ...draft,
      objects: [...draft.objects, nextObject],
    }));

    setSelectedObjectIds([nextObject.id]);
  }

  function handleSelectAll() {
    if (!activeDraft) {
      return;
    }

    setSelectedObjectIds(activeDraft.objects.map((object) => object.id));
  }

  function handleClearSelection() {
    setSelectedObjectIds([]);
  }

  function handleObjectSelect(objectId: string, keepExisting: boolean) {
    setSelectedObjectIds((current) => {
      if (keepExisting) {
        if (current.includes(objectId)) {
          return current.filter((id) => id !== objectId);
        }

        return [...current, objectId];
      }

      return [objectId];
    });
  }

  function handleStageMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const bounds = stage.getBoundingClientRect();
    const startX = Math.max(0, Math.min(event.clientX - bounds.left, bounds.width));
    const startY = Math.max(0, Math.min(event.clientY - bounds.top, bounds.height));

    setDragState(null);
    setResizeState(null);
    setSelectionBox({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      keepExisting: event.shiftKey,
    });

    if (!event.shiftKey) {
      setSelectedObjectIds([]);
    }
  }

  function handleDragStart(event: ReactMouseEvent<HTMLButtonElement>, object: LayoutObject) {
    event.preventDefault();
    event.stopPropagation();
    const keepExisting = event.shiftKey;
    const activeSelection =
      keepExisting
        ? selectedObjectIds.includes(object.id)
          ? selectedObjectIds
          : [...selectedObjectIds, object.id]
        : selectedObjectIds.includes(object.id)
          ? selectedObjectIds
          : [object.id];

    setResizeState(null);
    setSelectedObjectIds(activeSelection);

    const dragObjects =
      activeDraft?.objects.filter((item) => activeSelection.includes(item.id)) ?? [object];

    setDragState({
      objectIds: dragObjects.map((item) => item.id),
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      origins: dragObjects.map((item) => ({
        objectId: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      })),
    });
  }

  function handleResizeStart(event: ReactMouseEvent<HTMLSpanElement>, object: LayoutObject) {
    event.preventDefault();
    event.stopPropagation();
    setDragState(null);
    setSelectedObjectIds([object.id]);
    setResizeState({
      objectId: object.id,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startWidth: object.width,
      startHeight: object.height,
    });
  }

  function updateSelectedObject(updater: (object: LayoutObject) => LayoutObject) {
    if (!selectedObject || hasMultipleSelection) {
      return;
    }

    updateActiveDraft((draft) => ({
      ...draft,
      objects: draft.objects.map((object) =>
        object.id === selectedObject.id ? updater(object) : object,
      ),
    }));
  }

  function handleOpenEditor() {
    if (!selectedObject || hasMultipleSelection) {
      return;
    }

    setEditorShelfLevel(selectedObject.shelves[0]?.level ?? 1);
    setEditorSlotIndex(0);
    setIsEditorOpen(true);
  }

  function handleCloseEditor() {
    setIsEditorOpen(false);
  }

  function updateSelectedShelf(
    shelfLevel: number,
    updater: (shelf: LayoutShelf, index: number) => LayoutShelf,
  ) {
    updateSelectedObject((object) => ({
      ...object,
      shelves: object.shelves.map((shelf, index) =>
        shelf.level === shelfLevel ? updater(shelf, index) : shelf,
      ),
    }));
  }

  function handleAddShelf() {
    updateSelectedObject((object) => ({
      ...object,
      shelves: [
        ...object.shelves,
        {
          level: object.shelves.length + 1,
          name: `Полиця ${object.shelves.length + 1}`,
          status: "ok",
          products: [],
        },
      ],
    }));
  }

  function handleRemoveShelf(shelfLevel: number) {
    updateSelectedObject((object) => ({
      ...object,
      shelves: object.shelves
        .filter((shelf) => shelf.level !== shelfLevel)
        .map((shelf, index) => ({
          ...shelf,
          level: index + 1,
          name: shelf.name || `Полиця ${index + 1}`,
        })),
    }));
  }

  function handleAddShelfProduct(shelfLevel: number) {
    const fallbackProductId = products[0]?.id ?? "";
    if (!fallbackProductId) {
      return;
    }

    updateSelectedShelf(shelfLevel, (currentShelf) => ({
      ...currentShelf,
      products: [...currentShelf.products, fallbackProductId],
    }));
  }

  function handleShelfProductChange(shelfLevel: number, productIndex: number, productId: string) {
    updateSelectedShelf(shelfLevel, (currentShelf) => ({
      ...currentShelf,
      products: currentShelf.products.map((currentProductId, index) =>
        index === productIndex ? productId : currentProductId,
      ),
    }));
  }

  function handleRemoveShelfProduct(shelfLevel: number, productIndex: number) {
    updateSelectedShelf(shelfLevel, (currentShelf) => ({
      ...currentShelf,
      products: currentShelf.products.filter((_, index) => index !== productIndex),
    }));
  }

  function getProductById(productId: string) {
    return products.find((product) => product.id === productId) ?? null;
  }

  function getShelfSlotCount(object: LayoutObject, shelf: LayoutShelf) {
    return Math.max(object.width * 2, shelf.products.length, 4);
  }

  function handleSelectShelfSlot(shelfLevel: number, slotIndex: number) {
    setEditorShelfLevel(shelfLevel);
    setEditorSlotIndex(slotIndex);
  }

  function handleAssignProductToSelectedSlot(productId: string) {
    if (!selectedObject) {
      return;
    }

    updateSelectedShelf(editorShelfLevel, (currentShelf) => {
      const slotCount = getShelfSlotCount(selectedObject, currentShelf);
      const nextProducts = Array.from({ length: slotCount }, (_, index) => currentShelf.products[index] ?? "");
      nextProducts[editorSlotIndex] = productId;

      return {
        ...currentShelf,
        products: nextProducts,
      };
    });
  }

  function handleClearSelectedSlot() {
    if (!selectedObject) {
      return;
    }

    updateSelectedShelf(editorShelfLevel, (currentShelf) => {
      const slotCount = getShelfSlotCount(selectedObject, currentShelf);
      const nextProducts = Array.from({ length: slotCount }, (_, index) => currentShelf.products[index] ?? "");
      nextProducts[editorSlotIndex] = "";

      return {
        ...currentShelf,
        products: nextProducts,
      };
    });
  }

  const stats = useMemo(() => {
    if (!activeDraft) {
      return {
        shelf: 0,
        fridge: 0,
        cashier: 0,
        passage: 0,
      };
    }

    return activeDraft.objects.reduce(
      (accumulator, object) => {
        accumulator[object.type] += 1;
        return accumulator;
      },
      {
        shelf: 0,
        fridge: 0,
        cashier: 0,
        passage: 0,
      },
    );
  }, [activeDraft]);

  if (!activeDraft) {
    return null;
  }

  return (
    <div className="page receivePage">
      <section className="hero">
        <div>
          <p className="eyebrow">Grid System</p>
          <h1>Конструктор карти магазину</h1>
          <p className="heroText">
            Другий інкремент модуля: сітка вже містить не клітинки зі станом, а
            прямокутні об&apos;єкти з координатами, розмірами та базовими параметрами.
          </p>
          <div className="heroActions">
            <button type="button" className="lightButton" onClick={onBack}>
              Повернутись до dashboard
            </button>
          </div>
        </div>
      </section>

      <section className="summaryGrid">
        <article className="summaryCard neutral">
          <span className="summaryLabel">Стелажі</span>
          <strong className="summaryValue">{stats.shelf}</strong>
        </article>
        <article className="summaryCard info">
          <span className="summaryLabel">Холодильники</span>
          <strong className="summaryValue">{stats.fridge}</strong>
        </article>
        <article className="summaryCard warning">
          <span className="summaryLabel">Каси</span>
          <strong className="summaryValue">{stats.cashier}</strong>
        </article>
        <article className="summaryCard danger">
          <span className="summaryLabel">Проходи</span>
          <strong className="summaryValue">{stats.passage}</strong>
        </article>
      </section>

      <section className="layout">
        <main className="panel storeLayoutMain">
          <div className="toolbar">
            <div className="toolbarTitle">
              <h2>{activeDraft.name}</h2>
              <button
                type="button"
                className="menuButton menuButtonPrimary toolbarActionButton"
                onClick={handleCreateDraft}
              >
                Новий магазин
              </button>
            </div>
            <div className="filters">
              {objectTypeOptions.map((tool) => (
                <button
                  key={tool.value}
                  type="button"
                  className={selectedType === tool.value ? "active" : ""}
                  onClick={() => setSelectedType(tool.value)}
                >
                  {tool.label}
                </button>
              ))}
            </div>
          </div>

          <div className="receiveActions">
            <button type="button" onClick={handleAddObject}>
              Додати об&apos;єкт
            </button>
            <button type="button" className="ghostButton" onClick={handleSelectAll}>
              Вибрати всі
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={handleClearSelection}
              disabled={!selectedObjectIds.length}
            >
              Очистити вибір
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={handleCopyObject}
              disabled={!selectedObject || hasMultipleSelection}
            >
              Копіювати
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={handlePasteObject}
              disabled={!copiedObject}
            >
              Вставити
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={handleOpenEditor}
              disabled={!selectedObject || hasMultipleSelection}
            >
              Редагувати
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={handleDeleteObject}
              disabled={!selectedObjectIds.length}
            >
              Видалити вибраний
            </button>
          </div>

          <div className="storeLayoutBoardWrap">
            <div
              ref={stageRef}
              className="storeLayoutStage"
              onMouseDown={handleStageMouseDown}
              style={{
                width: activeDraft.cols * activeDraft.cellSize,
                height: activeDraft.rows * activeDraft.cellSize,
                backgroundSize: `${activeDraft.cellSize}px ${activeDraft.cellSize}px`,
              }}
            >
              {activeDraft.objects.map((object) => {
                const isSelected = selectedObjectIds.includes(object.id);

                return (
                  <button
                    key={object.id}
                    type="button"
                    className={getObjectClass(object.type, isSelected)}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleObjectSelect(object.id, event.shiftKey);
                    }}
                    onMouseDown={(event) => handleDragStart(event, object)}
                    style={{
                      left: object.x * activeDraft.cellSize,
                      top: object.y * activeDraft.cellSize,
                      width: object.width * activeDraft.cellSize - 4,
                      height: object.height * activeDraft.cellSize - 4,
                    }}
                    title={`${object.name} | x:${object.x}, y:${object.y}, w:${object.width}, h:${object.height}`}
                  >
                    <strong>{object.name}</strong>
                    <span>{object.type}</span>
                    {!hasMultipleSelection || isSelected ? (
                      <span
                        className="layoutObjectResizeHandle"
                        onMouseDown={(event) => handleResizeStart(event, object)}
                        role="presentation"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}
              {selectionBox ? (
                <div
                  className="layoutSelectionBox"
                  style={{
                    left: Math.min(selectionBox.startX, selectionBox.currentX),
                    top: Math.min(selectionBox.startY, selectionBox.currentY),
                    width: Math.abs(selectionBox.currentX - selectionBox.startX),
                    height: Math.abs(selectionBox.currentY - selectionBox.startY),
                  }}
                />
              ) : null}
            </div>
          </div>
        </main>

        <aside className="panel storeLayoutSidebar">
          <h2>Параметри магазину</h2>

          <div className="details">
            <label className="fieldBlock">
              <span className="fieldLabel">Назва магазину</span>
              <input
                value={activeDraft.name}
                onChange={(event) =>
                  updateActiveDraft((draft) => ({
                    ...draft,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <label className="fieldBlock">
              <span className="fieldLabel">Код магазину</span>
              <input
                value={activeDraft.code}
                onChange={(event) =>
                  updateActiveDraft((draft) => ({
                    ...draft,
                    code: event.target.value,
                  }))
                }
              />
            </label>

            <label className="fieldBlock">
              <span className="fieldLabel">Рядки сітки</span>
              <input
                type="number"
                min="4"
                value={activeDraft.rows}
                onChange={(event) => handleResizeGrid(Number(event.target.value), activeDraft.cols)}
              />
            </label>

            <label className="fieldBlock">
              <span className="fieldLabel">Колонки сітки</span>
              <input
                type="number"
                min="4"
                value={activeDraft.cols}
                onChange={(event) => handleResizeGrid(activeDraft.rows, Number(event.target.value))}
              />
            </label>

            <label className="fieldBlock">
              <span className="fieldLabel">Розмір клітинки</span>
              <input
                type="number"
                min="24"
                max="64"
                value={activeDraft.cellSize}
                onChange={(event) =>
                  updateActiveDraft((draft) => ({
                    ...draft,
                    cellSize: Math.max(24, Number(event.target.value) || 24),
                  }))
                }
              />
            </label>
          </div>

          <div className="storeLayoutObjectPanel">
            <h3>Параметри об&apos;єкта</h3>
            {hasMultipleSelection ? (
              <div className="details">
                <p className="settingsHint">Виділено об&apos;єктів: {selectedObjects.length}</p>
                <p className="settingsHint">
                  Перетягніть будь-який із вибраних об&apos;єктів, щоб посунути всю групу.
                </p>
                <p className="settingsHint">
                  Для індивідуального редагування залиште вибраним лише один об&apos;єкт.
                </p>
              </div>
            ) : selectedObject ? (
              <div className="details">
                <label className="fieldBlock">
                  <span className="fieldLabel">Назва</span>
                  <input
                    value={selectedObject.name}
                    onChange={(event) =>
                      updateSelectedObject((object) => ({
                        ...object,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="fieldBlock">
                  <span className="fieldLabel">Тип</span>
                  <select
                    value={selectedObject.type}
                    onChange={(event) =>
                      updateSelectedObject((object) => ({
                        ...object,
                        type: event.target.value as LayoutObjectType,
                        shelves:
                          event.target.value === "shelf"
                            ? object.shelves.length
                              ? object.shelves
                              : createShelves("shelf")
                            : [],
                      }))
                    }
                  >
                    {objectTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="fieldBlock">
                  <span className="fieldLabel">X</span>
                  <input
                    type="number"
                    min="0"
                    value={selectedObject.x}
                    onChange={(event) =>
                      updateSelectedObject((object) => ({
                        ...object,
                        x: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </label>

                <label className="fieldBlock">
                  <span className="fieldLabel">Y</span>
                  <input
                    type="number"
                    min="0"
                    value={selectedObject.y}
                    onChange={(event) =>
                      updateSelectedObject((object) => ({
                        ...object,
                        y: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </label>

                <label className="fieldBlock">
                  <span className="fieldLabel">Ширина</span>
                  <input
                    type="number"
                    min="1"
                    value={selectedObject.width}
                    onChange={(event) =>
                      updateSelectedObject((object) => ({
                        ...object,
                        width: Number(event.target.value) || 1,
                      }))
                    }
                  />
                </label>

                <label className="fieldBlock">
                  <span className="fieldLabel">Висота</span>
                  <input
                    type="number"
                    min="1"
                    value={selectedObject.height}
                    onChange={(event) =>
                      updateSelectedObject((object) => ({
                        ...object,
                        height: Number(event.target.value) || 1,
                      }))
                    }
                  />
                </label>

                {selectedObject.type === "shelf" && (
                  <p className="settingsHint">
                    Кількість полиць: {selectedObject.shelves.length}
                  </p>
                )}
              </div>
            ) : (
              <p className="settingsHint">Оберіть об&apos;єкт на карті або додайте новий.</p>
            )}
          </div>

          <div className="menuHintBox">
            <strong>Що це вже перевіряє</strong>
            <p>
              Ми вже зберігаємо layout як набір окремих об&apos;єктів з координатами
              і розміром. Це правильна основа для drag-and-drop, resize і прив&apos;язки
              товарів до зон.
            </p>
            <p>
              Макети тепер зберігаються в IndexedDB, а вибраний об&apos;єкт можна скопіювати
              і вставити як швидку заготовку для однотипних зон.
            </p>
          </div>

          <div className="storeDraftList">
            <h3>Збережені макети</h3>
            {drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                className={`storeDraftButton ${draft.id === activeDraft.id ? "storeDraftButtonActive" : ""}`}
                onClick={() => {
                  setActiveDraftId(draft.id);
                  setSelectedObjectIds(draft.objects[0]?.id ? [draft.objects[0].id] : []);
                }}
              >
                <strong>{draft.name}</strong>
                <span>{draft.code}</span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      {isEditorOpen && selectedObject && !hasMultipleSelection ? (
        <div className="layoutEditorOverlay" role="presentation" onClick={handleCloseEditor}>
          <section
            className="layoutEditorModal"
            role="dialog"
            aria-modal="true"
            aria-label="Редагування об'єкта"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="layoutEditorHeader">
              <div>
                <p className="eyebrow">Object Editor</p>
                <h2>{selectedObject.name}</h2>
              </div>
              <button type="button" className="ghostButton" onClick={handleCloseEditor}>
                Закрити
              </button>
            </div>

            <div className="layoutEditorGrid">
              <section className="layoutEditorSection">
                <h3>Основні параметри</h3>
                <div className="details">
                  <label className="fieldBlock">
                    <span className="fieldLabel">Назва</span>
                    <input
                      value={selectedObject.name}
                      onChange={(event) =>
                        updateSelectedObject((object) => ({
                          ...object,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="fieldBlock">
                    <span className="fieldLabel">Тип</span>
                    <input value={selectedObject.type} disabled />
                  </label>

                  <p className="settingsHint">
                    Позиція: x {selectedObject.x}, y {selectedObject.y}. Розмір: {selectedObject.width} x{" "}
                    {selectedObject.height}.
                  </p>
                </div>
              </section>

              <section className="layoutEditorSection">
                <div className="layoutEditorSectionHeader">
                  <h3>Внутрішнє наповнення</h3>
                  {selectedObject.type === "shelf" ? (
                    <button type="button" className="ghostButton" onClick={handleAddShelf}>
                      Додати полицю
                    </button>
                  ) : null}
                </div>

                {selectedObject.type === "shelf" ? (
                  <>
                    <div className="layoutShelfList">
                    {selectedObject.shelves.map((shelf) => (
                      <article key={shelf.level} className="layoutShelfCard">
                        <div className="layoutShelfHeader">
                          <strong>Полиця {shelf.level}</strong>
                          <button
                            type="button"
                            className="ghostButton"
                            onClick={() => handleRemoveShelf(shelf.level)}
                            disabled={selectedObject.shelves.length <= 1}
                          >
                            Видалити
                          </button>
                        </div>

                        <label className="fieldBlock">
                          <span className="fieldLabel">Назва полиці</span>
                          <input
                            value={shelf.name}
                            onChange={(event) =>
                              updateSelectedShelf(shelf.level, (currentShelf) => ({
                                ...currentShelf,
                                name: event.target.value,
                              }))
                            }
                          />
                        </label>

                        <label className="fieldBlock">
                          <span className="fieldLabel">Статус</span>
                          <select
                            value={shelf.status}
                            onChange={(event) =>
                              updateSelectedShelf(shelf.level, (currentShelf) => ({
                                ...currentShelf,
                                status: event.target.value as LayoutShelf["status"],
                              }))
                            }
                          >
                            <option value="ok">ok</option>
                            <option value="warning">warning</option>
                            <option value="critical">critical</option>
                          </select>
                        </label>

                        <label className="fieldBlock">
                          <span className="fieldLabel">Слоти товарів</span>
                          <div
                            className="layoutShelfGrid"
                            style={{
                              gridTemplateColumns: `repeat(${Math.min(getShelfSlotCount(selectedObject, shelf), 4)}, minmax(0, 1fr))`,
                            }}
                          >
                            {Array.from({ length: getShelfSlotCount(selectedObject, shelf) }, (_, productIndex) => {
                              const productId = shelf.products[productIndex] ?? "";
                              const product = getProductById(productId);
                              const isActiveSlot =
                                editorShelfLevel === shelf.level && editorSlotIndex === productIndex;

                              return (
                                <button
                                  key={`${shelf.level}-${productIndex}`}
                                  type="button"
                                  className={`layoutShelfGridSlot ${isActiveSlot ? "layoutShelfGridSlotActive" : ""}`}
                                  onClick={() => handleSelectShelfSlot(shelf.level, productIndex)}
                                >
                                  <span className="layoutShelfGridSlotIndex">{productIndex + 1}</span>
                                  {product?.imageUrl ? (
                                    <img src={product.imageUrl} alt={product.name} className="layoutShelfGridSlotImage" />
                                  ) : (
                                    <span className="layoutShelfGridSlotPlaceholder">
                                      {(product?.name ?? "+").slice(0, 1).toUpperCase()}
                                    </span>
                                  )}
                                  <strong>{product?.name ?? "Порожньо"}</strong>
                                </button>
                              );
                            })}
                          </div>
                        </label>
                      </article>
                    ))}
                    </div>

                    {activeEditorShelf ? (
                      <div className="layoutShelfInspector">
                      <div className="layoutEditorSectionHeader">
                        <h3>
                          Полиця {activeEditorShelf.level}, секція {editorSlotIndex + 1}
                        </h3>
                        <button
                          type="button"
                          className="ghostButton"
                          onClick={handleClearSelectedSlot}
                          disabled={!activeEditorShelf.products[editorSlotIndex]}
                        >
                          Очистити слот
                        </button>
                      </div>

                      <label className="fieldBlock">
                        <span className="fieldLabel">Товар у вибраній секції</span>
                        <select
                          value={activeEditorShelf.products[editorSlotIndex] ?? ""}
                          onChange={(event) => handleAssignProductToSelectedSlot(event.target.value)}
                        >
                          <option value="">Порожній слот</option>
                          {products.map((productOption) => (
                            <option key={productOption.id} value={productOption.id}>
                              {productOption.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {activeEditorProduct ? (
                        <div className="layoutShelfInspectorCard">
                          {activeEditorProduct.imageUrl ? (
                            <img
                              src={activeEditorProduct.imageUrl}
                              alt={activeEditorProduct.name}
                              className="layoutShelfInspectorImage"
                            />
                          ) : (
                            <div className="layoutShelfInspectorPlaceholder">
                              {activeEditorProduct.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div className="layoutShelfInspectorInfo">
                            <strong>{activeEditorProduct.name}</strong>
                            <span>{activeEditorProduct.category}</span>
                            <span>{activeEditorProduct.barcode || "Без штрихкоду"}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="settingsHint">
                          У цій секції ще немає товару. Оберіть товар зі списку вище.
                        </p>
                      )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="settingsHint">
                    У цьому інкременті внутрішній редактор деталізований для стелажів. Для інших типів об&apos;єктів
                    далі можна буде додати власну внутрішню структуру.
                  </p>
                )}
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
