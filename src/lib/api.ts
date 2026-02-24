import type {
  ReservationInput,
  GuestPrediction,
  AnalyzeTagsResponse,
  DemoScenario,
  SimulatedReservation,
} from "./types";

// In production, call the backend directly. In dev, use Vite proxy.
const API_BASE =
  import.meta.env.PROD
    ? "https://smart-tags-predictor.onrender.com/api"
    : "/api";
const DEFAULT_TENANT = "restaurant_001";

function tenantHeaders(tenantId?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Tenant-ID": tenantId || DEFAULT_TENANT,
  };
}

export async function predictGuestBehavior(
  reservation: ReservationInput,
  tenantId?: string
): Promise<GuestPrediction> {
  const res = await fetch(`${API_BASE}/v1/predict-guest-behavior`, {
    method: "POST",
    headers: tenantHeaders(tenantId),
    body: JSON.stringify(reservation),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Prediction failed: ${res.statusText}`);
  }
  return res.json();
}

export async function predictBatch(
  reservations: ReservationInput[],
  tenantId?: string
): Promise<{ predictions: GuestPrediction[]; count: number }> {
  const res = await fetch(`${API_BASE}/v1/predict-batch`, {
    method: "POST",
    headers: tenantHeaders(tenantId),
    body: JSON.stringify({ reservations }),
  });
  if (!res.ok) throw new Error(`Batch prediction failed: ${res.statusText}`);
  return res.json();
}

export async function analyzeTags(
  specialRequestText: string,
  dietaryPreferences: string,
  customerName: string,
  tenantId?: string
): Promise<AnalyzeTagsResponse> {
  const res = await fetch(`${API_BASE}/v1/reservations/analyze-tags`, {
    method: "POST",
    headers: tenantHeaders(tenantId),
    body: JSON.stringify({
      special_request_text: specialRequestText,
      dietary_preferences: dietaryPreferences,
      customer_name: customerName,
    }),
  });
  if (!res.ok) throw new Error(`Tag analysis failed: ${res.statusText}`);
  return res.json();
}

export async function getDemoScenarios(): Promise<DemoScenario[]> {
  const res = await fetch(`${API_BASE}/v1/demo-scenarios`);
  if (!res.ok) throw new Error("Failed to load demos");
  const data = await res.json();
  return data.scenarios;
}

export async function simulateReservations(
  count: number = 20,
  tenantId?: string
): Promise<SimulatedReservation[]> {
  const res = await fetch(
    `${API_BASE}/v1/simulate-reservations?count=${count}`,
    { headers: tenantHeaders(tenantId) }
  );
  if (!res.ok) throw new Error("Simulation failed");
  const data = await res.json();
  return data.reservations;
}

export async function healthCheck(): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

/* ── Feedback Loop ──────────────────────────────────────── */

export interface FeedbackPayload {
  record_id: string;
  guest_name: string;
  outcome: "showed_up" | "no_show" | "cancelled";
  predicted_risk: number;
  predicted_label: string;
  notes?: string;
}

export interface FeedbackResult {
  status: string;
  record_id: string;
  outcome: string;
  drift: number;
}

export async function submitFeedback(
  payload: FeedbackPayload,
  tenantId?: string
): Promise<FeedbackResult> {
  const res = await fetch(`${API_BASE}/v1/feedback`, {
    method: "POST",
    headers: tenantHeaders(tenantId),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Feedback submission failed: ${res.statusText}`);
  }
  return res.json();
}

export async function getFeedbackStats(
  tenantId?: string
): Promise<{
  total_feedback: number;
  accuracy: number | null;
  avg_drift: number | null;
  outcomes: { showed_up: number; no_show: number; cancelled: number };
}> {
  const res = await fetch(`${API_BASE}/v1/feedback/stats`, {
    headers: tenantHeaders(tenantId),
  });
  if (!res.ok) throw new Error("Failed to fetch feedback stats");
  return res.json();
}
