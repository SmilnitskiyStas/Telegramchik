import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DeliveryBatch, Product, ProductStatus } from "./types";
import { StoreLayoutPage } from "./StoreLayoutPage";

const API_URL =
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV
    ? `http://${window.location.hostname || "localhost"}:3001`
    : "");

const statuses: ProductStatus[] = [
  "нове",
  "перевірити",
  "в роботі",
  "на погодженні",
  "вирішено",
  "списано",
];

type EmployeeStatus = "на зміні" | "вихідний" | "відсутній";

type Employee = {
  id: string;
  name: string;
  surname: string;
  fullName: string;
  role: string;
  storeId: string;
  storeName: string;
  telegramClientId: string;
  status: EmployeeStatus;
  lastActivityAt: string;
  lastAction: string;
  activityLog: Array<{ at: string; action: string }>;
};

type Store = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type NotificationSettings = {
  enabled: boolean;
  chatId: string;
  time: string;
  daysBefore: number;
  lastSentDate: string | null;
};

type ProductGroup = {
  id: string;
  productId: string;
  name: string;
  category: string;
  barcode: string;
  imageUrl?: string;
  batches: Product[];
  totalQuantity: number;
  nearestExpiry: string;
  latestReceivedAt: string;
  storeNames: string[];
  worstExpiryState: ExpiryState;
};

type ExpiryState = "fresh" | "expiring" | "expired";
type ViewMode =
  | "dashboard"
  | "receive"
  | "settings"
  | "employees"
  | "store-layout"
  | "delivery-batches"
  | "stores";
type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

const defaultNotificationSettings: NotificationSettings = {
  enabled: false,
  chatId: "",
  time: "08:00",
  daysBefore: 7,
  lastSentDate: null,
};

function getTodayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createEmptyForm() {
  const today = getTodayDateInputValue();

  return {
    name: "",
    category: "",
    barcode: "",
    batch: today,
    storeId: "",
    quantity: 1,
    receivedAt: today,
    expiresAt: "",
    notes: "",
    receivedByUserId: "",
  };
}

