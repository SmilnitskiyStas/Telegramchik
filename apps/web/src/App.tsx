import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Product, ProductStatus } from "./types";
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

type ExpiryState = "fresh" | "expiring" | "expired";
type ViewMode = "dashboard" | "receive" | "settings" | "employees" | "store-layout";
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
  if (window.location.pathname === "/receive") return "receive";
  if (window.location.pathname === "/settings") return "settings";
  if (window.location.pathname === "/employees") return "employees";
  if (window.location.pathname === "/store-layout") return "store-layout";
  return "dashboard";
}

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(getViewMode());
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    new URLSearchParams(window.location.search).get("productId"),
  );
  const [filter, setFilter] = useState<"all" | "expiring" | "expired">("all");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    defaultNotificationSettings,
  );
  const [form, setForm] = useState(() => {
    return createEmptyForm();
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
  }

  useEffect(() => {
    void loadProducts();
    void loadEmployees();
    void loadStores();
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

  const selectedEmployee = useMemo(
    () =>
      employees.find((employee) => employee.id === selectedEmployeeId) ??
      employees[0] ??
      null,
    [employees, selectedEmployeeId],
  );

  const visibleProducts = useMemo(() => {
    const now = new Date();

    return products.filter((product) => {
      const expiresAt = new Date(product.expiresAt);
      const diffDays = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (filter === "expired") return diffDays < 0;
      if (filter === "expiring") return diffDays >= 0 && diffDays <= 7;
      return true;
    });
  }, [filter, products]);

  const summary = useMemo(() => {
    const expiring = products.filter(
      (product) => getExpiryState(product.expiresAt) === "expiring",
    ).length;
    const expired = products.filter(
      (product) => getExpiryState(product.expiresAt) === "expired",
    ).length;
    const inProgress = products.filter(
      (product) => product.status === "в роботі",
    ).length;

    return { total: products.length, expiring, expired, inProgress };
  }, [products]);

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
    setSelectedId(created.id);
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

  async function handleTelegramPreview() {
    if (!selectedProduct) return;

    await fetch(`${API_URL}/telegram/preview/${selectedProduct.id}`, {
      method: "POST",
    });

    window.alert("Тестова Telegram-нотифікація згенерована в API логах.");
  }

  async function handleTelegramSend() {
    if (!selectedProduct) return;

    const response = await fetch(`${API_URL}/telegram/notify/${selectedProduct.id}`, {
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
          <div className="employeeDetails">
            <div className="employeeMetaGrid">
              <p><strong>Ім'я:</strong> {selectedEmployee.fullName}</p>
              <p><strong>Роль:</strong> {selectedEmployee.role}</p>
              <p><strong>Магазин:</strong> {selectedEmployee.storeName}</p>
              <p><strong>Telegram ID:</strong> {selectedEmployee.telegramClientId}</p>
              <p><strong>Статус:</strong> <span className={`statusBadge employee-status-${selectedEmployee.status}`}>{selectedEmployee.status}</span></p>
              <p><strong>Остання активність:</strong> {selectedEmployee.lastActivityAt}</p>
              <p className="employeeLastAction"><strong>Остання дія:</strong> {selectedEmployee.lastAction}</p>
            </div>
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
          </div>
        ) : (
          <p>Оберіть співробітника зі списку.</p>
        )}
      </aside>
      </div>
    </section>
  );

  if (viewMode === "receive") {
    return (
      <div className="page receivePage">
        <section className="hero heroCompact">
          <div>
            <p className="eyebrow">Приймання партії</p>
            <h1>Додати новий товар у систему</h1>
            <p className="heroText">Цю форму можна відкривати прямо з Telegram-команди. Для бота використовуйте `/newproduct` або `/addproduct`.</p>
          </div>
        </section>
        <section className="appShell">
          {renderSidebar()}
          <div className="receiveLayout">
            <div className="panel receivePanel">
              <div className="receiveHeader">
                <h2>Нова партія товару</h2>
                <button type="button" onClick={() => navigate("/")} className="ghostButton">Повернутись до dashboard</button>
              </div>
              {productForm}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (viewMode === "settings") {
    return (
      <div className="page receivePage">
        <section className="hero">
          <div>
            <p className="eyebrow">Налаштування</p>
            <h1>Синхронізація з Telegram</h1>
            <p className="heroText">Тут налаштовується отримання `chat_id`, робота команд бота і автоматичні сповіщення.</p>
          </div>
        </section>
        <section className="appShell">
          {renderSidebar()}
          <div className="pageSectionContent">{settingsContent}</div>
        </section>
      </div>
    );
  }

  if (viewMode === "employees") {
    return (
      <div className="page receivePage">
        <section className="hero">
          <div>
            <p className="eyebrow">Користувачі</p>
            <h1>Співробітники і магазини</h1>
            <p className="heroText">Тут видно, хто де працює, за яким магазином закріплений і коли востаннє виконував дію в системі.</p>
          </div>
        </section>
        <section className="appShell">
          {renderSidebar()}
          <div className="pageSectionContent">{employeesContent}</div>
        </section>
      </div>
    );
  }

  if (viewMode === "store-layout") {
    return <StoreLayoutPage onBack={() => navigate("/")} products={products} />;
  }

  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">TelegramChick</p>
          <h1>Простий тестовий MVP контролю термінів придатності</h1>
          <p className="heroText">Додавайте товари, контролюйте статуси і перевіряйте сценарій майбутніх Telegram-сповіщень без зайвої складності.</p>
          <div className="heroActions">
            <button type="button" onClick={() => navigate("/receive")} className="lightButton">Прийняти нову партію</button>
          </div>
        </div>
      </section>

      <section className="summaryGrid">
        <article className="summaryCard neutral"><span className="summaryLabel">Усього товарів</span><strong className="summaryValue">{summary.total}</strong></article>
        <article className="summaryCard warning"><span className="summaryLabel">Скоро спливають</span><strong className="summaryValue">{summary.expiring}</strong></article>
        <article className="summaryCard danger"><span className="summaryLabel">Прострочені</span><strong className="summaryValue">{summary.expired}</strong></article>
        <article className="summaryCard info"><span className="summaryLabel">В роботі</span><strong className="summaryValue">{summary.inProgress}</strong></article>
      </section>

      <section className="appShell">
        {renderSidebar()}
        <div className="pageSectionContent">
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
                      const expiryState = getExpiryState(product.expiresAt);
                      return (
                        <button key={product.id} className={`tableRow ${selectedId === product.id ? "selected" : ""} ${expiryState}`} onClick={() => setSelectedId(product.id)}>
                          <strong>{product.name}</strong>
                          <span>{product.category || "—"}</span>
                          <span>{product.batch}</span>
                          <span>{product.quantity}</span>
                          <span>{product.barcode || "—"}</span>
                          <span><span className={`expiryBadge ${expiryState}`}>{product.expiresAt}</span></span>
                          <span><span className={`statusBadge status-${product.status}`}>{product.status}</span></span>
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
              {selectedProduct ? (
                <div className="details">
                  <p><strong>Назва:</strong> {selectedProduct.name}</p>
                  <p><strong>Категорія:</strong> {selectedProduct.category || "—"}</p>
                  <p><strong>Штрихкод:</strong> {selectedProduct.barcode || "—"}</p>
                  <p><strong>Партія:</strong> {selectedProduct.batch}</p>
                  <p><strong>Магазин:</strong> {getStoreName(selectedProduct.storeId) || "—"}</p>
                  <p><strong>Кількість:</strong> {selectedProduct.quantity}</p>
                  <p><strong>Прийняв:</strong> {getEmployeeFullName(selectedProduct.receivedByUserId) || "—"}</p>
                  <p><strong>Надійшов:</strong> {selectedProduct.receivedAt}</p>
                  <p><strong>Термін до:</strong> {selectedProduct.expiresAt}</p>
                  <p><strong>Коментар:</strong> {selectedProduct.notes || "—"}</p>
                  <label>
                    Статус
                    <select value={selectedProduct.status} onChange={(e) => void handleStatusChange(selectedProduct.id, e.target.value as ProductStatus)}>
                      {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => void handleTelegramPreview()}>Згенерувати Telegram preview</button>
                  <button type="button" onClick={() => void handleTelegramSend()}>Надіслати в Telegram</button>
                  <button type="button" className="ghostButton" onClick={() => navigate("/settings")}>Відкрити налаштування Telegram</button>
                </div>
              ) : (
                <p>Оберіть товар зі списку.</p>
              )}
            </aside>
          </section>
        </div>
      </section>
    </div>
  );
}







