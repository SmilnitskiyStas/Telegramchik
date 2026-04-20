import { NotificationSettings } from "./notification-settings.js";
import { TelegramState } from "./telegram-state.js";
import { Product, ProductStatus } from "./types.js";
import { query } from "./db.js";

type StoreRow = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
};

type EmployeeActivity = {
  at: string;
  action: string;
};

type EmployeeRow = {
  id: number;
  name: string;
  surname: string;
  full_name: string;
  role: string;
  store_id: number;
  store_name: string;
  telegram_client_id: string;
  status: string;
  last_activity_at: string;
  last_action: string;
  activity_log: EmployeeActivity[] | string;
};

type ProductRow = {
  id: number;
  product_id: number;
  name: string;
  category: string;
  barcode: string;
  image_url: string | null;
  batch: string;
  store_id: number;
  store_name: string;
  quantity: number;
  received_at: string;
  expires_at: string;
  status: ProductStatus;
  notes: string;
  received_by_user_id: number | null;
  receiver_full_name: string | null;
};

type NotificationSettingsRow = {
  enabled: boolean;
  chat_id: string;
  send_time: string;
  days_before: number;
  last_sent_date: string | null;
};

type TelegramStateRow = {
  last_update_id: number | null;
};

type CreatedProductRow = ProductRow;

export type EmployeeRecord = {
  id: string;
  name: string;
  surname: string;
  fullName: string;
  role: string;
  storeId: string;
  storeName: string;
  telegramClientId: string;
  status: "на зміні" | "вихідний" | "відсутній";
  lastActivityAt: string;
  lastAction: string;
  activityLog: EmployeeActivity[];
};

export type StoreRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

function parseActivityLog(raw: EmployeeRow["activity_log"]) {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as EmployeeActivity[];
    } catch {
      return [];
    }
  }

  return [];
}

function mapEmployeeStatus(status: string): EmployeeRecord["status"] {
  if (status === "вихідний") return "вихідний";
  if (status === "відсутній") return "відсутній";
  return "на зміні";
}

function mapStore(row: StoreRow): StoreRecord {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    isActive: row.is_active,
  };
}

function mapEmployee(row: EmployeeRow): EmployeeRecord {
  return {
    id: String(row.id),
    name: row.name,
    surname: row.surname,
    fullName: row.full_name,
    role: row.role,
    storeId: String(row.store_id),
    storeName: row.store_name,
    telegramClientId: row.telegram_client_id,
    status: mapEmployeeStatus(row.status),
    lastActivityAt: row.last_activity_at,
    lastAction: row.last_action,
    activityLog: parseActivityLog(row.activity_log),
  };
}

function mapProduct(row: ProductRow): Product {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    name: row.name,
    category: row.category,
    barcode: row.barcode,
    imageUrl: row.image_url ?? undefined,
    batch: row.batch,
    storeId: String(row.store_id),
    storeName: row.store_name,
    quantity: row.quantity,
    receivedAt: row.received_at,
    expiresAt: row.expires_at,
    status: row.status,
    notes: row.notes,
    receivedByUserId: row.received_by_user_id ? String(row.received_by_user_id) : "",
    receiverFullName: row.receiver_full_name ?? undefined,
  };
}

export async function getStores() {
  const result = await query<StoreRow>(
    `select id, code, name, is_active from api_stores_v order by code asc`,
  );
  return result.rows.map(mapStore);
}

export async function getEmployees() {
  const result = await query<EmployeeRow>(
    `select id, name, surname, full_name, role, store_id, store_name, telegram_client_id, status, last_activity_at, last_action, activity_log
     from api_employees_v
     order by full_name asc`,
  );
  return result.rows.map(mapEmployee);
}

export async function getEmployeeByChatId(chatId: string) {
  const result = await query<EmployeeRow>(
    `select id, name, surname, full_name, role, store_id, store_name, telegram_client_id, status, last_activity_at, last_action, activity_log
     from api_employees_v
     where telegram_client_id = $1
     limit 1`,
    [chatId.trim()],
  );
  return result.rows[0] ? mapEmployee(result.rows[0]) : null;
}

