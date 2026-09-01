-- ============================================================
-- Chargeback Evidence Responder — Database Schema
-- ============================================================

-- Payments table: synthetic Razorpay payment records
CREATE TABLE IF NOT EXISTS payments (
  id                   TEXT PRIMARY KEY,
  amount               INTEGER NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'INR',
  method               TEXT NOT NULL,
  customer_email       TEXT NOT NULL,
  customer_phone       TEXT NOT NULL,
  customer_name        TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  is_3ds_authenticated INTEGER NOT NULL DEFAULT 0,
  ip_address           TEXT NOT NULL DEFAULT '',
  device_fingerprint   TEXT NOT NULL DEFAULT '',
  billing_address      TEXT NOT NULL DEFAULT '',
  shipping_address     TEXT NOT NULL DEFAULT '',
  created_at           INTEGER NOT NULL,
  metadata             TEXT NOT NULL DEFAULT '{}'
);

-- Disputes table: mirrors Razorpay dispute entity
CREATE TABLE IF NOT EXISTS disputes (
  id                  TEXT PRIMARY KEY,
  payment_id          TEXT NOT NULL REFERENCES payments(id),
  amount              INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  amount_deducted     INTEGER NOT NULL DEFAULT 0,
  reason_code         TEXT NOT NULL,
  reason_description  TEXT NOT NULL,
  reason_category     TEXT NOT NULL CHECK (reason_category IN ('fraud', 'customer_dispute', 'processing_error', 'authorization_error')),
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'won', 'lost', 'closed')),
  phase               TEXT NOT NULL DEFAULT 'chargeback' CHECK (phase IN ('fraud', 'retrieval', 'chargeback', 'pre_arbitration', 'arbitration')),
  respond_by          INTEGER NOT NULL,
  created_at          INTEGER NOT NULL
);

-- Evidence items linked to disputes
CREATE TABLE IF NOT EXISTS evidence (
  id                  TEXT PRIMARY KEY,
  dispute_id          TEXT NOT NULL REFERENCES disputes(id),
  category            TEXT NOT NULL CHECK (category IN ('shipping_proof', 'billing_proof', 'cancellation_proof', 'customer_communication', 'proof_of_service', 'explanation_letter', 'refund_confirmation', 'access_activity_log', 'refund_cancellation_policy', 'terms_and_conditions', 'others')),
  status              TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'missing')),
  source_description  TEXT,
  document_path       TEXT,
  created_at          INTEGER NOT NULL
);

-- Assembled evidence packages
CREATE TABLE IF NOT EXISTS evidence_packages (
  id                  TEXT PRIMARY KEY,
  dispute_id          TEXT NOT NULL UNIQUE REFERENCES disputes(id),
  summary             TEXT NOT NULL DEFAULT '',
  win_score           REAL NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'submitted_externally')),
  reviewed_by         TEXT,
  reviewed_at         INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

-- Immutable audit log — NO UPDATE OR DELETE operations allowed at application level
CREATE TABLE IF NOT EXISTS audit_log (
  id                  TEXT PRIMARY KEY,
  timestamp           INTEGER NOT NULL,
  dispute_id          TEXT,
  action              TEXT NOT NULL,
  actor               TEXT NOT NULL DEFAULT 'system',
  details             TEXT NOT NULL DEFAULT '{}',
  evidence_snapshot   TEXT
);

-- Scoring history — every score computation is logged
CREATE TABLE IF NOT EXISTS scoring_history (
  id                  TEXT PRIMARY KEY,
  dispute_id          TEXT NOT NULL REFERENCES disputes(id),
  timestamp           INTEGER NOT NULL,
  score               REAL NOT NULL,
  factors             TEXT NOT NULL DEFAULT '[]',
  engine_version      TEXT NOT NULL DEFAULT '1.0.0'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_phase ON disputes(phase);
CREATE INDEX IF NOT EXISTS idx_disputes_payment ON disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_evidence_dispute ON evidence(dispute_id);
CREATE INDEX IF NOT EXISTS idx_audit_dispute ON audit_log(dispute_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_scoring_dispute ON scoring_history(dispute_id);
