-- ============================================================
-- Chargeback Evidence Responder — Schema v2
-- 8 tables: disputes, orders, 4 evidence tables, scores, audit_log
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,
  payment_id        TEXT NOT NULL DEFAULT '',
  customer_id       TEXT NOT NULL,
  amount            INTEGER NOT NULL,          -- paise
  placed_at         INTEGER NOT NULL,          -- unix ts
  billing_address   TEXT NOT NULL DEFAULT '',
  shipping_address  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS disputes (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id),
  reason_code       TEXT NOT NULL CHECK (reason_code IN (
    'fraudulent_transaction','product_not_received',
    'product_not_as_described','duplicate_charge'
  )),
  filed_at          INTEGER NOT NULL,
  amount            INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','won','lost')),
  actual_outcome    TEXT CHECK (actual_outcome IN ('won','lost')),
  is_holdout        INTEGER NOT NULL DEFAULT 0  -- 0 = train, 1 = holdout
);

CREATE TABLE IF NOT EXISTS evidence_authentication (
  order_id          TEXT PRIMARY KEY REFERENCES orders(id),
  avs_match         INTEGER,  -- 1/0/NULL
  cvv_match         INTEGER,
  three_ds_result   TEXT,     -- 'success'/'failure'/'attempted'/NULL
  device_fingerprint TEXT
);

CREATE TABLE IF NOT EXISTS evidence_fulfillment (
  order_id          TEXT PRIMARY KEY REFERENCES orders(id),
  delivery_confirmed INTEGER, -- 1/0/NULL
  tracking_id       TEXT,
  delivered_at      INTEGER,  -- unix ts / NULL
  signature_captured INTEGER  -- 1/0/NULL
);

CREATE TABLE IF NOT EXISTS evidence_behavioral (
  customer_id       TEXT PRIMARY KEY,
  prior_order_count  INTEGER,
  prior_dispute_count INTEGER,
  policy_accepted_at INTEGER,
  account_age_days   INTEGER
);

CREATE TABLE IF NOT EXISTS evidence_communication (
  order_id          TEXT PRIMARY KEY REFERENCES orders(id),
  support_tickets_count INTEGER,
  last_contact_at   INTEGER,
  confirmation_email_sent INTEGER -- 1/0/NULL
);

CREATE TABLE IF NOT EXISTS scores (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  dispute_id          TEXT NOT NULL REFERENCES disputes(id),
  win_probability     REAL NOT NULL,
  completeness_score  REAL NOT NULL,
  missing_categories  TEXT NOT NULL DEFAULT '[]',  -- JSON array
  model_version       TEXT NOT NULL DEFAULT 'baseline_rule',
  scored_at           INTEGER NOT NULL
);

-- Append-only. Application must never UPDATE or DELETE rows.
CREATE TABLE IF NOT EXISTS audit_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  dispute_id        TEXT,
  action            TEXT NOT NULL,
  actor             TEXT NOT NULL DEFAULT 'system',
  payload_json      TEXT NOT NULL DEFAULT '{}',
  timestamp         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_disputes_order ON disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_holdout ON disputes(is_holdout);
CREATE INDEX IF NOT EXISTS idx_scores_dispute ON scores(dispute_id);
CREATE INDEX IF NOT EXISTS idx_audit_dispute ON audit_log(dispute_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(timestamp);