export async function getEmployeeById(id: string) {
  const result = await query<EmployeeRow>(
    `select id, name, surname, full_name, role, store_id, store_name, telegram_client_id, status, last_activity_at, last_action, activity_log
     from api_employees_v
     where id = $1::bigint
     limit 1`,
    [Number(id)],
  );
  return result.rows[0] ? mapEmployee(result.rows[0]) : null;
}

export async function getProducts() {
  const result = await query<ProductRow>(
    `select id, product_id, name, category, barcode, image_url, batch, store_id, store_name, quantity, received_at, expires_at, status, notes, received_by_user_id, receiver_full_name
     from api_products_v
     order by expires_at asc, id asc`,
  );
  return result.rows.map(mapProduct);
}

export async function getProductByBatchId(batchId: string) {
  const result = await query<ProductRow>(
    `select id, product_id, name, category, barcode, image_url, batch, store_id, store_name, quantity, received_at, expires_at, status, notes, received_by_user_id, receiver_full_name
     from api_products_v
     where id = $1
     limit 1`,
    [Number(batchId)],
  );
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}

export async function createProduct(input: {
  name: string;
  category: string;
  barcode: string;
  batch: string;
  storeId: string;
  quantity: number;
  receivedAt: string;
  expiresAt: string;
  notes: string;
  receivedByUserId: string;
}) {
  const result = await query<CreatedProductRow>(
    `with upsert_product as (
       insert into products (article, barcode, product_name, units_of_measurement, category)
       values ($1, $2, $3, 'pcs', $4)
       on conflict (barcode) do update
       set article = excluded.article,
           product_name = excluded.product_name,
           units_of_measurement = excluded.units_of_measurement,
           category = excluded.category
       returning id
     ),
     chosen_product as (
       select id from upsert_product
       union all
       select id from products where barcode = $2
       limit 1
     ),
     upsert_batch as (
       insert into product_batches (
         product_id,
         store_id,
         quantity,
         expiry_date,
         delivery_date,
         intake_note,
         created_by_user_id,
         updated_by_user_id
       )
       select
         cp.id,
         $5::bigint,
         $6::integer,
         $7::date,
         $8::date,
         $9,
         $10::bigint,
         $10::bigint
       from chosen_product cp
       on conflict (product_id, store_id, expiry_date) do update
       set quantity = excluded.quantity,
           delivery_date = excluded.delivery_date,
           intake_note = excluded.intake_note,
           updated_by_user_id = excluded.updated_by_user_id
       returning id
     )
     select id, product_id, name, category, barcode, image_url, batch, store_id, store_name, quantity, received_at, expires_at, status, notes, received_by_user_id, receiver_full_name
     from api_products_v
     where id = (select id from upsert_batch)`,
    [
      input.barcode.trim() || input.name.trim(),
      input.barcode.trim(),
      input.name.trim(),
      input.category.trim() || "Без категорії",
      Number(input.storeId),
      Number(input.quantity),
      input.expiresAt,
      input.receivedAt,
      input.notes ?? "",
      Number(input.receivedByUserId),
    ],
  );

  await insertActivityLog({
    userId: input.receivedByUserId,
    actionType: "product_batch_created",
    batchId: result.rows[0]?.id ? String(result.rows[0].id) : null,
    productId: result.rows[0]?.product_id ? String(result.rows[0].product_id) : null,
    storeId: input.storeId,
    comment: `Додав нову партію товару: ${input.name.trim()}`,
  });

  return mapProduct(result.rows[0]);
}

function mapUiStatusToCheckStatus(status: ProductStatus) {
  switch (status) {
    case "перевірити":
      return "pending";
    case "в роботі":
      return "reviewed";
    case "на погодженні":
      return "discussion_required";
    case "вирішено":
      return "completed";
    case "списано":
      return "overdue";
    case "нове":
    default:
      return "new";
  }
}

