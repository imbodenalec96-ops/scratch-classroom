// Supabase client for STAR cross-device sync.
//
// Project: "Scratch" (mudwkajgqhyzjyrwgrrx). Single-tenant for now
// (one teacher, one class) — RLS allows anon read/write on every
// STAR table. The publishable key is in the deployed JS bundle by
// design; that matches the app's existing threat model where
// anyone with the deployed URL can use the app.
//
// Why this exists: localStorage-only data (behaviors, daily notes,
// IEP goals/log, templates, custom music, photos) caused two big
// problems on the user's setup:
//   1. Data didn't cross devices (Mac had it, iPad didn't).
//   2. Photos blew up localStorage and silently dropped new
//      assignment saves on quota.
// Supabase fixes both: real Postgres + real object storage.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mudwkajgqhyzjyrwgrrx.supabase.co";
// Publishable key (rotatable, distinct from the legacy anon JWT).
const SUPABASE_KEY = "sb_publishable_1F1JafyDTM8fYNuCtbGAWg_-2Za_lM4";

let _client: SupabaseClient | null = null;

export function supa(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    // Default fetch options are fine; the publishable key is added
    // automatically by the SDK.
  });
  return _client;
}

export const PHOTO_BUCKET = "star-photos";

/** Upload a base64 dataURL to the star-photos bucket and return the
 *  public URL. Used by the behavior-report photo attachment flow. */
export async function uploadPhotoFromDataUrl(dataUrl: string, suggestedName?: string): Promise<{ path: string; publicUrl: string } | null> {
  try {
    // Strip the "data:image/jpeg;base64," prefix
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) return null;
    const mime = match[1];
    const ext = mime.split("/")[1].replace("+xml", "");
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const name = (suggestedName || `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).replace(/[^a-z0-9_-]/gi, "-");
    const path = `${name}.${ext}`;
    const { error } = await supa().storage.from(PHOTO_BUCKET).upload(path, blob, {
      contentType: mime,
      upsert: false,
    });
    if (error) {
      console.warn("[Supabase photo upload]", error.message);
      return null;
    }
    const { data } = supa().storage.from(PHOTO_BUCKET).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  } catch (e: any) {
    console.warn("[Supabase photo upload]", e?.message || e);
    return null;
  }
}

export function photoPublicUrl(path: string): string {
  return supa().storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
