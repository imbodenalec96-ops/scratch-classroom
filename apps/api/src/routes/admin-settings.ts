import { Router, Request, Response } from "express";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

let migrated = false;
async function ensureTable() {
  if (migrated) return;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  // Seed defaults only if the row doesn't exist yet
  await db.prepare(
    "INSERT INTO admin_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING"
  ).run("teacher_password", "blockforge2024");
  await db.prepare(
    "INSERT INTO admin_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING"
  ).run("school_name", "My School");
  migrated = true;
}

// GET / — return all settings as a flat object
router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const rows = await db.prepare("SELECT key, value FROM admin_settings").all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to get admin settings" });
  }
});

// PUT / — upsert multiple settings from body object
router.put("/", async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const body = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      await db
        .prepare("INSERT INTO admin_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
        .run(key, String(value));
    }
    const rows = await db.prepare("SELECT key, value FROM admin_settings").all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to update admin settings" });
  }
});

// GET /check-pin?pin=XXXX — compare to remote_access_pin
router.get("/check-pin", async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const { pin } = req.query;
    const row = await db
      .prepare("SELECT value FROM admin_settings WHERE key='remote_access_pin'")
      .get() as { value: string } | undefined;
    res.json({ valid: row ? row.value === String(pin) : false });
  } catch (err) {
    res.status(500).json({ error: "Failed to check pin" });
  }
});

// GET /check-skip-code?code=XXXX — matches remote_access_pin OR teacher_password
router.get("/check-skip-code", async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const code = String(req.query.code ?? "");
    const rows = await db
      .prepare("SELECT key, value FROM admin_settings WHERE key IN ('remote_access_pin','teacher_password')")
      .all() as { key: string; value: string }[];
    res.json({ valid: rows.some(r => r.value === code) });
  } catch (err) {
    res.status(500).json({ error: "Failed to verify code" });
  }
});

// POST /check-password — compare to teacher_password
router.post("/check-password", async (req: Request, res: Response) => {
  try {
    await ensureTable();
    const { password } = req.body as { password: string };
    const row = await db
      .prepare("SELECT value FROM admin_settings WHERE key='teacher_password'")
      .get() as { value: string } | undefined;
    res.json({ valid: row ? row.value === password : false });
  } catch (err) {
    res.status(500).json({ error: "Failed to check password" });
  }
});

export default router;
