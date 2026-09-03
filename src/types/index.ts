// ============================================================
// Shared Type Definitions — v2
// ============================================================

/* ---- Core entities ---- */

export interface Order {
  id: string;
  payment_id: string;
  customer_id: string;
  amount: number;
  placed_at: number;
  billing_address: string;
  shipping_address: string;
}

export type ReasonCode =
  | 'fraudulent_transaction'
  | 'product_not_received'
  | 'product_not_as_described'
  | 'duplicate_charge';

export type DisputeStatus = 'open' | 'under_review' | 'won' | 'lost';
export type Outcome = 'won' | 'lost';

export interface Dispute {
  id: string;
  order_id: string;
  reason_code: ReasonCode;
  filed_at: number;
  amount: number;
  status: DisputeStatus;
  actual_outcome: Outcome | null;
  is_holdout: number; // 0 | 1
}

/* ---- Evidence tables ---- */

export interface EvidenceAuthentication {
  order_id: string;
  avs_match: number | null;       // 1/0/null
  cvv_match: number | null;
  three_ds_result: string | null;  // 'success'/'failure'/'attempted'/null
  device_fingerprint: string | null;
}

export interface EvidenceFulfillment {
  order_id: string;
  delivery_confirmed: number | null; // 1/0/null
  tracking_id: string | null;
  delivered_at: number | null;
  signature_captured: number | null;
}

export interface EvidenceBehavioral {
  customer_id: string;
  prior_order_count: number | null;
  prior_dispute_count: number | null;
  policy_accepted_at: number | null;
  account_age_days: number | null;
}

export interface EvidenceCommunication {
  order_id: string;
  support_tickets_count: number | null;
  last_contact_at: number | null;
  confirmation_email_sent: number | null; // 1/0/null
}

/* ---- Aggregated evidence bundle (returned by retriever) ---- */

export type EvidenceCategory =
  | 'authentication'
  | 'fulfillment'
  | 'behavioral'
  | 'communication';

export interface EvidenceBundle {
  disputeId: string;
  reasonCode: ReasonCode;
  categories: EvidenceCategory[];
  authentication: EvidenceAuthentication | null;
  fulfillment: EvidenceFulfillment | null;
  behavioral: EvidenceBehavioral | null;
  communication: EvidenceCommunication | null;
}

/* ---- Scoring ---- */

export interface CompletenessResult {
  score: number;       // 0–1
  missing: string[];   // list of missing field names
}

export interface WinProbabilityResult {
  probability: number;    // 0–1
  topFactors: string[];   // human-readable explanations
}

export interface ScoreRow {
  id?: number;
  dispute_id: string;
  win_probability: number;
  completeness_score: number;
  missing_categories: string; // JSON array
  scored_at: number;
}

/* ---- Response draft ---- */

export interface DraftSection {
  title: string;
  status: 'present' | 'missing';
  content: string;        // the evidence narrative or the missing-data message
  missingReason?: string;  // why it matters
}

export interface ResponseDraft {
  disputeId: string;
  reasonCode: ReasonCode;
  sections: DraftSection[];
  markdownText: string;
  reviewedAt: number | null;
}

/* ---- Audit log ---- */

export interface AuditRow {
  id?: number;
  dispute_id: string | null;
  action: string;
  actor: string;
  payload_json: string;
  timestamp: number;
}

/* ---- Metrics ---- */

export interface EvalMetrics {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  fpCostPer: number;
  fnCostPer: number;
  totalFpCost: number;
  totalFnCost: number;
  totalCost: number;
}
