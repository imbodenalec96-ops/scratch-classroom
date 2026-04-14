import Database, { type Database as DatabaseType } from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import dotenv from "dotenv";

const __dir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dir, "../../../.env") });

const defaultDbPath = join(__dir, "../../../db/scratch.db");
const rawPath = process.env.SQLITE_PATH || defaultDbPath;
const dbPath = resolve(rawPath);
const db: DatabaseType = Database(dbPath);

// Enable WAL mode for better concurrency and foreign keys
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export default db;
