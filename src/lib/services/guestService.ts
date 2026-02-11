import type { PredictionResponseUnified, ReservationInput } from "../types";

const BASE = (import.meta as any).env?.VITE_API_URL || "/api";
const TENANT = "restaurant_001";

export async function fetchGuestPrediction(input: {
  lead_time: number;
  avg_price: number;
  special_requests: string;
  party_size?: number;
  children?: number;
  repeat?: boolean;
}): Promise<PredictionResponseUnified> {
  const body: ReservationInput = {
    guest_name: "Simulation",
    party_size: input.party_size ?? 2,
    children: input.children ?? 0,
    booking_advance_days: input.lead_time,
    special_needs_count: 0,
    is_repeat_guest: !!input.repeat,
    estimated_spend_per_cover: input.avg_price,
    reservation_date: undefined,
    reservation_time: undefined,
    previous_cancellations: 0,
    previous_completions: 0,
    booking_channel: "Online",
    notes: input.special_requests,
    table_number: undefined,
  };

  const res = await fetch(`${BASE}/predict-guest-behavior`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as PredictionResponseUnified;
}
