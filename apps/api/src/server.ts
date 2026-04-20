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
  createProduct as createProductInDatabase,
  getEmployeeById as getEmployeeByIdFromDatabase,
  getEmployeeByChatId as getEmployeeByChatIdFromDatabase,
  getEmployees as getEmployeesFromDatabase,
  getNotificationSettings as getNotificationSettingsFromDatabase,
  getProductByBatchId as getProductByBatchIdFromDatabase,
  getProducts as getProductsFromDatabase,
  getStores as getStoresFromDatabase,
  getTelegramState as getTelegramStateFromDatabase,
  insertNotificationLog,
  registerTelegramUser,
  saveNotificationSettings as saveNotificationSettingsToDatabase,
  saveTelegramState as saveTelegramStateToDatabase,
  updateProductStatus as updateProductStatusInDatabase,
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
let notificationSettings = readSettings(defaultTelegramChatId);
let telegramState = readTelegramState();
const webDistPath = webDistCandidates.find((candidate) => fs.existsSync(candidate));
const databaseConfigured = hasDatabase();
let databaseEnabled = databaseConfigured;

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

  if (databaseEnabled) {
    return registerTelegramUser(input);
  }

  touchEmployeeActivity(
    input.chatId,
    "Автоматична реєстрація користувача через Telegram /start",
    {
      fullName:
        [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || undefined,
      role: "Співробітник",
      storeName: "Telegram Registration",
    },
  );

  return findEmployeeByChatId(input.chatId);
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

async function runAutomaticNotificationCheck() {
  const currentSettings = await loadNotificationSettings();

  if (!currentSettings.enabled || !currentSettings.chatId) {
    return;
  }

  const today = getTodayKey();

  if (currentSettings.lastSentDate === today) {
    return;
  }

  if (getCurrentTimeKey() !== currentSettings.time) {
    return;
  }

  const items = await getProductsForNotification(currentSettings.daysBefore);
  if (!items.length) {
    return;
  }

  try {
    await sendTelegramMessage(
      currentSettings.chatId,
      buildDigestMessage(items, currentSettings.daysBefore),
      getSystemReplyMarkup(),
    );

    await persistSettings({
      ...currentSettings,
      lastSentDate: today
    });
  } catch (error) {
    console.error("[AUTO NOTIFY ERROR]", error);
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
      const text = update.message?.text?.trim().toLowerCase();
      const chatId = update.message?.chat?.id;
      const from = update.message?.from;

      if (typeof update.update_id === "number") {
        await persistTelegramState(update.update_id);
      }

      if (!text || typeof chatId !== "number") {
        continue;
      }

      if (text === "/start") {
        const employee = await registerTelegramEmployeeIfNeeded({
          chatId: String(chatId),
          firstName: from?.first_name,
          lastName: from?.last_name,
          username: from?.username,
        });

        await sendTelegramMessage(
          String(chatId),
          buildTelegramWelcomeMessage(employee?.fullName),
          getSystemReplyMarkup(),
        );
        continue;
      }

      if (text === "/newproduct" || text === "/addproduct") {
        const employee = await findEmployeeForChatId(String(chatId));

        if (!employee) {
          await sendTelegramMessage(
            String(chatId),
            "Користувача не знайдено. Спочатку надішліть /start для автоматичної реєстрації.",
            getSystemReplyMarkup(),
          );
          continue;
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
    const result = await telegramRequest("getMe");
    response.json({
      ok: true,
      configured: true,
      bot: result,
      defaultChatId: currentSettings.chatId || defaultTelegramChatId,
      receivePathExample: `${appUrl}/receive?clientId=123456`
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

  setInterval(() => {
    void runAutomaticNotificationCheck();
  }, 60 * 1000);

  setInterval(() => {
    void processTelegramCommands();
  }, 15 * 1000);

  app.listen(port, () => {
    console.log(`TelegramChick started on http://localhost:${port}`);
  });
}

void bootstrap();
