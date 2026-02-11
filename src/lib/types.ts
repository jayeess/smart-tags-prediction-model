export interface Sentiment {
  score: number;
  label: "positive" | "neutral" | "negative";
  emoji: string;
}

export interface GuestPrediction {
  guest_name: string;
  reservation_id?: string;
  reliability_score: number;
  no_show_risk: number;
  risk_label: "Low Risk" | "Medium Risk" | "High Risk";
  ai_tag: string;
  spend_tag: string;
  sentiment: Sentiment;
  confidence: number;
  tenant_id: string;
  predicted_at: string;
}

export interface ReservationInput {
  guest_name: string;
  party_size: number;
  children: number;
  booking_advance_days: number;
  special_needs_count: number;
  is_repeat_guest: boolean;
  estimated_spend_per_cover: number;
  reservation_date?: string;
  reservation_time?: string;
  previous_cancellations: number;
  previous_completions: number;
  booking_channel: string;
  notes: string;
  table_number?: number;
}

export interface TagResult {
  tag: string;
  category: string;
  color: string;
}

export interface AnalyzeTagsResponse {
  customer_name: string;
  tags: TagResult[];
  sentiment: Sentiment;
  confidence: number;
  engine: string;
}

export interface DemoScenario {
  name: string;
  reservation: Omit<ReservationInput, "reservation_date" | "reservation_time" | "table_number">;
}

export interface SimulatedReservation extends ReservationInput {
  reservation_id: string;
  tenant_id: string;
}

export interface AIPrediction {
  risk_score: number;
  risk_label: string;
  explanation: string;
}

export type SmartTagCategory = "Dietary" | "Occasion" | "Seating";

export interface SmartTag {
  label: string;
  category: SmartTagCategory;
  color: string;
}

export interface PredictionResponseUnified {
  ai_prediction: AIPrediction;
  smart_tags: SmartTag[];
}
