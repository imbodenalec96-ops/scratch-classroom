import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import dotenv from "dotenv";

const __dir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dir, "../../../.env") });

export interface PreparedStatement {
  run(...params: any[]): Promise<{ changes: number }>;
  get(...params: any[]): Promise<any>;
  all(...params: any[]): Promise<any[]>;
}

export interface DB {
  prepare(sql: string): PreparedStatement;
  pragma(key: string): void;
  exec(sql: string): Promise<void> | void;
  close(): Promise<void> | void;
}

function convertSqlForPg(sql: string): string {
  let idx = 0;
  let result = sql.replace(/\?/g, () => `$${++idx}`);
  result = result.replace(/datetime\('now'\)/gi, "NOW()::text");
  return result;
}

let db: DB;

if (process.env.DATABASE_URL) {
  // Pick the right driver:
  //  - Neon URL (neon.tech): use @neondatabase/serverless. HTTP-based,
  //    no persistent TCP connection per instance, sub-second cold starts.
  //    Replaces the 10-second cold-start tax pg.Pool was paying on Vercel.
  //  - Anything else (local Postgres, RDS, etc): fall back to pg.Pool.
  const isNeonUrl = /\.neon\.(tech|build)/i.test(process.env.DATABASE_URL || "");
  let pool: { query: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>; end?: () => Promise<void> };

  if (isNeonUrl) {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    // ws not needed for plain query() over HTTP fetch; only required for
    // transactions/listen which we don't use.
    neonConfig.fetchConnectionCache = true;
    const neonPool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool = {
      async query(sql: string, params?: any[]) {
        const r = await neonPool.query(sql, params);
        return { rows: r.rows, rowCount: r.rowCount ?? 0 };
      },
      async end() { await neonPool.end(); },
    };
  } else {
    const pg = await import("pg");
    pg.default.types.setTypeParser(3802, (val: string) => val); // jsonb → string
    pg.default.types.setTypeParser(114,  (val: string) => val); // json  → string
    const pgPool = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
      max: process.env.VERCEL ? 1 : 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    pool = {
      async query(sql: string, params?: any[]) {
        const r = await pgPool.query(sql, params);
        return { rows: r.rows, rowCount: r.rowCount ?? 0 };
      },
      async end() { await pgPool.end(); },
    };
  }

  db = {
    prepare(sql: string): PreparedStatement {
      const pgSql = convertSqlForPg(sql);
      return {
        async run(...params: any[]) {
          const result = await pool.query(pgSql, params);
          return { changes: result.rowCount ?? 0 };
        },
        async get(...params: any[]) {
          const result = await pool.query(pgSql, params);
          return result.rows[0] || undefined;
        },
        async all(...params: any[]) {
          const result = await pool.query(pgSql, params);
          return result.rows;
        },
      };
    },
    pragma() {},
    async exec(sql: string) {
      await pool.query(convertSqlForPg(sql));
    },
    async close() {
      if (pool.end) await pool.end();
    },
  };
} else if (process.env.VERCEL) {
  // On Vercel serverless, SQLite is not available — DATABASE_URL is required
  const errorMsg = "DATABASE_URL environment variable is required on Vercel";
  db = {
    prepare(): PreparedStatement {
      return {
        async run() { throw new Error(errorMsg); },
        async get() { throw new Error(errorMsg); },
        async all() { throw new Error(errorMsg); },
      };
    },
    pragma() {},
    exec() { throw new Error(errorMsg); },
    close() {},
  };
} else {
  const { default: Database } = await import("better-sqlite3");
  const defaultDbPath = join(__dir, "../../../db/scratch.db");
  const rawPath = process.env.SQLITE_PATH || defaultDbPath;
  const dbPath = resolve(rawPath);
  const sqlite = Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = {
    prepare(sql: string): PreparedStatement {
      const stmt = sqlite.prepare(sql);
      return {
        async run(...params: any[]) {
          const result = stmt.run(...params);
          return { changes: result.changes };
        },
        async get(...params: any[]) {
          return stmt.get(...params);
        },
        async all(...params: any[]) {
          return stmt.all(...params);
        },
      };
    },
    pragma(key: string) {
      sqlite.pragma(key);
    },
    exec(sql: string) {
      sqlite.exec(sql);
    },
    close() {
      sqlite.close();
    },
  };
}

export default db;
