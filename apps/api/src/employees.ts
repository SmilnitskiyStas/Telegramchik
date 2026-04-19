export type EmployeeActivity = {
  at: string;
  action: string;
};

export type Employee = {
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

function createActivity(at: string, action: string): EmployeeActivity {
  return { at, action };
}

export const employees: Employee[] = [
  {
    id: "emp-1",
    name: "Ірина",
    surname: "Мельник",
    fullName: "Ірина Мельник",
    role: "Старший продавець",
    storeId: "store-1",
    storeName: "Магазин Поділ",
    telegramClientId: "591179640",
    status: "на зміні",
    lastActivityAt: "2026-04-15 10:42",
    lastAction: "Додала нову партію товару",
    activityLog: [
      createActivity("2026-04-15 10:42", "Додала нову партію товару"),
      createActivity("2026-04-15 09:16", "Перевірила терміни придатності у відділі молочки"),
      createActivity("2026-04-14 18:24", "Підтвердила відправку Telegram-сповіщення"),
    ],
  },
  {
    id: "emp-2",
    name: "Олег",
    surname: "Ткачук",
    fullName: "Олег Ткачук",
    role: "Комірник",
    storeId: "store-2",
    storeName: "Магазин Оболонь",
    telegramClientId: "5358869619",
    status: "на зміні",
    lastActivityAt: "2026-04-15 09:18",
    lastAction: "Оновив статус простроченого товару",
    activityLog: [
      createActivity("2026-04-15 09:18", "Оновив статус простроченого товару"),
      createActivity("2026-04-15 08:55", "Прийняв ранкову поставку на склад"),
      createActivity("2026-04-14 17:40", 'Змінив статус товару на "в роботі"'),
    ],
  },
  {
    id: "emp-3",
    name: "Наталія",
    surname: "Бойко",
    fullName: "Наталія Бойко",
    role: "Адміністратор",
    storeId: "store-3",
    storeName: "Магазин Лівобережна",
    telegramClientId: "700112233",
    status: "вихідний",
    lastActivityAt: "2026-04-14 18:07",
    lastAction: "Перевірила автосповіщення",
    activityLog: [
      createActivity("2026-04-14 18:07", "Перевірила автосповіщення"),
      createActivity("2026-04-14 16:12", "Оновила налаштування Telegram-бота"),
      createActivity("2026-04-13 13:45", "Переглянула список проблемних товарів"),
    ],
  },
];

function getActivityTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function splitFullName(fullName?: string) {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    name: parts[0] ?? "",
    surname: parts.slice(1).join(" "),
  };
}

export function findEmployeeById(id: string) {
  return employees.find((employee) => employee.id === id) ?? null;
}

export function findEmployeeByChatId(chatId: string) {
  const cleanChatId = String(chatId).trim();
  return employees.find((employee) => employee.telegramClientId === cleanChatId) ?? null;
}

export function touchEmployeeActivity(
  telegramClientId: string,
  action: string,
  fallback?: Partial<Pick<Employee, "fullName" | "role" | "storeName">>,
) {
  const cleanClientId = String(telegramClientId).trim();

  if (!cleanClientId) {
    return;
  }

  const activityAt = getActivityTimestamp();
  const nextActivity = createActivity(activityAt, action);
  const existing = employees.find(
    (employee) => employee.telegramClientId === cleanClientId,
  );

  if (existing) {
    existing.lastActivityAt = activityAt;
    existing.lastAction = action;
    existing.status = "на зміні";
    existing.activityLog = [nextActivity, ...existing.activityLog].slice(0, 10);
    return;
  }

  const derivedName = splitFullName(fallback?.fullName);
  const fullName = fallback?.fullName?.trim() || `Співробітник ${cleanClientId}`;

  employees.unshift({
    id: `emp-${Date.now()}`,
    name: derivedName.name || "Співробітник",
    surname: derivedName.surname,
    fullName,
    role: fallback?.role ?? "Співробітник",
    storeId: "store-unknown",
    storeName: fallback?.storeName ?? "Магазин не вказано",
    telegramClientId: cleanClientId,
    status: "на зміні",
    lastActivityAt: activityAt,
    lastAction: action,
    activityLog: [nextActivity],
  });
}
