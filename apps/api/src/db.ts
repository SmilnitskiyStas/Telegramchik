import { Pool, QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL?.trim() || "";

let pool: Pool | null = null;

function shouldUseSsl() {
  if (!connectionString) {
    return false;
  }

  return !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");
}

function getPool() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
}

export function hasDatabase() {
  return Boolean(connectionString);
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}