function getViewMode(): ViewMode {
  const params = new URLSearchParams(window.location.search);
  const forcedMode = params.get("mode");

  if (
    window.location.pathname === "/receive" ||
    forcedMode === "receive" ||
    params.has("clientId")
  ) {
    return "receive";
  }
  if (window.location.pathname === "/settings") return "settings";
  if (window.location.pathname === "/employees") return "employees";
  if (window.location.pathname === "/store-layout") return "store-layout";
  if (window.location.pathname === "/delivery-batches") return "delivery-batches";
  if (window.location.pathname === "/stores") return "stores";
  return "dashboard";
}

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(getViewMode());
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [deliveryBatches, setDeliveryBatches] = useState<DeliveryBatch[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    new URLSearchParams(window.location.search).get("productId"),
  );
  const [selectedDeliveryBatchId, setSelectedDeliveryBatchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "expiring" | "expired">("all");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    defaultNotificationSettings,
  );
  const [form, setForm] = useState(() => {
    return createEmptyForm();
  });
  const [storeForm, setStoreForm] = useState({
    code: "",
    name: "",
    isActive: true,
  });
  const [storeEditForm, setStoreEditForm] = useState({
    code: "",
    name: "",
    isActive: true,
  });
  const [employeeEditForm, setEmployeeEditForm] = useState({
    name: "",
    surname: "",
    role: "user",
    storeId: "",
    telegramClientId: "",
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingStore, setSubmittingStore] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  function getEmployeeFullName(employeeId: string) {
    return employees.find((employee) => employee.id === employeeId)?.fullName ?? "";
  }

  function getStoreName(storeId: string) {
    return stores.find((store) => store.id === storeId)?.name ?? "";
  }

  function navigate(nextPath: string) {
    window.history.pushState({}, "", nextPath);
    setViewMode(getViewMode());

    const params = new URLSearchParams(window.location.search);
    const productId = params.get("productId");

    if (productId) {
      setSelectedId(productId);
    }

    if (nextPath.startsWith("/receive")) {
      setForm((current) => ({
        ...current,
        batch: current.batch || getTodayDateInputValue(),
        receivedAt: current.receivedAt || getTodayDateInputValue(),
      }));
    }
  }

  function stopScanner() {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setScannerBusy(false);
    setScannerOpen(false);
  }

  function applyBarcodeToForm(rawBarcode: string) {
    const barcode = rawBarcode.trim();
    if (!barcode) {
      return;
    }

    const matchedProduct = products.find((product) => product.barcode === barcode);

    setForm((current) => ({
      ...current,
      barcode,
      name: matchedProduct?.name ?? current.name,
      category: matchedProduct?.category ?? current.category,
    }));

    if (matchedProduct) {
      setScannerError('Знайдено товар з таким штрихкодом. Назва і категорія підставлені автоматично.');
    } else {
      setScannerError('Штрихкод зчитано. Заповніть решту полів вручну.');
    }
  }

  async function startScanner() {
    if (!window.BarcodeDetector) {
      setScannerError('Сканування камерою не підтримується у вашому браузері.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError('Браузер не підтримує доступ до камери.');
      return;
    }

    stopScanner();
    setScannerError('');
    setScannerOpen(true);
    setScannerBusy(true);

    try {
      detectorRef.current = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e'],
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || !detectorRef.current) {
          return;
        }

        try {
          const results = await detectorRef.current.detect(videoRef.current);
          const rawValue = results[0]?.rawValue;

          if (rawValue) {
            applyBarcodeToForm(rawValue);
            stopScanner();
          }
        } catch {
          // ignore transient detector errors while camera is warming up
        }
      }, 700);
    } catch {
      stopScanner();
      setScannerError('Не вдалося відкрити камеру. Перевірте дозвіл браузера.');
    } finally {
      setScannerBusy(false);
    }
  }
  function renderSidebar() {
    return (
      <aside className="panel menuPanel appSidebar">
        <h2>Меню</h2>
        <div className="menuList">
          <button
            type="button"
            className={`menuButton ${viewMode === "dashboard" ? "menuButtonActive" : ""}`}
            onClick={() => navigate("/")}
          >
            Головна панель
          </button>
          <button
            type="button"
            className={`menuButton ${viewMode === "settings" ? "menuButtonActive" : ""}`}
            onClick={() => navigate("/settings")}
          >
            Налаштування
          </button>
          <button
            type="button"
            className={`menuButton ${viewMode === "employees" ? "menuButtonActive" : ""}`}
            onClick={() => navigate("/employees")}
          >
            Користувачі
          </button>
          <button
            type="button"
            className={`menuButton ${viewMode === "delivery-batches" ? "menuButtonActive" : ""}`}
            onClick={() => {
              setSelectedDeliveryBatchId(null);
              navigate("/delivery-batches");
            }}
          >
            Партії
          </button>
          <button
            type="button"
            className={`menuButton ${viewMode === "stores" ? "menuButtonActive" : ""}`}
            onClick={() => navigate("/stores")}
          >
            Магазини
          </button>
          <button
            type="button"
            className={`menuButton ${viewMode === "store-layout" ? "menuButtonActive" : ""}`}
            onClick={() => navigate("/store-layout")}
          >
            Карта магазину
          </button>
        </div>
        <div className="menuHintBox">
          <strong>Швидкий сценарій</strong>
          <p>
            Щоб прийняти нову партію, використайте кнопку `Додати товар` у списку
            товарів або команду `/newproduct` у Telegram.
          </p>
        </div>
      </aside>
    );
  }

  useEffect(() => {
    const onPopState = () => {
      setViewMode(getViewMode());
      const params = new URLSearchParams(window.location.search);
      const productId = params.get("productId");
      if (productId) {
        setSelectedId(productId);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current !== null) {
        window.clearInterval(scanTimerRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  function getExpiryState(expiresAtValue: string): ExpiryState {
    const now = new Date();
    const expiresAt = new Date(expiresAtValue);
    const diffDays = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays < 0) return "expired";
    if (diffDays <= 7) return "expiring";
    return "fresh";
  }

  async function loadProducts() {
    setLoading(true);
    const response = await fetch(`${API_URL}/products`);
    const data = (await response.json()) as Product[];
    setProducts(data);
    setLoading(false);

    if (!selectedId && data[0]) {
      setSelectedId(data[0].id);
    }
  }

  async function loadEmployees() {
    const response = await fetch(`${API_URL}/employees`);
    const data = (await response.json()) as Employee[];
    setEmployees(data);
    setSelectedEmployeeId((current) => current ?? data[0]?.id ?? null);
  }

  async function loadStores() {
    const response = await fetch(`${API_URL}/stores`);
    const data = (await response.json()) as Store[];
    setStores(data);
    setSelectedStoreId((current) => current ?? data[0]?.id ?? null);
  }

  async function loadDeliveryBatches(storeId?: string) {
    const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    const response = await fetch(`${API_URL}/delivery-batches${query}`);

    if (!response.ok) {
      setDeliveryBatches([]);
      return;
    }

    const data = (await response.json()) as DeliveryBatch[];
    setDeliveryBatches(data);
  }

  useEffect(() => {
    void loadProducts();
    void loadEmployees();
    void loadStores();
    void loadDeliveryBatches();
  }, []);

  useEffect(() => {
    const clientId = new URLSearchParams(window.location.search).get("clientId");

    if (!clientId || !employees.length) {
      return;
    }

    const matchedEmployee = employees.find(
      (employee) => employee.telegramClientId === clientId,
    );

    if (!matchedEmployee) {
      return;
    }

    setForm((current) => ({
      ...current,
      receivedByUserId: current.receivedByUserId || matchedEmployee.id,
      storeId: current.storeId || matchedEmployee.storeId,
    }));
  }, [employees]);

  useEffect(() => {
    if (!form.storeId) {
      return;
    }

    void loadDeliveryBatches(form.storeId);
  }, [form.storeId]);

  useEffect(() => {
    async function loadNotificationSettings() {
      const response = await fetch(`${API_URL}/notification-settings`);
      const data = (await response.json()) as {
        ok: boolean;
        settings?: NotificationSettings;
      };

      if (response.ok && data.ok && data.settings) {
        setNotificationSettings(data.settings);
        if (data.settings.chatId) {
          setTelegramChatId(data.settings.chatId);
        }
      }
    }

    void loadNotificationSettings();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId],
  );

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, ProductGroup>();

    for (const product of products) {
      const key = product.productId || product.barcode || product.id;
      const current = groups.get(key);

      if (!current) {
        groups.set(key, {
          id: key,
          productId: product.productId,
          name: product.name,
          category: product.category,
          barcode: product.barcode,
          imageUrl: product.imageUrl,
          batches: [product],
          totalQuantity: product.quantity,
          nearestExpiry: product.expiresAt,
          latestReceivedAt: product.receivedAt,
          storeNames: product.storeName ? [product.storeName] : [],
          worstExpiryState: getExpiryState(product.expiresAt),
        });
        continue;
      }

      current.batches.push(product);
      current.totalQuantity += product.quantity;
      if (new Date(product.expiresAt).getTime() < new Date(current.nearestExpiry).getTime()) {
        current.nearestExpiry = product.expiresAt;
      }
      if (product.receivedAt && new Date(product.receivedAt).getTime() > new Date(current.latestReceivedAt || 0).getTime()) {
        current.latestReceivedAt = product.receivedAt;
      }
      if (product.storeName && !current.storeNames.includes(product.storeName)) {
        current.storeNames.push(product.storeName);
      }

      const nextExpiryState = getExpiryState(product.expiresAt);
      if (
        (nextExpiryState === "expired" && current.worstExpiryState !== "expired") ||
        (nextExpiryState === "expiring" && current.worstExpiryState === "fresh")
      ) {
        current.worstExpiryState = nextExpiryState;
      }
    }

    return Array.from(groups.values()).sort((left, right) => {
      return new Date(left.nearestExpiry).getTime() - new Date(right.nearestExpiry).getTime();
    });
  }, [products]);

  const selectedGroup = useMemo(() => {
    if (!selectedProduct) {
      return null;
    }

    return groupedProducts.find((group) => group.productId === selectedProduct.productId) ?? null;
  }, [groupedProducts, selectedProduct]);

  useEffect(() => {
    if (!selectedGroup?.batches.length) {
      return;
    }

    const firstBatchWithDelivery = selectedGroup.batches.find((batch) => batch.deliveryBatchId);
    if (firstBatchWithDelivery?.deliveryBatchId) {
      setSelectedDeliveryBatchId(firstBatchWithDelivery.deliveryBatchId);
    }
  }, [selectedGroup]);

  const selectedDeliveryBatch = useMemo(() => {
    if (!selectedDeliveryBatchId) {
      return null;
    }

    return (
      deliveryBatches.find((batch) => batch.id === selectedDeliveryBatchId) ?? null
    );
  }, [deliveryBatches, selectedDeliveryBatchId]);

  const currentOpenDeliveryBatch = useMemo(() => {
    if (!form.storeId) {
      return null;
    }

    return (
      deliveryBatches.find(
        (batch) => batch.storeId === form.storeId && batch.status === "open",
      ) ?? null
    );
  }, [deliveryBatches, form.storeId]);

  const sortedDeliveryBatches = useMemo(() => {
    return [...deliveryBatches].sort((left, right) => {
      const leftKey = `${left.deliveryDate}-${String(left.batchNumber).padStart(4, "0")}`;
      const rightKey = `${right.deliveryDate}-${String(right.batchNumber).padStart(4, "0")}`;
      return rightKey.localeCompare(leftKey);
    });
  }, [deliveryBatches]);

  const selectedEmployee = useMemo(
    () =>
      employees.find((employee) => employee.id === selectedEmployeeId) ??
      employees[0] ??
      null,
    [employees, selectedEmployeeId],
  );

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) ?? stores[0] ?? null,
    [stores, selectedStoreId],
  );

  const visibleProducts = useMemo(() => {
    return groupedProducts.filter((group) => {
      if (filter === "expired") return group.worstExpiryState === "expired";
      if (filter === "expiring") return group.worstExpiryState === "expiring";
      return true;
    });
  }, [filter, groupedProducts]);

  const summary = useMemo(() => {
    const expiring = groupedProducts.filter(
      (product) => product.worstExpiryState === "expiring",
    ).length;
    const expired = groupedProducts.filter(
      (product) => product.worstExpiryState === "expired",
    ).length;
    const inProgress = groupedProducts.filter(
      (product) => product.batches.some((batch) => batch.status === "в роботі"),
    ).length;

    return { total: groupedProducts.length, expiring, expired, inProgress };
  }, [groupedProducts]);

  const batchesSummary = useMemo(() => {
    const active = deliveryBatches.filter((batch) => batch.status === "open").length;
    const closed = deliveryBatches.filter((batch) => batch.status === "closed").length;
    return { total: deliveryBatches.length, active, closed };
  }, [deliveryBatches]);

  useEffect(() => {
    if (!selectedEmployee) {
      return;
    }

    setEmployeeEditForm({
      name: selectedEmployee.name,
      surname: selectedEmployee.surname,
      role: selectedEmployee.role === "admin" || selectedEmployee.role === "manager" ? selectedEmployee.role : "user",
      storeId: selectedEmployee.storeId,
      telegramClientId: selectedEmployee.telegramClientId,
      isActive: selectedEmployee.status !== "відсутній",
    });
  }, [selectedEmployee]);

  useEffect(() => {
    if (!selectedStore) {
      return;
    }

    setStoreEditForm({
      code: selectedStore.code,
      name: selectedStore.name,
      isActive: selectedStore.isActive,
    });
  }, [selectedStore]);

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const response = await fetch(`${API_URL}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const created = (await response.json()) as Product;

    setForm(createEmptyForm());
    await loadProducts();
    await loadEmployees();
    await loadDeliveryBatches();
    setSelectedId(created.id);
    setSelectedDeliveryBatchId(created.deliveryBatchId ?? null);
    setSubmitting(false);

    if (viewMode === "receive") {
      window.alert("Нова партія товару додана.");
      navigate(`/?productId=${created.id}`);
    }
  }

  function handleReceiverChange(receivedByUserId: string) {
    const matchedEmployee = employees.find((employee) => employee.id === receivedByUserId);

    setForm((current) => ({
      ...current,
      receivedByUserId,
      storeId: matchedEmployee?.storeId ?? current.storeId,
    }));
  }

  async function handleStatusChange(id: string, status: ProductStatus) {
    await fetch(`${API_URL}/products/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    await loadProducts();
    await loadEmployees();
    setSelectedId(id);
  }

  async function handleCloseCurrentDeliveryBatch() {
    if (!form.storeId) {
      window.alert("Спочатку оберіть магазин для поточної поставки.");
      return;
    }

    const response = await fetch(`${API_URL}/delivery-batches/current/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: form.storeId }),
    });

    const data = (await response.json()) as {
      ok?: boolean;
      message?: string;
      batch?: DeliveryBatch | null;
    };

    if (!response.ok || !data.ok) {
      window.alert(data.message ?? "Не вдалося закрити поточну партію поставки.");
      return;
    }

    await loadDeliveryBatches(form.storeId);
    setSelectedDeliveryBatchId(data.batch?.id ?? null);
    window.alert("Поточну партію поставки закрито. Наступне надходження піде в нову партію.");
  }

  async function handleCreateStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingStore(true);

    const response = await fetch(`${API_URL}/stores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(storeForm),
    });

    const data = (await response.json()) as Store & { message?: string };
    setSubmittingStore(false);

    if (!response.ok) {
      window.alert(data.message ?? "Не вдалося створити магазин.");
      return;
    }

    setStoreForm({
      code: "",
      name: "",
      isActive: true,
    });
    await loadStores();
    window.alert(`Магазин ${data.name} додано.`);
  }

  async function handleUpdateStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStore) {
      return;
    }

    setSavingStore(true);
    const response = await fetch(`${API_URL}/stores/${selectedStore.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(storeEditForm),
    });

    const data = (await response.json()) as Store & { message?: string };
    setSavingStore(false);

    if (!response.ok) {
      window.alert(data.message ?? "Не вдалося оновити магазин.");
      return;
    }

    await loadStores();
    window.alert(`Магазин ${data.name} оновлено.`);
  }

  async function handleUpdateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEmployee) {
      return;
    }

    setSavingEmployee(true);
    const response = await fetch(`${API_URL}/employees/${selectedEmployee.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employeeEditForm),
    });

    const data = (await response.json()) as Employee & { message?: string };
    setSavingEmployee(false);

    if (!response.ok) {
      window.alert(data.message ?? "Не вдалося оновити користувача.");
      return;
    }

    await loadEmployees();
    window.alert(`Користувача ${data.fullName} оновлено.`);
  }

  async function handleTelegramPreview(productId?: string) {
    const targetId = productId ?? selectedProduct?.id;
    if (!targetId) return;

    await fetch(`${API_URL}/telegram/preview/${targetId}`, {
      method: "POST",
    });

    window.alert("Тестова Telegram-нотифікація згенерована в API логах.");
  }

  async function handleTelegramSend(productId?: string) {
    const targetId = productId ?? selectedProduct?.id;
    if (!targetId) return;

    const response = await fetch(`${API_URL}/telegram/notify/${targetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: telegramChatId || undefined }),
    });

    const data = (await response.json()) as { ok: boolean; message?: string };

    if (!response.ok || !data.ok) {
      window.alert(data.message ?? "Не вдалося надіслати повідомлення в Telegram.");
      return;
    }

    window.alert("Повідомлення відправлено в Telegram.");
  }

  async function handleTelegramUpdates() {
    const response = await fetch(`${API_URL}/telegram/updates`);
    const data = (await response.json()) as {
      ok: boolean;
      message?: string;
      updates?: Array<{ message?: { chat?: { id?: number | string } } }>;
    };

    if (!response.ok || !data.ok) {
      window.alert(data.message ?? "Не вдалося отримати updates.");
      return;
    }

    const ids = Array.from(
      new Set(
        (data.updates ?? [])
          .map((update) => update.message?.chat?.id)
          .filter(Boolean),
      ),
    );

    if (!ids.length) {
      window.alert("Поки немає updates. Напишіть щось боту в Telegram і спробуйте ще раз.");
      return;
    }

    const chatId = String(ids[0]);
    setTelegramChatId(chatId);
    setNotificationSettings((current) => ({ ...current, chatId }));

    const matchedEmployee = employees.find(
      (employee) => employee.telegramClientId === chatId,
    );

    if (matchedEmployee) {
      setForm((current) => ({
        ...current,
        receivedByUserId: matchedEmployee.id,
        storeId: matchedEmployee.storeId,
      }));
    }

    window.alert(`Знайдені chat_id: ${ids.join(", ")}`);
  }

  async function handleDeleteWebhook() {
    const response = await fetch(`${API_URL}/telegram/delete-webhook`, {
      method: "POST",
    });

    const data = (await response.json()) as { ok: boolean; message?: string };

    if (!response.ok || !data.ok) {
      window.alert(data.message ?? "Не вдалося вимкнути webhook.");
      return;
    }

    window.alert("Webhook вимкнено. Тепер бот може обробляти команди через getUpdates.");
  }

  async function handleTelegramTest() {
    const response = await fetch(`${API_URL}/telegram/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: telegramChatId || undefined }),
    });

    const data = (await response.json()) as { ok: boolean; message?: string };

    if (!response.ok || !data.ok) {
      window.alert(data.message ?? "Не вдалося надіслати тестове повідомлення.");
      return;
    }

    window.alert("Тестове повідомлення надіслано в Telegram.");
  }

  async function handleSaveNotificationSettings() {
    setSavingSettings(true);

    const response = await fetch(`${API_URL}/notification-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...notificationSettings,
        chatId: telegramChatId || notificationSettings.chatId,
      }),
    });

    const data = (await response.json()) as {
      ok: boolean;
      message?: string;
      settings?: NotificationSettings;
    };

    setSavingSettings(false);

    if (!response.ok || !data.ok || !data.settings) {
      window.alert(data.message ?? "Не вдалося зберегти налаштування.");
      return;
    }

    setNotificationSettings(data.settings);
    setTelegramChatId(data.settings.chatId);
    window.alert("Налаштування автосповіщень збережено.");
  }

  async function handlePollTelegramCommands() {
    const response = await fetch(`${API_URL}/telegram/poll-commands`, {
      method: "POST",
    });

    const data = (await response.json()) as { ok: boolean; message?: string };

    if (!response.ok || !data.ok) {
      window.alert(data.message ?? "Не вдалося обробити Telegram-команди.");
      return;
    }

    window.alert("Команди Telegram перевірені. Напишіть /newproduct боту й зачекайте кілька секунд.");
  }

  const productForm = (
    <form onSubmit={handleCreateProduct} className={`form ${viewMode === "receive" ? "receiveForm" : ""}`}>
      <div className={viewMode === "receive" ? "formGrid" : undefined}>
        <label className="fieldBlock">
          <span className="fieldLabel">Назва товару <span className="requiredMark">*</span></span>
          <span className="fieldHint">Наприклад: Молоко 2.5% або Йогурт полуниця.</span>
          <input placeholder="Вкажіть назву товару" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className="fieldBlock">
          <span className="fieldLabel">Категорія <span className="requiredMark">*</span></span>
          <span className="fieldHint">Наприклад: Молочні продукти, Напої або Заморозка.</span>
          <input placeholder="Вкажіть категорію" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
        </label>
        <label className="fieldBlock">
          <span className="fieldLabel">Штрихкод <span className="requiredMark">*</span></span>
          <span className="fieldHint">Вкажіть або відскануйте штрихкод з упаковки товару.</span>
          <input placeholder="Наприклад: 4820000012345" value={form.barcode} onChange={(e) => applyBarcodeToForm(e.target.value)} required />
        </label>
        <div className="scannerBox">
          <div className="scannerActions">
            <button type="button" className="ghostButton" onClick={() => void startScanner()} disabled={scannerBusy}>
              {scannerBusy ? "Запуск камери..." : scannerOpen ? "Перезапустити сканер" : "Сканувати штрихкод"}
            </button>
            {scannerOpen && (
              <button type="button" className="ghostButton" onClick={stopScanner}>
                Закрити камеру
              </button>
            )}
          </div>
          <p className="scannerHint">Після сканування система підставить штрихкод, а якщо такий товар уже є, автоматично заповнить назву і категорію.</p>
          {scannerError && <p className="scannerStatus">{scannerError}</p>}
          {scannerOpen && (
            <div className="scannerPreview">
              <video ref={videoRef} autoPlay playsInline muted className="scannerVideo" />
            </div>
          )}
        </div>
        <label className="fieldBlock">
          <span className="fieldLabel">Партія <span className="requiredMark">*</span></span>
          <span className="fieldHint">За замовчуванням підставляється сьогоднішня дата. За потреби змініть вручну.</span>
          <input placeholder="Наприклад: 2026-04-15" value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} required />
        </label>
        <label className="fieldBlock">
          <span className="fieldLabel">Кількість <span className="requiredMark">*</span></span>
          <span className="fieldHint">Скільки одиниць товару прийнято у цій партії.</span>
          <input type="number" min="1" placeholder="Наприклад: 12" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} required />
        </label>
        <label className="fieldBlock">
          <span className="fieldLabel">Хто прийняв товар <span className="requiredMark">*</span></span>
          <span className="fieldHint">Користувач зберігається окремо. Якщо форма відкрита з Telegram, потрібний користувач підставляється автоматично по `chat_id`.</span>
          <select
            value={form.receivedByUserId}
            onChange={(e) => handleReceiverChange(e.target.value)}
            required
          >
            <option value="">Оберіть користувача</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} · {employee.storeName}
              </option>
            ))}
          </select>
        </label>
        <label className="fieldBlock">
          <span className="fieldLabel">Магазин <span className="requiredMark">*</span></span>
          <span className="fieldHint">Підставляється від вибраного користувача, але за потреби можна змінити вручну.</span>
          <select
            value={form.storeId}
            onChange={(e) => setForm({ ...form, storeId: e.target.value })}
            required
          >
            <option value="">Оберіть магазин</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} · {store.code}
              </option>
            ))}
          </select>
        </label>
        <label className="fieldBlock">
          <span className="fieldLabel">Дата надходження <span className="requiredMark">*</span></span>
          <span className="fieldHint">Дата, коли партія фактично приїхала на склад.</span>
          <input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} required />
        </label>
        <label className="fieldBlock">
          <span className="fieldLabel">Термін придатності <span className="requiredMark">*</span></span>
          <span className="fieldHint">Кінцева дата придатності товару з упаковки або документів.</span>
          <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} required />
        </label>
      </div>

      <div className="menuHintBox">
        <strong>Поточна поставка</strong>
        {form.storeId ? (
          <>
            <p>
              {currentOpenDeliveryBatch
                ? `Відкрита поставка: ${currentOpenDeliveryBatch.label}. Усі нові товари для цього магазину підуть саме в неї, поки ти її не закриєш.`
                : "Для цього магазину зараз немає відкритої поставки. Перший доданий товар створить нову поставку автоматично."}
            </p>
            {currentOpenDeliveryBatch && (
              <div className="batchActions">
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => setSelectedDeliveryBatchId(currentOpenDeliveryBatch.id)}
                >
                  Відкрити партію
                </button>
                <button type="button" className="ghostButton" onClick={() => void handleCloseCurrentDeliveryBatch()}>
                  Закрити партію
                </button>
              </div>
            )}
          </>
        ) : (
          <p>Оберіть магазин, щоб система показала активну поставку і номер поточної партії.</p>
        )}
      </div>

      <label className="fieldBlock">
        <span className="fieldLabel">Примітка</span>
        <span className="fieldHint">Необов'язково. Тут можна вказати стан упаковки, особливості партії або коментар складу.</span>
        <textarea placeholder="Наприклад: упаковка ціла, товар прийнято без зауважень" rows={viewMode === "receive" ? 5 : 4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>

      <div className="receiveActions">
        <button type="submit" disabled={submitting}>
          {submitting ? "Збереження..." : viewMode === "receive" ? "Занести партію в базу" : "Додати товар"}
        </button>
      </div>
    </form>
  );

  const settingsContent = (
    <div className="settingsPageGrid">
      <section className="panel settingsPanel">
        <h2>Синхронізація з Telegram</h2>
        <div className="details">
          <label className="fieldBlock">
            <span className="fieldLabel">Telegram chat_id</span>
            <span className="fieldHint">ID чату або користувача, куди надсилаються повідомлення.</span>
            <input
              placeholder="Наприклад: 591179640"
              value={telegramChatId}
              onChange={(e) => {
                setTelegramChatId(e.target.value);
                setNotificationSettings((current) => ({ ...current, chatId: e.target.value }));
              }}
            />
          </label>
          <div className="settingsActions">
            <button type="button" onClick={() => void handleTelegramUpdates()}>Отримати chat_id з updates</button>
            <button type="button" onClick={() => void handleDeleteWebhook()}>Вимкнути webhook</button>
            <button type="button" onClick={() => void handleTelegramTest()}>Надіслати тест</button>
            <button type="button" onClick={() => void handlePollTelegramCommands()}>Перевірити команди бота</button>
          </div>
          <div className="menuHintBox">
            <strong>Команди Telegram</strong>
            <p>Для відкриття форми приймання нової партії використовуйте `/newproduct` або `/addproduct`.</p>
          </div>
        </div>
      </section>

      <section className="panel settingsPanel">
        <h2>Автосповіщення</h2>
        <div className="settingsBox settingsBoxStandalone">
          <label className="checkboxRow">
            <input type="checkbox" checked={notificationSettings.enabled} onChange={(e) => setNotificationSettings((current) => ({ ...current, enabled: e.target.checked }))} />
            <span>Увімкнути автоматичну перевірку і відправку</span>
          </label>
          <label className="fieldBlock">
            <span className="fieldLabel">Час надсилання</span>
            <span className="fieldHint">Час, коли система щодня перевіряє товари і відправляє сповіщення.</span>
            <input type="time" value={notificationSettings.time} onChange={(e) => setNotificationSettings((current) => ({ ...current, time: e.target.value }))} />
          </label>
          <label className="fieldBlock">
            <span className="fieldLabel">Днів до завершення терміну</span>
            <span className="fieldHint">Скільки днів до кінця терміну придатності вважати критичними.</span>
            <input type="number" min="1" max="30" value={notificationSettings.daysBefore} onChange={(e) => setNotificationSettings((current) => ({ ...current, daysBefore: Number(e.target.value) }))} />
          </label>
          <p className="settingsHint">Остання автоматична відправка: {notificationSettings.lastSentDate ?? "ще не було"}</p>
          <button type="button" onClick={() => void handleSaveNotificationSettings()} disabled={savingSettings}>
            {savingSettings ? "Збереження..." : "Зберегти автосповіщення"}
          </button>
        </div>
      </section>

      <section className="panel settingsPanel settingsPanelWide">
        <h2>Supabase та розширення API</h2>
        <div className="menuHintBox">
          <strong>SQL-файли вже підготовлені</strong>
          <p>Для запуску бази в Supabase використовуй `001_schema.sql`, `002_rls_policies.sql`, `003_seed.sql` і `004_api_support.sql` з папки `database/supabase`.</p>
        </div>
        <div className="details">
          <p><strong>Що вже покрито:</strong> магазини, користувачі, товари, партії, журнали дій, журнали повідомлень, notification settings, telegram state.</p>
          <p><strong>Що готово для API:</strong> views `api_stores_v`, `api_employees_v`, `api_products_v` і helper functions для пошуку користувача по `chat_id`, налаштувань Telegram та upsert партій.</p>
          <p><strong>Що ще треба доробити:</strong> нормалізувати поточні UI-статуси товару під `check_status` у БД і перевести `apps/api` з in-memory масивів на запити в Supabase.</p>
        </div>
      </section>
    </div>
  );

  const employeesContent = (
    <section className="panel employeesShell">
      <div className="employeesPageGrid">
      <section className="employeesPanel">
        <div className="employeeTableWrap">
          <div className="employeeTable">
            <div className="employeeTableHead">
              <span>Ім'я</span>
              <span>Роль</span>
              <span>Магазин</span>
              <span>Telegram ID</span>
              <span>Статус</span>
              <span>Остання дія</span>
            </div>
            {employees.map((employee) => (
              <button
                key={employee.id}
                type="button"
                className={`employeeRow ${selectedEmployee?.id === employee.id ? "selected" : ""}`}
                onClick={() => setSelectedEmployeeId(employee.id)}
              >
                <strong>{employee.fullName}</strong>
                <span>{employee.role}</span>
                <span>{employee.storeName}</span>
                <span>{employee.telegramClientId}</span>
                <span>
                  <span className={`statusBadge employee-status-${employee.status}`}>{employee.status}</span>
                </span>
                <span>{employee.lastActivityAt} · {employee.lastAction}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="employeeDetailsPanel">
        <h2>Картка співробітника</h2>
        {selectedEmployee ? (
          <form className="employeeDetails" onSubmit={handleUpdateEmployee}>
            <div className="employeeMetaGrid">
              <label className="fieldBlock">
                <span className="fieldLabel">Ім'я</span>
                <input value={employeeEditForm.name} onChange={(event) => setEmployeeEditForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="fieldBlock">
                <span className="fieldLabel">Прізвище</span>
                <input value={employeeEditForm.surname} onChange={(event) => setEmployeeEditForm((current) => ({ ...current, surname: event.target.value }))} />
              </label>
              <label className="fieldBlock">
                <span className="fieldLabel">Роль</span>
                <select value={employeeEditForm.role} onChange={(event) => setEmployeeEditForm((current) => ({ ...current, role: event.target.value }))}>
                  <option value="user">user</option>
                  <option value="manager">manager</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label className="fieldBlock">
                <span className="fieldLabel">Магазин</span>
                <select value={employeeEditForm.storeId} onChange={(event) => setEmployeeEditForm((current) => ({ ...current, storeId: event.target.value }))}>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} · {store.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fieldBlock">
                <span className="fieldLabel">Telegram ID</span>
                <input value={employeeEditForm.telegramClientId} onChange={(event) => setEmployeeEditForm((current) => ({ ...current, telegramClientId: event.target.value }))} />
              </label>
              <label className="checkboxRow">
                <input type="checkbox" checked={employeeEditForm.isActive} onChange={(event) => setEmployeeEditForm((current) => ({ ...current, isActive: event.target.checked }))} />
                <span>Активний користувач</span>
              </label>
              <p><strong>Остання активність:</strong> {selectedEmployee.lastActivityAt}</p>
              <p className="employeeLastAction"><strong>Остання дія:</strong> {selectedEmployee.lastAction}</p>
            </div>
            <button type="submit" disabled={savingEmployee}>
              {savingEmployee ? "Збереження..." : "Зберегти користувача"}
            </button>
            <div className="employeeActivityBlock">
              <h3>Останні дії</h3>
              <div className="employeeActivityList">
                {selectedEmployee.activityLog.map((activity, index) => (
                  <article key={`${activity.at}-${index}`} className="employeeActivityItem">
                    <strong>{activity.at}</strong>
                    <p>{activity.action}</p>
                  </article>
                ))}
              </div>
            </div>
          </form>
        ) : (
          <p>Оберіть співробітника зі списку.</p>
        )}
      </aside>
      </div>
    </section>
  );

  const deliveryBatchesContent = (
    <section className="panel employeesShell">
      <div className="toolbar">
        <div className="toolbarTitle">
          <h2>Партії поставок</h2>
        </div>
        <div className="filters">
          <span className="statusBadge status-нове">Усього: {batchesSummary.total}</span>
          <span className="statusBadge employee-status-на зміні">Активні: {batchesSummary.active}</span>
          <span className="statusBadge employee-status-відсутній">Закриті: {batchesSummary.closed}</span>
        </div>
      </div>
      <div className="productTableWrap">
        <div className="productTable deliveryBatchTable">
          <div className="tableHead deliveryBatchHead">
            <span>Партія</span>
            <span>Магазин</span>
            <span>Дата</span>
            <span>Статус</span>
            <span>Позицій</span>
            <span>Створив</span>
            <span>Дія</span>
          </div>
          {sortedDeliveryBatches.map((batch) => (
            <article key={batch.id} className="tableRow deliveryBatchRow">
              <strong>{batch.label}</strong>
              <span>{batch.storeName}</span>
              <span>{batch.deliveryDate}</span>
              <span>
                <span className={`statusBadge ${batch.status === "open" ? "employee-status-на зміні" : "employee-status-відсутній"}`}>
                  {batch.status === "open" ? "активна" : "закрита"}
                </span>
              </span>
              <span>{batch.items.length}</span>
              <span>{batch.createdByFullName || "—"}</span>
              <span>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => setSelectedDeliveryBatchId(batch.id)}
                >
                  Переглянути
                </button>
              </span>
            </article>
          ))}
          {!sortedDeliveryBatches.length && (
            <p className="emptyState">Поки що немає жодної створеної партії поставки.</p>
          )}
        </div>
      </div>
    </section>
  );

  const storesContent = (
    <section className="panel employeesShell">
      <div className="employeesPageGrid">
        <section className="employeesPanel">
          <div className="toolbar">
            <div className="toolbarTitle">
              <h2>Магазини</h2>
            </div>
          </div>
          <div className="productTableWrap">
            <div className="productTable deliveryBatchTable">
              <div className="tableHead deliveryBatchHead">
                <span>Код</span>
                <span>Назва</span>
                <span>Статус</span>
                <span>ID</span>
                <span></span>
                <span></span>
                <span></span>
              </div>
              {stores.map((store) => (
                <button key={store.id} type="button" className={`tableRow deliveryBatchRow ${selectedStore?.id === store.id ? "selected" : ""}`} onClick={() => setSelectedStoreId(store.id)}>
                  <strong>{store.code}</strong>
                  <span>{store.name}</span>
                  <span>
                    <span className={`statusBadge ${store.isActive ? "employee-status-на зміні" : "employee-status-відсутній"}`}>
                      {store.isActive ? "активний" : "неактивний"}
                    </span>
                  </span>
                  <span>{store.id}</span>
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
              ))}
              {!stores.length && <p className="emptyState">Поки що немає магазинів.</p>}
            </div>
          </div>
        </section>

        <aside className="employeeDetailsPanel">
          <h2>Редагування магазину</h2>
          <form className="details" onSubmit={handleUpdateStore}>
            <label className="fieldBlock">
              <span className="fieldLabel">Код магазину</span>
              <input
                placeholder="Наприклад: M4"
                value={storeEditForm.code}
                onChange={(event) => setStoreEditForm((current) => ({ ...current, code: event.target.value }))}
                required
              />
            </label>
            <label className="fieldBlock">
              <span className="fieldLabel">Назва магазину</span>
              <input
                placeholder="Наприклад: Магазин Центр"
                value={storeEditForm.name}
                onChange={(event) => setStoreEditForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={storeEditForm.isActive}
                onChange={(event) => setStoreEditForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              <span>Магазин активний</span>
            </label>
            <button type="submit" disabled={savingStore || !selectedStore}>
              {savingStore ? "Збереження..." : "Зберегти магазин"}
            </button>
          </form>
          <h2>Додати магазин</h2>
          <form className="details" onSubmit={handleCreateStore}>
            <label className="fieldBlock">
              <span className="fieldLabel">Код магазину</span>
              <input
                placeholder="Наприклад: M4"
                value={storeForm.code}
                onChange={(event) => setStoreForm((current) => ({ ...current, code: event.target.value }))}
                required
              />
            </label>
            <label className="fieldBlock">
              <span className="fieldLabel">Назва магазину</span>
              <input
                placeholder="Наприклад: Магазин Центр"
                value={storeForm.name}
                onChange={(event) => setStoreForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={storeForm.isActive}
                onChange={(event) => setStoreForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              <span>Магазин активний</span>
            </label>
            <button type="submit" disabled={submittingStore}>
              {submittingStore ? "Збереження..." : "Додати магазин"}
            </button>
          </form>
        </aside>
      </div>
    </section>
  );

  function renderPageShell(input: {
    eyebrow: string;
    title: string;
    text: string;
    content: React.ReactNode;
    compact?: boolean;
    summary?: React.ReactNode;
  }) {
    return (
      <div className="page receivePage">
        <section className={`hero ${input.compact ? "heroCompact" : ""}`}>
          <div>
            <p className="eyebrow">{input.eyebrow}</p>
            <h1>{input.title}</h1>
            <p className="heroText">{input.text}</p>
          </div>
        </section>
        {input.summary}
        <section className="appShell">
          {renderSidebar()}
          <div className="pageSectionContent">{input.content}</div>
        </section>
      </div>
    );
  }

  if (viewMode === "receive") {
    return renderPageShell({
      eyebrow: "Приймання партії",
      title: "Додати новий товар у систему",
      text: "Цю форму можна відкривати прямо з Telegram-команди. Для бота використовуйте `/newproduct` або `/addproduct`.",
      compact: true,
      content: (
        <div className="receiveLayout">
          <div className="panel receivePanel">
            <div className="receiveHeader">
              <h2>Нова партія товару</h2>
              <button type="button" onClick={() => navigate("/")} className="ghostButton">Повернутись до dashboard</button>
            </div>
            {productForm}
          </div>
        </div>
      ),
    });
  }

  if (viewMode === "settings") {
    return renderPageShell({
      eyebrow: "Налаштування",
      title: "Синхронізація з Telegram",
      text: "Тут налаштовується отримання `chat_id`, робота команд бота і автоматичні сповіщення.",
      content: settingsContent,
    });
  }

  if (viewMode === "employees") {
    return renderPageShell({
      eyebrow: "Користувачі",
      title: "Співробітники і магазини",
      text: "Тут видно, хто де працює, за яким магазином закріплений і коли востаннє виконував дію в системі.",
      content: employeesContent,
    });
  }

  if (viewMode === "delivery-batches") {
    return (
      <>
        {renderPageShell({
          eyebrow: "Партії",
          title: "Журнал поставок",
          text: "Тут видно всі створені партії поставок, активні та закриті, і склад кожної партії окремо.",
          content: deliveryBatchesContent,
        })}
        {selectedDeliveryBatch && (
          <div className="modalOverlay" onClick={() => setSelectedDeliveryBatchId(null)}>
            <div className="modalCard" onClick={(event) => event.stopPropagation()}>
              <div className="receiveHeader">
                <h2>Партія {selectedDeliveryBatch.label}</h2>
                <button type="button" className="ghostButton" onClick={() => setSelectedDeliveryBatchId(null)}>
                  Закрити
                </button>
              </div>
              <div className="details">
                <p><strong>Магазин:</strong> {selectedDeliveryBatch.storeName}</p>
                <p><strong>Дата:</strong> {selectedDeliveryBatch.deliveryDate}</p>
                <p><strong>Статус:</strong> {selectedDeliveryBatch.status === "open" ? "активна" : "закрита"}</p>
                <p><strong>Створив:</strong> {selectedDeliveryBatch.createdByFullName || "—"}</p>
              </div>
              <div className="batchList">
                {selectedDeliveryBatch.items.map((item) => (
                  <article key={item.id} className="batchCard">
                    <div className="batchCardHeader">
                      <strong>{item.name}</strong>
                      <span className={`statusBadge status-${item.status}`}>{item.status}</span>
                    </div>
                    <p><strong>Категорія:</strong> {item.category || "—"}</p>
                    <p><strong>Штрихкод:</strong> {item.barcode || "—"}</p>
                    <p><strong>Кількість:</strong> {item.quantity}</p>
                    <p><strong>Термін до:</strong> {item.expiresAt}</p>
                    <p><strong>Коментар:</strong> {item.notes || "—"}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (viewMode === "store-layout") {
    return renderPageShell({
      eyebrow: "Карта магазину",
      title: "Розміщення товарів",
      text: "Схема магазину та швидкий перегляд розміщення товарів за поточними даними.",
      content: <StoreLayoutPage onBack={() => navigate("/")} products={products} />,
    });
  }

  if (viewMode === "stores") {
    return renderPageShell({
      eyebrow: "Магазини",
      title: "Список магазинів",
      text: "Тут видно магазини, які є в базі, і можна додати або відредагувати магазин для подальшої роботи в системі.",
      content: storesContent,
    });
  }

  return renderPageShell({
    eyebrow: "TelegramChick",
    title: "Простий тестовий MVP контролю термінів придатності",
    text: "Додавайте товари, контролюйте статуси і перевіряйте сценарій майбутніх Telegram-сповіщень без зайвої складності.",
    summary: (
      <section className="summaryGrid">
        <article className="summaryCard neutral"><span className="summaryLabel">Усього товарів</span><strong className="summaryValue">{summary.total}</strong></article>
        <article className="summaryCard warning"><span className="summaryLabel">Скоро спливають</span><strong className="summaryValue">{summary.expiring}</strong></article>
        <article className="summaryCard danger"><span className="summaryLabel">Прострочені</span><strong className="summaryValue">{summary.expired}</strong></article>
        <article className="summaryCard info"><span className="summaryLabel">В роботі</span><strong className="summaryValue">{summary.inProgress}</strong></article>
      </section>
    ),
    content: (
      <section className="layout">
            <main className="panel">
              <div className="toolbar">
                <div className="toolbarTitle">
                  <h2>Список товарів</h2>
                  <button type="button" className="menuButton menuButtonPrimary toolbarActionButton" onClick={() => navigate("/receive")}>
                    Додати товар
                  </button>
                </div>
                <div className="filters">
                  <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Усі</button>
                  <button className={filter === "expiring" ? "active" : ""} onClick={() => setFilter("expiring")}>Скоро завершуються</button>
                  <button className={filter === "expired" ? "active" : ""} onClick={() => setFilter("expired")}>Прострочені</button>
                </div>
              </div>

              {loading ? (
                <p>Завантаження...</p>
              ) : (
                <div className="productTableWrap">
                  <div className="productTable">
                    <div className="tableHead">
                      <span>Назва</span>
                      <span>Категорія</span>
                      <span>Партія</span>
                      <span>К-сть</span>
                      <span>Штрихкод</span>
                      <span>Термін до</span>
                      <span>Статус</span>
                    </div>
                    {visibleProducts.map((product) => {
                      const expiryState = product.worstExpiryState;
                      const isSelected = selectedGroup?.id === product.id;
                      return (
                        <button key={product.id} className={`tableRow ${isSelected ? "selected" : ""} ${expiryState}`} onClick={() => setSelectedId(product.batches[0]?.id ?? null)}>
                          <strong>{product.name}</strong>
                          <span>{product.category || "—"}</span>
                          <span>{product.batches.length} парт.</span>
                          <span>{product.totalQuantity}</span>
                          <span>{product.barcode || "—"}</span>
                          <span><span className={`expiryBadge ${expiryState}`}>{product.nearestExpiry}</span></span>
                          <span><span className={`statusBadge status-${product.batches[0]?.status ?? "нове"}`}>{product.batches.length} партій</span></span>
                        </button>
                      );
                    })}
                    {!visibleProducts.length && <p className="emptyState">Поки що немає товарів у цьому фільтрі.</p>}
                  </div>
                </div>
              )}
            </main>

            <aside className="panel detailsPanel">
              <h2>Деталі товару</h2>
              {selectedProduct && selectedGroup ? (
                <div className="details">
                  <p><strong>Назва:</strong> {selectedGroup.name}</p>
                  <p><strong>Категорія:</strong> {selectedGroup.category || "—"}</p>
                  <p><strong>Штрихкод:</strong> {selectedGroup.barcode || "—"}</p>
                  <p><strong>Усього партій:</strong> {selectedGroup.batches.length}</p>
                  <p><strong>Сумарна кількість:</strong> {selectedGroup.totalQuantity}</p>
                  <p><strong>Магазини:</strong> {selectedGroup.storeNames.join(", ") || "—"}</p>
                  <p><strong>Найближчий термін:</strong> {selectedGroup.nearestExpiry}</p>
                  <p><strong>Останнє надходження:</strong> {selectedGroup.latestReceivedAt || "—"}</p>
                  <div className="batchActions">
                    <button
                      type="button"
                      onClick={() => {
                        navigate("/delivery-batches");
                      }}
                    >
                      Перейти до партії
                    </button>
                    <button type="button" onClick={() => void handleTelegramPreview(selectedProduct.id)}>Згенерувати Telegram preview</button>
                    <button type="button" onClick={() => void handleTelegramSend(selectedProduct.id)}>Надіслати в Telegram</button>
                  </div>
                  <button type="button" className="ghostButton" onClick={() => navigate("/settings")}>Відкрити налаштування Telegram</button>
                </div>
              ) : (
                <p>Оберіть товар зі списку.</p>
              )}
            </aside>
      </section>
    ),
  });
}







