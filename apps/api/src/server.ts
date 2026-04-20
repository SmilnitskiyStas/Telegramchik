import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NotificationSettings,
  readSettings,
  writeSettings
} from "./notification-settings.js";
import { readTelegramState, writeTelegramState } from "./telegram-state.js";
import {
  employees,
  findEmployeeByChatId,
  findEmployeeById,
  touchEmployeeActivity
} from "./employees.js";
import { findStoreById, stores } from "./stores.js";
import {
  createCatalogItem,
  createProductBatch,
  findBatchById,
  findCatalogItemByBarcode,
  findJoinedProductByBatchId,
  getJoinedProducts
} from "./data.js";
import { hasDatabase } from "./db.js";
import {
  createStore as createStoreInDatabase,
  completeTelegramRegistration as completeTelegramRegistrationInDatabase,
  createProduct as createProductInDatabase,
  closeCurrentDeliveryBatch as closeCurrentDeliveryBatchInDatabase,
  getCurrentOpenDeliveryBatch as getCurrentOpenDeliveryBatchFromDatabase,
  getDeliveryBatchById as getDeliveryBatchByIdFromDatabase,
  getDeliveryBatches as getDeliveryBatchesFromDatabase,
  getEmployeeById as getEmployeeByIdFromDatabase,
  getEmployeeByChatId as getEmployeeByChatIdFromDatabase,
  getEmployees as getEmployeesFromDatabase,
  getNotificationSettings as getNotificationSettingsFromDatabase,
  getProductByBatchId as getProductByBatchIdFromDatabase,
  getProducts as getProductsFromDatabase,
  getStores as getStoresFromDatabase,
  getTelegramState as getTelegramStateFromDatabase,
  hasNotificationTypeBeenSentOnDate,
  insertNotificationLog,
  saveNotificationSettings as saveNotificationSettingsToDatabase,
  saveTelegramState as saveTelegramStateToDatabase,
  updateEmployee as updateEmployeeInDatabase,
  updateProductStatus as updateProductStatusInDatabase,
  updateStore as updateStoreInDatabase,
} from "./postgres-store.js";
import { Product, ProductStatus } from "./types.js";

type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    from?: {
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat?: {
      id?: number;
    };
  };
};

type TelegramReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const webDistCandidates = [
  path.resolve(process.cwd(), "apps/web/dist"),
  path.resolve(currentDir, "../../web/dist"),
  path.resolve(currentDir, "../../../apps/web/dist")
];
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(currentDir, "../.env"),
  path.resolve(currentDir, "../../.env"),
  path.resolve(currentDir, "../../../.env")
];

for (const envPath of envCandidates) {
  const result = dotenv.config({ path: envPath, quiet: true });
  if (!result.error && result.parsed) {
    break;
  }
}

const app = express();
const port = Number(process.env.PORT || 3001);
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const defaultTelegramChatId = process.env.TELEGRAM_CHAT_ID ?? "";
const appUrl = process.env.APP_URL ?? `http://localhost:${port}`;
const automaticNotificationsEnabled = process.env.AUTO_NOTIFICATIONS_ENABLED === "true";
const telegramPollingEnabled = process.env.TELEGRAM_POLLING_ENABLED === "true";
const telegramWebhookEnabled = process.env.TELEGRAM_WEBHOOK_ENABLED !== "false";
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
let notificationSettings = readSettings(defaultTelegramChatId);
let telegramState = readTelegramState();
const webDistPath = webDistCandidates.find((candidate) => fs.existsSync(candidate));
const databaseConfigured = hasDatabase();
let databaseEnabled = databaseConfigured;
let autoNotificationInFlight = false;
let autoNotificationSentKey: string | null = null;
const processedTelegramUpdates = new Map<number, number>();

app.use(cors());
app.use(express.json());

