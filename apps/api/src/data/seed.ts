import Database from "better-sqlite3";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const dbPath = process.env.SQLITE_PATH || join(dirname(fileURLToPath(import.meta.url)), "../../../../db/scratch.db");
const db = Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

async function seed() {
  console.log("Running schema...");
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "../../../../db/schema.sqlite.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);
  console.log("Schema applied. No demo data seeded — use the admin portal to create real accounts.");
  db.close();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
