// Public, unauthenticated lookups for STAR barcodes. Used by phones
// that haven't logged into Scratch Classroom — they still need to be
// able to identify a worksheet barcode in order to snap a photo.
//
// Read-only. Returns just the payload (the assignment metadata that
// was pushed up via /api/classes/:classId/star-barcodes by the teacher
// on their laptop or iPad).

import { Router, Request, Response } from "express";
import db from "../db.js";

const router = Router();

let starBarcodesReady = false;
async function ensureStarBarcodes() {
  if (starBarcodesReady) return;
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS star_barcodes (
      class_id TEXT NOT NULL,
      barcode TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      PRIMARY KEY (class_id, barcode)
    )`);
    starBarcodesReady = true;
  } catch { starBarcodesReady = true; }
}

// Global single-barcode lookup. The phone may not know its class id
// yet (or may not be logged in at all), so this endpoint searches
// across every class and returns the freshest match.
router.get("/star-barcodes/:barcode", async (req: Request, res: Response) => {
  await ensureStarBarcodes();
  const bc = String(req.params.barcode || "").trim().toUpperCase();
  if (!bc) return res.status(400).json({ error: "missing barcode" });
  try {
    const row: any = await db.prepare(
      `SELECT class_id, barcode, payload, created_at FROM star_barcodes WHERE barcode = ? ORDER BY created_at DESC LIMIT 1`
    ).get(bc);
    if (!row) return res.status(404).json({ error: "not found" });
    let p: any = {};
    try { p = JSON.parse(row.payload || "{}"); } catch {}
    res.json({ barcode: row.barcode, payload: p, class_id: row.class_id, created_at: row.created_at });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "fetch failed" });
  }
});

export default router;