function ensureTelegramConfigured() {
  if (!telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
}

async function loadNotificationSettings() {
  if (!databaseEnabled) {
    return notificationSettings;
  }

  notificationSettings = await getNotificationSettingsFromDatabase(defaultTelegramChatId);
  return notificationSettings;
}

async function persistSettings(nextSettings: NotificationSettings) {
  notificationSettings = nextSettings;
  if (databaseEnabled) {
    await saveNotificationSettingsToDatabase(nextSettings);
    return;
  }

  writeSettings(nextSettings);
}

async function loadTelegramState() {
  if (!databaseEnabled) {
    return telegramState;
  }

  telegramState = await getTelegramStateFromDatabase();
  return telegramState;
}

async function persistTelegramState(lastUpdateId: number) {
  telegramState = { lastUpdateId };
  if (databaseEnabled) {
    await saveTelegramStateToDatabase(telegramState);
    return;
  }

  writeTelegramState(telegramState);
}

async function telegramRequest(method: string, body?: Record<string, unknown>) {
  ensureTelegramConfigured();

  const response = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/${method}`,
    {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    },
  );

  const data = (await response.json()) as {
    ok: boolean;
    result?: unknown;
    description?: string;
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? "Telegram request failed");
  }

  return data.result;
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  return telegramRequest("sendMessage", body);
}

function buildProductDetailsLink(productId: string) {
  return `${appUrl}/?productId=${encodeURIComponent(productId)}`;
}

function canUseTelegramUrl(url: string) {
  return url.startsWith("https://");
}

function getProductReceiverName(product: Product) {
  return product.receiverFullName ?? findEmployeeById(product.receivedByUserId)?.fullName ?? "—";
}

function getProductStoreName(product: Product) {
  return product.storeName ?? findStoreById(product.storeId)?.name ?? "—";
}

function buildProductNotification(product: Product) {
  const receiverFullName = getProductReceiverName(product);

  return [
    "Товар скоро завершить термін придатності",
    `Назва: ${product.name}`,
    `Категорія: ${product.category || "—"}`,
    `Магазин: ${getProductStoreName(product)}`,
    `Штрихкод: ${product.barcode || "—"}`,
    `Партія: ${product.batch}`,
    `Термін до: ${product.expiresAt}`,
    `Статус: ${product.status}`,
    `Прийняв: ${receiverFullName || "—"}`
  ].join("\n");
}

function buildProductReplyMarkup(productId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "Відкрити товар у системі",
          url: buildProductDetailsLink(productId)
        }
      ]
    ]
  };
}

function getSystemReplyMarkup(): TelegramReplyMarkup | undefined {
  if (!canUseTelegramUrl(appUrl)) {
    return undefined;
  }

  return {
    inline_keyboard: [
      [
        {
          text: "Відкрити систему",
          url: appUrl
        }
      ]
    ]
  };
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentTimeKey() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function rememberProcessedTelegramUpdate(updateId: number) {
  const now = Date.now();
  processedTelegramUpdates.set(updateId, now);

  for (const [storedUpdateId, storedAt] of processedTelegramUpdates.entries()) {
    if (now - storedAt > 10 * 60 * 1000) {
      processedTelegramUpdates.delete(storedUpdateId);
    }
  }
}

function hasProcessedTelegramUpdate(updateId: number) {
  return processedTelegramUpdates.has(updateId);
}

function getTelegramWebhookUrl() {
  return `${appUrl.replace(/\/+$/, "")}/telegram/webhook`;
}

async function getProductsForNotification(daysBefore: number) {
  const now = new Date();
  const products = databaseEnabled ? await getProductsFromDatabase() : getJoinedProducts();

  return products.filter((product: Product) => {
    const expiresAt = new Date(product.expiresAt);
    const diffDays = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return diffDays >= 0 && diffDays <= daysBefore;
  });
}

function buildDigestMessage(items: Product[], daysBefore: number) {
  const lines = [
    "Нагадування TelegramChick",
    `Товари, у яких термін придатності спливає протягом ${daysBefore} дн.`,
    ""
  ];

  for (const item of items) {
    lines.push(
      `• ${item.name} | категорія ${item.category || "—"} | штрихкод ${item.barcode || "—"} | партія ${item.batch} | до ${item.expiresAt} | статус: ${item.status}`,
    );
  }

  return lines.join("\n");
}

function buildReceiveLink(chatId: string) {
  return `${appUrl}/?mode=receive&clientId=${encodeURIComponent(chatId)}`;
}

function buildRegistrationLink(chatId: string) {
  return `${appUrl}/register?clientId=${encodeURIComponent(chatId)}`;
}

async function findEmployeeForChatId(chatId: string) {
  if (databaseEnabled) {
    return getEmployeeByChatIdFromDatabase(chatId);
  }

  return findEmployeeByChatId(chatId);
}

async function registerTelegramEmployeeIfNeeded(input: {
  chatId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}) {
  const existing = await findEmployeeForChatId(input.chatId);
  if (existing) {
    return existing;
  }
  return null;
}

function buildTelegramWelcomeMessage(fullName?: string) {
  return [
    `Вітаю${fullName ? `, ${fullName}` : ""}.`,
    "TelegramChick підключено.",
    "",
    "Команди:",
    "/start - реєстрація або повторне підключення",
    "/newproduct - відкрити форму додавання нової партії",
  ].join("\n");
}

function buildTelegramRegistrationMessage() {
  return [
    "Користувача ще не зареєстровано.",
    "Відкрийте форму реєстрації, виберіть магазин і заповніть свої дані.",
  ].join("\n");
}

async function handleTelegramUpdate(update: TelegramUpdate) {
  const text = update.message?.text?.trim().toLowerCase();
  const chatId = update.message?.chat?.id;
  const from = update.message?.from;

  if (typeof update.update_id === "number" && hasProcessedTelegramUpdate(update.update_id)) {
    return;
  }

  if (typeof update.update_id === "number") {
    await persistTelegramState(update.update_id);
    rememberProcessedTelegramUpdate(update.update_id);
  }

  if (!text || typeof chatId !== "number") {
    return;
  }

  if (text === "/start") {
    const employee = await registerTelegramEmployeeIfNeeded({
      chatId: String(chatId),
      firstName: from?.first_name,
      lastName: from?.last_name,
      username: from?.username,
    });

    if (!employee) {
      const registrationLink = buildRegistrationLink(String(chatId));
      await sendTelegramMessage(
        String(chatId),
        canUseTelegramUrl(registrationLink)
          ? buildTelegramRegistrationMessage()
          : `${buildTelegramRegistrationMessage()}\n${registrationLink}`,
        canUseTelegramUrl(registrationLink)
          ? {
              inline_keyboard: [
                [
                  {
                    text: "Зареєструватися",
                    url: registrationLink,
                  }
                ]
              ]
            }
          : undefined,
      );
      return;
    }

    await sendTelegramMessage(
      String(chatId),
      buildTelegramWelcomeMessage(employee?.fullName),
      getSystemReplyMarkup(),
    );
    return;
  }

  if (text === "/newproduct" || text === "/addproduct") {
    const employee = await findEmployeeForChatId(String(chatId));

    if (!employee) {
      await sendTelegramMessage(
        String(chatId),
        "Користувача не знайдено. Спочатку надішліть /start для автоматичної реєстрації.",
        getSystemReplyMarkup(),
      );
      return;
    }

    await sendTelegramMessage(
      String(chatId),
      canUseTelegramUrl(buildReceiveLink(String(chatId)))
        ? "Відкрийте форму приймання нової партії товару:"
        : `Форма приймання нової партії товару: ${buildReceiveLink(String(chatId))}`,
      canUseTelegramUrl(buildReceiveLink(String(chatId)))
        ? {
            inline_keyboard: [
              [
                {
                  text: "Додати новий товар",
                  url: buildReceiveLink(String(chatId))
                }
              ]
            ]
          }
        : undefined,
    );
  }
}

async function ensureTelegramWebhook() {
  if (!telegramWebhookEnabled || !telegramBotToken || !canUseTelegramUrl(appUrl)) {
    return;
  }

  const body: Record<string, unknown> = {
    url: getTelegramWebhookUrl(),
    drop_pending_updates: true,
  };

  if (telegramWebhookSecret) {
    body.secret_token = telegramWebhookSecret;
  }

  await telegramRequest("setWebhook", body);
}

async function runAutomaticNotificationCheck() {
  if (!automaticNotificationsEnabled) {
    return;
  }

  if (autoNotificationInFlight) {
    return;
  }

  const currentSettings = await loadNotificationSettings();

  if (!currentSettings.enabled || !currentSettings.chatId) {
    return;
  }

  const today = getTodayKey();
  const currentTime = getCurrentTimeKey();
  const sendKey = `${today}:${currentSettings.time}:${currentSettings.chatId}`;

  if (currentSettings.lastSentDate === today || autoNotificationSentKey === sendKey) {
    return;
  }

  if (databaseEnabled) {
    const alreadySentToday = await hasNotificationTypeBeenSentOnDate(
      "auto_daily_digest",
      today,
    );

    if (alreadySentToday) {
      autoNotificationSentKey = sendKey;
      return;
    }
  }

  if (currentTime !== currentSettings.time) {
    return;
  }

  const items = await getProductsForNotification(currentSettings.daysBefore);
  if (!items.length) {
    return;
  }

  try {
    autoNotificationInFlight = true;

    await sendTelegramMessage(
      currentSettings.chatId,
      buildDigestMessage(items, currentSettings.daysBefore),
      getSystemReplyMarkup(),
    );

    autoNotificationSentKey = sendKey;

    if (databaseEnabled) {
      await insertNotificationLog({
        notificationType: "auto_daily_digest",
        messageText: buildDigestMessage(items, currentSettings.daysBefore),
      });
    }

    await persistSettings({
      ...currentSettings,
      lastSentDate: today
    });
  } catch (error) {
    console.error("[AUTO NOTIFY ERROR]", error);
  } finally {
    autoNotificationInFlight = false;
  }
}

async function processTelegramCommands() {
  if (!telegramBotToken) {
    return;
  }

  const currentTelegramState = await loadTelegramState();

  try {
    const fetchUpdates = async () => {
      const query = currentTelegramState.lastUpdateId
        ? `getUpdates?offset=${currentTelegramState.lastUpdateId + 1}`
        : "getUpdates";

      return telegramRequest(query) as Promise<TelegramUpdate[]>;
    };

    let updates: TelegramUpdate[];

    try {
      updates = await fetchUpdates();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (!message.includes("can't use getUpdates method while webhook is active")) {
        throw error;
      }

      await telegramRequest("deleteWebhook", {
        drop_pending_updates: false
      });

      updates = await fetchUpdates();
    }

    for (const update of updates) {
      await handleTelegramUpdate(update);
    }
  } catch (error) {
    console.error("[TELEGRAM COMMAND POLL ERROR]", error);
  }
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/products", async (_request, response) => {
  const products = databaseEnabled ? await getProductsFromDatabase() : getJoinedProducts();
  response.json(products);
});

app.get("/employees", async (_request, response) => {
  const nextEmployees = databaseEnabled ? await getEmployeesFromDatabase() : employees;
  response.json(nextEmployees);
});

app.get("/stores", async (_request, response) => {
  const nextStores = databaseEnabled ? await getStoresFromDatabase() : stores;
  response.json(nextStores);
});

app.post("/stores", async (request, response) => {
  const body = request.body as Partial<{
    code: string;
    name: string;
    isActive: boolean;
  }>;

  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const isActive = body.isActive ?? true;

  if (!code || !name) {
    response.status(400).json({ message: "Store code and name are required" });
    return;
  }

  if (databaseEnabled) {
    try {
      const created = await createStoreInDatabase({ code, name, isActive });
      response.status(201).json(created);
      return;
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Failed to create store",
      });
      return;
    }
  }

  const created = {
    id: `store-${Date.now()}`,
    code,
    name,
    isActive,
  };
  stores.push(created);
  response.status(201).json(created);
});

app.put("/stores/:id", async (request, response) => {
  const body = request.body as Partial<{
    code: string;
    name: string;
    isActive: boolean;
  }>;

  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const isActive = Boolean(body.isActive);

  if (!code || !name) {
    response.status(400).json({ message: "Store code and name are required" });
    return;
  }

  if (databaseEnabled) {
    try {
      const updated = await updateStoreInDatabase(request.params.id, { code, name, isActive });
      if (!updated) {
        response.status(404).json({ message: "Store not found" });
        return;
      }
      response.json(updated);
      return;
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Failed to update store",
      });
      return;
    }
  }

  const target = stores.find((store) => store.id === request.params.id);
  if (!target) {
    response.status(404).json({ message: "Store not found" });
    return;
  }

  target.code = code;
  target.name = name;
  target.isActive = isActive;
  response.json(target);
});

app.get("/delivery-batches", async (request, response) => {
  if (!databaseEnabled) {
    response.status(501).json({ ok: false, message: "Delivery batches require database mode" });
    return;
  }

  const storeId =
    typeof request.query.storeId === "string" ? request.query.storeId.trim() : undefined;
  const batches = await getDeliveryBatchesFromDatabase(storeId || undefined);
  response.json(batches);
});

app.get("/delivery-batches/current", async (request, response) => {
  if (!databaseEnabled) {
    response.status(501).json({ ok: false, message: "Delivery batches require database mode" });
    return;
  }

  const storeId = typeof request.query.storeId === "string" ? request.query.storeId.trim() : "";
  if (!storeId) {
    response.status(400).json({ ok: false, message: "storeId is required" });
    return;
  }

  const batch = await getCurrentOpenDeliveryBatchFromDatabase(storeId);
  response.json({ ok: true, batch });
});

app.get("/delivery-batches/:id", async (request, response) => {
  if (!databaseEnabled) {
    response.status(501).json({ ok: false, message: "Delivery batches require database mode" });
    return;
  }

  const batch = await getDeliveryBatchByIdFromDatabase(request.params.id);
  if (!batch) {
    response.status(404).json({ ok: false, message: "Delivery batch not found" });
    return;
  }

  response.json(batch);
});

app.post("/delivery-batches/current/close", async (request, response) => {
  if (!databaseEnabled) {
    response.status(501).json({ ok: false, message: "Delivery batches require database mode" });
    return;
  }

  const { storeId } = request.body as { storeId?: string };
  if (!String(storeId ?? "").trim()) {
    response.status(400).json({ ok: false, message: "storeId is required" });
    return;
  }

  const batch = await closeCurrentDeliveryBatchInDatabase(String(storeId).trim());
  if (!batch) {
    response.status(404).json({ ok: false, message: "Open delivery batch not found" });
    return;
  }

  response.json({ ok: true, batch });
});

app.get("/employees/by-chat/:chatId", async (request, response) => {
  const employee = databaseEnabled
    ? await getEmployeeByChatIdFromDatabase(request.params.chatId)
    : findEmployeeByChatId(request.params.chatId);

  if (!employee) {
    response.status(404).json({ message: "Employee not found" });
    return;
  }

  response.json(employee);
});

app.post("/telegram/register", async (request, response) => {
  const body = request.body as Partial<{
    chatId: string;
    name: string;
    surname: string;
    storeId: string;
    role: "user" | "manager";
  }>;

  const chatId = String(body.chatId ?? "").trim();
  const name = String(body.name ?? "").trim();
  const surname = String(body.surname ?? "").trim();
  const storeId = String(body.storeId ?? "").trim();
  const role = body.role === "manager" ? "manager" : "user";

  if (!chatId || !name || !surname || !storeId) {
    response.status(400).json({ message: "Registration fields are required" });
    return;
  }

  if (databaseEnabled) {
    try {
      const employee = await completeTelegramRegistrationInDatabase({
        chatId,
        name,
        surname,
        storeId,
        role,
      });

      if (!employee) {
        response.status(400).json({ message: "Failed to complete registration" });
        return;
      }

      response.status(201).json(employee);
      return;
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Failed to complete registration",
      });
      return;
    }
  }

  const existing = findEmployeeByChatId(chatId);
  const store = findStoreById(storeId);
  if (existing) {
    existing.name = name;
    existing.surname = surname;
    existing.fullName = `${name} ${surname}`.trim();
    existing.role = role;
    existing.storeId = storeId;
    existing.storeName = store?.name ?? existing.storeName;
    existing.status = "на зміні";
    response.status(201).json(existing);
    return;
  }

  touchEmployeeActivity(chatId, "Завершив самостійну реєстрацію через web-форму", {
    fullName: `${name} ${surname}`.trim(),
    role,
    storeName: store?.name,
  });

  const created = findEmployeeByChatId(chatId);
  if (!created) {
    response.status(400).json({ message: "Failed to complete registration" });
    return;
  }

  created.name = name;
  created.surname = surname;
  created.fullName = `${name} ${surname}`.trim();
  created.role = role;
  created.storeId = storeId;
  created.storeName = store?.name ?? created.storeName;

  response.status(201).json(created);
});

app.put("/employees/:id", async (request, response) => {
  const body = request.body as Partial<{
    name: string;
    surname: string;
    role: string;
    storeId: string;
    telegramClientId: string;
    isActive: boolean;
  }>;

  const name = String(body.name ?? "").trim();
  const surname = String(body.surname ?? "").trim();
  const role = String(body.role ?? "").trim();
  const storeId = String(body.storeId ?? "").trim();
  const telegramClientId = String(body.telegramClientId ?? "").trim();
  const isActive = Boolean(body.isActive);

  if (!name || !surname || !role || !storeId || !telegramClientId) {
    response.status(400).json({ message: "Employee fields are required" });
    return;
  }

  if (databaseEnabled) {
    try {
      const updated = await updateEmployeeInDatabase(request.params.id, {
        name,
        surname,
        role,
        storeId,
        telegramClientId,
        isActive,
      });
      if (!updated) {
        response.status(404).json({ message: "Employee not found" });
        return;
      }
      response.json(updated);
      return;
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : "Failed to update employee",
      });
      return;
    }
  }

  const target = employees.find((employee) => employee.id === request.params.id);
  if (!target) {
    response.status(404).json({ message: "Employee not found" });
    return;
  }

  const nextStore = findStoreById(storeId);
  target.name = name;
  target.surname = surname;
  target.fullName = `${name} ${surname}`.trim();
  target.role = role;
  target.storeId = storeId;
  target.storeName = nextStore?.name ?? target.storeName;
  target.telegramClientId = telegramClientId;
  target.status = isActive ? "на зміні" : "відсутній";
  response.json(target);
});

app.post("/products", async (request, response) => {
  const body = request.body as Omit<Product, "id" | "status">;
  const receiver = databaseEnabled
    ? await getEmployeeByIdFromDatabase(String(body.receivedByUserId ?? "").trim())
    : null;
  const fallbackReceiver = findEmployeeById(String(body.receivedByUserId ?? "").trim());
  const resolvedReceiver = receiver ?? fallbackReceiver;
  const storeId = String(body.storeId ?? "").trim() || resolvedReceiver?.storeId || "";
  const store = databaseEnabled
    ? (await getStoresFromDatabase()).find((item: { id: string }) => item.id === storeId) ?? null
    : findStoreById(storeId);

  if (!resolvedReceiver) {
    response.status(400).json({ message: "Received by user is required" });
    return;
  }

  if (!store) {
    response.status(400).json({ message: "Store is required" });
    return;
  }

  if (databaseEnabled) {
    const created = await createProductInDatabase({
      name: String(body.name ?? "").trim(),
      category: String(body.category ?? "").trim(),
      barcode: String(body.barcode ?? "").trim(),
      batch: String(body.batch ?? "").trim(),
      storeId: store.id,
      quantity: Number(body.quantity),
      receivedAt: body.receivedAt,
      expiresAt: body.expiresAt,
      notes: body.notes ?? "",
      receivedByUserId: resolvedReceiver.id,
    });

    response.status(201).json(created);
    return;
  }

  const barcode = String(body.barcode ?? "").trim();
  let catalogItem = findCatalogItemByBarcode(barcode);

  if (!catalogItem) {
    catalogItem = createCatalogItem({
      name: String(body.name ?? "").trim(),
      category: String(body.category ?? "").trim(),
      barcode,
    });
  }

  const batch = createProductBatch({
    productId: catalogItem.id,
    batch: String(body.batch ?? "").trim(),
    storeId: store.id,
    quantity: Number(body.quantity),
    receivedAt: body.receivedAt,
    expiresAt: body.expiresAt,
    status: "нове",
    notes: body.notes ?? "",
    receivedByUserId: resolvedReceiver.id,
  });

  touchEmployeeActivity(
    resolvedReceiver.telegramClientId,
    `Додав нову партію товару: ${catalogItem.name}`,
  );
  response.status(201).json({
    ...catalogItem,
    ...batch,
  });
});

app.patch("/products/:id/status", async (request, response) => {
  const { id } = request.params;
  const { status } = request.body as { status: ProductStatus };
  if (databaseEnabled) {
    const updated = await updateProductStatusInDatabase(id, status);

    if (!updated) {
      response.status(404).json({ message: "Product not found" });
      return;
    }

    response.json(updated);
    return;
  }

  const product = findJoinedProductByBatchId(id);
  const batch = findBatchById(id);

  if (!product || !batch) {
    response.status(404).json({ message: "Product not found" });
    return;
  }

  batch.status = status;
  const receiver = findEmployeeById(batch.receivedByUserId);
  touchEmployeeActivity(
    receiver?.telegramClientId ?? "",
    `Оновив статус товару "${product.name}" на "${status}"`,
  );
  response.json({
    ...product,
    status: batch.status,
  });
});

app.get("/telegram/status", async (_request, response) => {
  try {
    const currentSettings = await loadNotificationSettings();
    const [bot, webhook] = await Promise.all([
      telegramRequest("getMe"),
      telegramRequest("getWebhookInfo"),
    ]);
    response.json({
      ok: true,
      configured: true,
      bot,
      webhook,
      defaultChatId: currentSettings.chatId || defaultTelegramChatId,
      receivePathExample: `${appUrl}/receive?clientId=123456`,
      webhookUrl: getTelegramWebhookUrl(),
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      configured: Boolean(telegramBotToken),
      message: error instanceof Error ? error.message : "Unknown Telegram error"
    });
  }
});

app.get("/telegram/updates", async (_request, response) => {
  try {
    const result = await telegramRequest("getUpdates");
    response.json({ ok: true, updates: result });
  } catch (error) {
    response.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Telegram error"
    });
  }
});

app.post("/telegram/webhook", async (request, response) => {
  if (telegramWebhookSecret) {
    const secretHeader = request.header("x-telegram-bot-api-secret-token");
    if (secretHeader !== telegramWebhookSecret) {
      response.status(401).json({ ok: false, message: "Invalid Telegram webhook secret" });
      return;
    }
  }

  try {
    await handleTelegramUpdate(request.body as TelegramUpdate);
    response.json({ ok: true });
  } catch (error) {
    console.error("[TELEGRAM WEBHOOK ERROR]", error);
    response.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Telegram webhook error"
    });
  }
});

app.post("/telegram/set-webhook", async (_request, response) => {
  try {
    await ensureTelegramWebhook();
    response.json({
      ok: true,
      webhookUrl: getTelegramWebhookUrl(),
      webhookEnabled: telegramWebhookEnabled,
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Telegram error"
    });
  }
});

app.get("/telegram/set-webhook", async (_request, response) => {
  try {
    await ensureTelegramWebhook();
    response.json({
      ok: true,
      webhookUrl: getTelegramWebhookUrl(),
      webhookEnabled: telegramWebhookEnabled,
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Telegram error"
    });
  }
});

app.post("/telegram/delete-webhook", async (_request, response) => {
  try {
    const result = await telegramRequest("deleteWebhook", {
      drop_pending_updates: false
    });

    response.json({ ok: true, result });
  } catch (error) {
    response.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Telegram error"
    });
  }
});

app.post("/telegram/poll-commands", async (_request, response) => {
  await processTelegramCommands();
  response.json({ ok: true });
});

app.get("/notification-settings", async (_request, response) => {
  const currentSettings = await loadNotificationSettings();
  response.json({
    ok: true,
    settings: currentSettings
  });
});

app.put("/notification-settings", async (request, response) => {
  const body = request.body as Partial<NotificationSettings>;
  const currentSettings = await loadNotificationSettings();

  const nextSettings: NotificationSettings = {
    enabled: Boolean(body.enabled),
    chatId: String(body.chatId ?? "").trim(),
    time: String(body.time ?? "08:00"),
    daysBefore: Math.max(1, Number(body.daysBefore ?? 7)),
    lastSentDate: currentSettings.lastSentDate
  };

  await persistSettings(nextSettings);
  response.json({ ok: true, settings: nextSettings });
});

app.post("/telegram/test", async (request, response) => {
  const { chatId, message } = request.body as {
    chatId?: string;
    message?: string;
  };

  const currentSettings = await loadNotificationSettings();
  const targetChatId = chatId || currentSettings.chatId || defaultTelegramChatId;

  if (!targetChatId) {
    response.status(400).json({ ok: false, message: "chatId is required" });
    return;
  }

  try {
    await sendTelegramMessage(
      targetChatId,
      message ?? "Тестове повідомлення від TelegramChick MVP",
      getSystemReplyMarkup(),
    );

    response.json({ ok: true });
  } catch (error) {
    response.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Telegram error"
    });
  }
});

app.post("/telegram/preview/:id", async (request, response) => {
  const { id } = request.params;
  const product = databaseEnabled
    ? await getProductByBatchIdFromDatabase(id)
    : findJoinedProductByBatchId(id);

  if (!product) {
    response.status(404).json({ message: "Product not found" });
    return;
  }

  const preview = buildProductNotification(product);
  console.log("\n[TELEGRAM PREVIEW]\n" + preview + "\n");
  response.json({
    ok: true,
    preview,
    buttonUrl: canUseTelegramUrl(buildProductDetailsLink(product.id))
      ? buildProductDetailsLink(product.id)
      : null
  });
});

app.post("/telegram/notify/:id", async (request, response) => {
  const { id } = request.params;
  const { chatId } = request.body as { chatId?: string };
  const product = databaseEnabled
    ? await getProductByBatchIdFromDatabase(id)
    : findJoinedProductByBatchId(id);
  const currentSettings = await loadNotificationSettings();
  const targetChatId = chatId || currentSettings.chatId || defaultTelegramChatId;

  if (!product) {
    response.status(404).json({ ok: false, message: "Product not found" });
    return;
  }

  if (!targetChatId) {
    response.status(400).json({ ok: false, message: "chatId is required" });
    return;
  }

  try {
    await sendTelegramMessage(
      targetChatId,
      buildProductNotification(product),
      canUseTelegramUrl(buildProductDetailsLink(product.id))
        ? buildProductReplyMarkup(product.id)
        : undefined,
    );
    if (databaseEnabled) {
      await insertNotificationLog({
        batchId: product.id,
        productId: product.productId,
        storeId: product.storeId,
        userId: product.receivedByUserId || null,
        notificationType: "manual_product_notification",
        messageText: buildProductNotification(product),
      });
    }
    response.json({ ok: true });
  } catch (error) {
    response.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Telegram error"
    });
  }
});

if (webDistPath) {
  app.use(express.static(webDistPath));

  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/products")) return next();
    if (request.path.startsWith("/employees")) return next();
    if (request.path.startsWith("/stores")) return next();
    if (request.path.startsWith("/delivery-batches")) return next();
    if (request.path.startsWith("/telegram")) return next();
    if (request.path.startsWith("/notification-settings")) return next();
    if (request.path.startsWith("/health")) return next();

    response.sendFile(path.join(webDistPath, "index.html"));
  });
}

async function bootstrap() {
  if (databaseConfigured) {
    try {
      notificationSettings = await loadNotificationSettings();
      telegramState = await loadTelegramState();
    } catch (error) {
      databaseEnabled = false;
      console.error("[DATABASE BOOTSTRAP ERROR] Falling back to local storage.", error);
    }
  }

  if (telegramWebhookEnabled) {
    try {
      await ensureTelegramWebhook();
    } catch (error) {
      console.error("[TELEGRAM WEBHOOK SETUP ERROR]", error);
    }
  }

  if (automaticNotificationsEnabled) {
    setInterval(() => {
      void runAutomaticNotificationCheck();
    }, 60 * 1000);
  }

  if (telegramPollingEnabled) {
    setInterval(() => {
      void processTelegramCommands();
    }, 15 * 1000);
  }

  app.listen(port, () => {
    console.log(`TelegramChick started on http://localhost:${port}`);
  });
}

void bootstrap();
