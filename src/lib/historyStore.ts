import type { ReservationInput, GuestPrediction } from "./types";
import { getSupabase, isSupabaseConfigured } from "./supabase";

/* ── Types ───────────────────────────────────────────────── */
export interface AnalysisRecord {
  id: string;
  timestamp: string;
  source: "analyze" | "tables";
  input: ReservationInput;
  prediction: GuestPrediction;
}

/* ── Constants ───────────────────────────────────────────── */
const STORAGE_KEY = "emenu_analysis_history";
const MAX_RECORDS = 200;
const TENANT_ID = "restaurant_001";

/* ── ID Generator ────────────────────────────────────────── */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ══════════════════════════════════════════════════════════
   LOCAL STORAGE (instant, always available)
   ══════════════════════════════════════════════════════════ */

function getLocal(): AnalysisRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AnalysisRecord[];
  } catch {
    return [];
  }
}

function setLocal(records: AnalysisRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/* ══════════════════════════════════════════════════════════
   SUPABASE CLOUD SYNC (persistent, cross-device)
   All Supabase calls are fire-and-forget or background.
   Failures are silently caught — localStorage is the source
   of truth for immediate UI.
   ══════════════════════════════════════════════════════════ */

/** Push a record to Supabase (background, non-blocking) */
function cloudInsert(record: AnalysisRecord): void {
  const sb = getSupabase();
  if (!sb) return;
  sb.from("analysis_history")
    .insert({
      id: record.id,
      tenant_id: TENANT_ID,
      created_at: record.timestamp,
      source: record.source,
      input: record.input as unknown,
      prediction: record.prediction as unknown,
    })
    .then(({ error }) => {
      if (error && !error.message.includes("duplicate")) {
        console.warn("[Supabase] insert error:", error.message);
      }
    });
}

/** Delete a record from Supabase (background) */
function cloudDelete(id: string): void {
  const sb = getSupabase();
  if (!sb) return;
  sb.from("analysis_history")
    .delete()
    .eq("id", id)
    .eq("tenant_id", TENANT_ID)
    .then(({ error }) => {
      if (error) console.warn("[Supabase] delete error:", error.message);
    });
}

/** Delete all records for this tenant from Supabase (background) */
function cloudClearAll(): void {
  const sb = getSupabase();
  if (!sb) return;
  sb.from("analysis_history")
    .delete()
    .eq("tenant_id", TENANT_ID)
    .then(({ error }) => {
      if (error) console.warn("[Supabase] clear error:", error.message);
    });
}

/* ══════════════════════════════════════════════════════════
   PUBLIC API — Synchronous (localStorage) + background sync
   ══════════════════════════════════════════════════════════ */

/**
 * Get history records (instant, from localStorage).
 * Use `fetchCloudHistory()` to merge cloud data.
 */
export function getHistory(): AnalysisRecord[] {
  return getLocal();
}

/**
 * Save a new analysis record.
 * Writes to localStorage immediately, syncs to Supabase in background.
 */
export function saveAnalysis(
  input: ReservationInput,
  prediction: GuestPrediction,
  source: "analyze" | "tables" = "analyze"
): AnalysisRecord {
  const record: AnalysisRecord = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    source,
    input,
    prediction,
  };

  const history = getLocal();
  history.unshift(record);
  if (history.length > MAX_RECORDS) {
    history.length = MAX_RECORDS;
  }
  setLocal(history);

  // Background cloud sync
  cloudInsert(record);

  return record;
}

/**
 * Delete a single record.
 * Removes from localStorage immediately, syncs to Supabase.
 */
export function deleteRecord(id: string): void {
  const history = getLocal().filter((r) => r.id !== id);
  setLocal(history);
  cloudDelete(id);
}

/**
 * Clear all history.
 * Clears localStorage immediately, syncs to Supabase.
 */
export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
  cloudClearAll();
}

/* ══════════════════════════════════════════════════════════
   CLOUD FETCH & MERGE — Async (call on page load)
   Fetches all records from Supabase and merges with local.
   New cloud records (from other devices) get added to local.
   ══════════════════════════════════════════════════════════ */

/**
 * Fetch records from Supabase and merge with localStorage.
 * Returns the merged list. Call this on HistoryPage mount.
 *
 * Merge strategy:
 * - Local records take priority (they may include un-synced items)
 * - Cloud records not in local get added
 * - Result is sorted by timestamp descending, capped at MAX_RECORDS
 */
export async function fetchCloudHistory(): Promise<AnalysisRecord[]> {
  const sb = getSupabase();
  if (!sb) return getLocal();

  try {
    const { data, error } = await sb
      .from("analysis_history")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(MAX_RECORDS);

    if (error || !data) {
      console.warn("[Supabase] fetch error:", error?.message);
      return getLocal();
    }

    // Convert Supabase rows to AnalysisRecord format
    const cloudRecords: AnalysisRecord[] = data.map((row) => ({
      id: row.id as string,
      timestamp: row.created_at as string,
      source: row.source as "analyze" | "tables",
      input: row.input as ReservationInput,
      prediction: row.prediction as GuestPrediction,
    }));

    // Merge: local + new cloud records
    const local = getLocal();
    const localIds = new Set(local.map((r) => r.id));

    const newFromCloud = cloudRecords.filter((r) => !localIds.has(r.id));
    if (newFromCloud.length > 0) {
      const merged = [...local, ...newFromCloud]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, MAX_RECORDS);
      setLocal(merged);
      return merged;
    }

    // Also push local-only records to cloud (sync back)
    const cloudIds = new Set(cloudRecords.map((r) => r.id));
    const localOnly = local.filter((r) => !cloudIds.has(r.id));
    for (const record of localOnly) {
      cloudInsert(record);
    }

    return local;
  } catch (err) {
    console.warn("[Supabase] fetch failed:", err);
    return getLocal();
  }
}

/**
 * Check if Supabase cloud sync is available and working.
 * Returns { configured, connected, recordCount }.
 */
export async function getCloudStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  cloudCount: number;
}> {
  if (!isSupabaseConfigured()) {
    return { configured: false, connected: false, cloudCount: 0 };
  }

  const sb = getSupabase();
  if (!sb) return { configured: true, connected: false, cloudCount: 0 };

  try {
    const { count, error } = await sb
      .from("analysis_history")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID);

    if (error) {
      return { configured: true, connected: false, cloudCount: 0 };
    }

    return { configured: true, connected: true, cloudCount: count ?? 0 };
  } catch {
    return { configured: true, connected: false, cloudCount: 0 };
  }
}
