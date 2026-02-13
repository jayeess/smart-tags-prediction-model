import type { ReservationInput, GuestPrediction } from "./types";

export interface AnalysisRecord {
  id: string;
  timestamp: string;
  source: "analyze" | "tables";
  input: ReservationInput;
  prediction: GuestPrediction;
}

const STORAGE_KEY = "emenu_analysis_history";
const MAX_RECORDS = 100;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getHistory(): AnalysisRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AnalysisRecord[];
  } catch {
    return [];
  }
}

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

  const history = getHistory();
  history.unshift(record);
  // Keep only the most recent records
  if (history.length > MAX_RECORDS) {
    history.length = MAX_RECORDS;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  return record;
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteRecord(id: string): void {
  const history = getHistory().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}
