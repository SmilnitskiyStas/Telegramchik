import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type NotificationSettings = {
  enabled: boolean;
  chatId: string;
  time: string;
  daysBefore: number;
  lastSentDate: string | null;
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const dataDir = path.resolve(currentDir, "../data");
const settingsPath = path.resolve(dataDir, "notification-settings.json");

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

export function createDefaultSettings(defaultChatId = ""): NotificationSettings {
  return {
    enabled: false,
    chatId: defaultChatId,
    time: "08:00",
    daysBefore: 7,
    lastSentDate: null
  };
}

export function readSettings(defaultChatId = ""): NotificationSettings {
  ensureDataDir();

  if (!fs.existsSync(settingsPath)) {
    const defaults = createDefaultSettings(defaultChatId);
    fs.writeFileSync(settingsPath, JSON.stringify(defaults, null, 2), "utf8");
    return defaults;
  }

  const raw = fs.readFileSync(settingsPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<NotificationSettings>;

  return {
    enabled: Boolean(parsed.enabled),
    chatId: parsed.chatId ?? defaultChatId,
    time: parsed.time ?? "08:00",
    daysBefore: Math.max(1, Number(parsed.daysBefore ?? 7)),
    lastSentDate: parsed.lastSentDate ?? null
  };
}

export function writeSettings(settings: NotificationSettings) {
  ensureDataDir();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}
