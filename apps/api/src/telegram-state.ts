import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type TelegramState = {
  lastUpdateId: number | null;
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const dataDir = path.resolve(currentDir, "../data");
const statePath = path.resolve(dataDir, "telegram-state.json");

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

export function readTelegramState(): TelegramState {
  ensureDataDir();

  if (!fs.existsSync(statePath)) {
    const defaults: TelegramState = { lastUpdateId: null };
    fs.writeFileSync(statePath, JSON.stringify(defaults, null, 2), "utf8");
    return defaults;
  }

  const raw = fs.readFileSync(statePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<TelegramState>;

  return {
    lastUpdateId: typeof parsed.lastUpdateId === "number" ? parsed.lastUpdateId : null
  };
}

export function writeTelegramState(state: TelegramState) {
  ensureDataDir();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}