export async function updateProductStatus(batchId: string, status: ProductStatus) {
  const nextCheckStatus = mapUiStatusToCheckStatus(status);
  const current = await getProductByBatchId(batchId);

  const result = await query<ProductRow>(
    `update product_batches
     set check_status = $2::check_status,
         updated_at = timezone('utc', now())
     where id = $1::bigint
     returning id`,
    [Number(batchId), nextCheckStatus],
  );

  if (!result.rows[0]) {
    return null;
  }

  if (current?.receivedByUserId) {
    await insertActivityLog({
      userId: current.receivedByUserId,
      actionType: "product_batch_status_updated",
      batchId,
      productId: current.productId,
      storeId: current.storeId,
      comment: `Оновив статус товару "${current.name}" на "${status}"`,
    });
  }

  return getProductByBatchId(batchId);
}

export async function getNotificationSettings(defaultChatId = ""): Promise<NotificationSettings> {
  const result = await query<NotificationSettingsRow>(
    `select enabled, chat_id, to_char(send_time, 'HH24:MI') as send_time, days_before, 
            case when last_sent_date is null then null else to_char(last_sent_date, 'YYYY-MM-DD') end as last_sent_date
     from app_notification_settings
     where settings_key = 'default'
     limit 1`,
  );

  if (!result.rows[0]) {
    await query(
      `insert into app_notification_settings (settings_key, chat_id) values ('default', $1)
       on conflict (settings_key) do nothing`,
      [defaultChatId],
    );
    return {
      enabled: false,
      chatId: defaultChatId,
      time: "08:00",
      daysBefore: 7,
      lastSentDate: null,
    };
  }

  return {
    enabled: result.rows[0].enabled,
    chatId: result.rows[0].chat_id || defaultChatId,
    time: result.rows[0].send_time,
    daysBefore: result.rows[0].days_before,
    lastSentDate: result.rows[0].last_sent_date,
  };
}

export async function saveNotificationSettings(settings: NotificationSettings) {
  await query(
    `insert into app_notification_settings (settings_key, enabled, chat_id, send_time, days_before, last_sent_date)
     values ('default', $1, $2, $3::time, $4, $5::date)
     on conflict (settings_key) do update
     set enabled = excluded.enabled,
         chat_id = excluded.chat_id,
         send_time = excluded.send_time,
         days_before = excluded.days_before,
         last_sent_date = excluded.last_sent_date`,
    [
      settings.enabled,
      settings.chatId,
      settings.time,
      settings.daysBefore,
      settings.lastSentDate,
    ],
  );
}

export async function getTelegramState(): Promise<TelegramState> {
  const result = await query<TelegramStateRow>(
    `select last_update_id from telegram_bot_state where state_key = 'default' limit 1`,
  );

  return {
    lastUpdateId: result.rows[0]?.last_update_id ?? null,
  };
}

export async function saveTelegramState(state: TelegramState) {
  await query(
    `insert into telegram_bot_state (state_key, last_update_id)
     values ('default', $1)
     on conflict (state_key) do update
     set last_update_id = excluded.last_update_id`,
    [state.lastUpdateId],
  );
}

export async function insertNotificationLog(input: {
  batchId?: string | null;
  productId?: string | null;
  storeId?: string | null;
  userId?: string | null;
  notificationType: string;
  messageText: string;
}) {
  await query(
    `insert into notification_log (batch_id, product_id, store_id, user_id, notification_type, message_text)
     values ($1::bigint, $2::bigint, $3::bigint, $4::bigint, $5, $6)`,
    [
      input.batchId ? Number(input.batchId) : null,
      input.productId ? Number(input.productId) : null,
      input.storeId ? Number(input.storeId) : null,
      input.userId ? Number(input.userId) : null,
      input.notificationType,
      input.messageText,
    ],
  );
}

export async function insertActivityLog(input: {
  userId: string;
  actionType: string;
  batchId?: string | null;
  productId?: string | null;
  storeId?: string | null;
  comment?: string | null;
}) {
  await query(
    `insert into activity_log (user_id, action_type, batch_id, product_id, store_id, comment)
     values ($1::bigint, $2, $3::bigint, $4::bigint, $5::bigint, $6)`,
    [
      Number(input.userId),
      input.actionType,
      input.batchId ? Number(input.batchId) : null,
      input.productId ? Number(input.productId) : null,
      input.storeId ? Number(input.storeId) : null,
      input.comment ?? null,
    ],
  );
}
