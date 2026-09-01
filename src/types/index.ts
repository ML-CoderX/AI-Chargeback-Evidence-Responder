// ============================================================
// Chargeback Evidence Responder — Shared Type Definitions
// ============================================================

// ---- Razorpay-aligned Dispute Entity ----

export type DisputeStatus = 'open' | 'under_review' | 'won' | 'lost' | 'closed';
export type DisputePhase = 'fraud' | 'retrieval' | 'chargeback' | 'pre_arbitration' | 'arbitration';

export type ReasonCategory = 'fraud' | 'customer_dispute' | 'processing_error' | 'authorization_error';

export interface Payment {
  id: string;                 // e.g. "pay_SynABC123"
  amount: number;             // in currency subunits (paise)
  currency: string;           // ISO 4217
  method: string;             // "card", "upi", "netbanking", etc.
  customer_email: string;
  customer_phone: string;
  customer_name: string;
  description: string;
  is_3ds_authenticated: boolean;
  ip_address: string;
  device_fingerprint: string;
  billing_address: string;
  shipping_address: string;
  created_at: number;         // Unix timestamp
  metadata: string;           // JSON string
}

export interface Dispute {
  id: string;                 // e.g. "disp_SynXYZ789"
  payment_id: string;
  amount: number;
  currency: string;
  amount_deducted: number;
  reason_code: string;
  reason_description: string;
  reason_category: ReasonCategory;
  status: DisputeStatus;
  phase: DisputePhase;
  respond_by: number;         // Unix timestamp
  created_at: number;
}

// ---- Evidence ----

export type EvidenceCategory =
  | 'shipping_proof'
  | 'billing_proof'
  | 'cancellation_proof'
  | 'customer_communication'
  | 'proof_of_service'
  | 'explanation_letter'
  | 'refund_confirmation'
  | 'access_activity_log'
  | 'refund_cancellation_policy'
  | 'terms_and_conditions'
  | 'others';

export type EvidenceStatus = 'present' | 'missing';

export interface EvidenceItem {
  id: string;
  dispute_id: string;
  category: EvidenceCategory;
  status: EvidenceStatus;
  source_description: string | null;  // What the evidence actually is
  document_path: string | null;       // Path to uploaded doc (if any)
  created_at: number;
}

export type PackageStatus = 'draft' | 'ready' | 'submitted_externally';

export interface EvidencePackage {
  id: string;
  dispute_id: string;
  summary: string;
  win_score: number;          // 0–100
  status: PackageStatus;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
  updated_at: number;
}

// ---- Scoring ----

export interface ScoringFactor {
  name: string;
  weight: number;             // 0–1
  value: number;              // 0–1
  weighted_score: number;     // weight × value
  description: string;
}

export interface ScoreResult {
  score: number;              // 0–100
  factors: ScoringFactor[];
  engine_version: string;
  computed_at: number;
}

export interface ScoringHistoryEntry {
  id: string;
  dispute_id: string;
  timestamp: number;
  score: number;
  factors: string;            // JSON string of ScoringFactor[]
  engine_version: string;
}

// ---- Audit Trail ----

export type AuditAction =
  | 'dispute_created'
  | 'evidence_added'
  | 'evidence_removed'
  | 'score_computed'
  | 'package_created'
  | 'package_updated'
  | 'package_marked_ready'
  | 'package_reviewed'
  | 'dispute_status_changed'
  | 'system_seed';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  dispute_id: string | null;
  action: AuditAction;
  actor: string;              // "system", "analyst", etc.
  details: string;            // JSON string
  evidence_snapshot: string | null; // JSON string
}

// ---- API Response Wrappers ----

export interface DisputeWithPayment extends Dispute {
  payment: Payment;
}

export interface DisputeDetail extends DisputeWithPayment {
  evidence_items: EvidenceItem[];
  evidence_package: EvidencePackage | null;
  latest_score: ScoreResult | null;
}

export interface AnalyticsData {
  total_disputes: number;
  open_disputes: number;
  won_disputes: number;
  lost_disputes: number;
  avg_win_score: number;
  response_rate: number;
  disputes_by_phase: Record<DisputePhase, number>;
  disputes_by_reason: Record<string, number>;
  disputes_by_status: Record<DisputeStatus, number>;
  recent_scores: Array<{ dispute_id: string; score: number; timestamp: number }>;
}

// ---- Reason Code Mapping ----

export interface ReasonCodeInfo {
  code: string;
  category: ReasonCategory;
  description: string;
  required_evidence: EvidenceCategory[];
  base_win_rate: number;      // 0–1
  recommended_actions: string[];
}
