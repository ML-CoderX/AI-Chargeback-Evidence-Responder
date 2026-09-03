// ============================================================
// Stage 3 — Trained logistic regression classifier
// ============================================================
// Trains on the 60 non-holdout disputes using actual_outcome as label.
// Features are binary-encoded evidence fields + one-hot reason codes.
// Never peeks at the 20 holdout disputes.
//
// Outputs: win_probability (0–1) + per-prediction feature importances
// (coefficient × feature value) feeding the Score factors UI.
// ============================================================

import { getDb, queryAll, insertAuditLog, saveDb } from '@/lib/db';
import { EvidenceBundle, ReasonCode, WinProbabilityResult } from '@/types';
import { scoreCompleteness } from '@/lib/scoring/engine';

/* ── Feature extraction ── */

const FEATURE_NAMES = [
  'reason_fraudulent',
  'reason_not_received',
  'reason_not_as_described',
  'reason_duplicate',
  'avs_match',
  'cvv_match',
  'three_ds_success',
  'three_ds_failure',
  'has_device_fingerprint',
  'delivery_confirmed',
  'has_tracking',
  'signature_captured',
  'prior_orders_norm',       // normalized 0–1
  'prior_disputes_norm',
  'has_policy_accepted',
  'account_age_norm',
  'has_support_tickets',
  'confirmation_email_sent',
];

function extractFeatures(
  bundle: EvidenceBundle,
  reasonCode: ReasonCode
): number[] {
  const a = bundle.authentication;
  const f = bundle.fulfillment;
  const b = bundle.behavioral;
  const c = bundle.communication;

  return [
    // One-hot reason code
    reasonCode === 'fraudulent_transaction' ? 1 : 0,
    reasonCode === 'product_not_received' ? 1 : 0,
    reasonCode === 'product_not_as_described' ? 1 : 0,
    reasonCode === 'duplicate_charge' ? 1 : 0,
    // Authentication
    a?.avs_match === 1 ? 1 : 0,
    a?.cvv_match === 1 ? 1 : 0,
    a?.three_ds_result === 'success' ? 1 : 0,
    a?.three_ds_result === 'failure' ? 1 : 0,
    a?.device_fingerprint !== null && a?.device_fingerprint !== undefined ? 1 : 0,
    // Fulfillment
    f?.delivery_confirmed === 1 ? 1 : 0,
    f?.tracking_id !== null && f?.tracking_id !== undefined ? 1 : 0,
    f?.signature_captured === 1 ? 1 : 0,
    // Behavioral (normalized)
    b?.prior_order_count !== null && b?.prior_order_count !== undefined
      ? Math.min((b.prior_order_count as number) / 50, 1) : 0,
    b?.prior_dispute_count !== null && b?.prior_dispute_count !== undefined
      ? Math.min((b.prior_dispute_count as number) / 5, 1) : 0,
    b?.policy_accepted_at !== null && b?.policy_accepted_at !== undefined ? 1 : 0,
    b?.account_age_days !== null && b?.account_age_days !== undefined
      ? Math.min((b.account_age_days as number) / 1500, 1) : 0,
    // Communication
    c?.support_tickets_count !== null && c?.support_tickets_count !== undefined
      && (c.support_tickets_count as number) > 0 ? 1 : 0,
    c?.confirmation_email_sent === 1 ? 1 : 0,
  ];
}

/* ── Logistic regression ── */

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

function predict(weights: number[], bias: number, features: number[]): number {
  let z = bias;
  for (let i = 0; i < features.length; i++) z += weights[i] * features[i];
  return sigmoid(z);
}

interface TrainedModel {
  weights: number[];
  bias: number;
  featureNames: string[];
  trainSize: number;
  iterations: number;
}

/**
 * Train logistic regression via gradient descent.
 * Only uses training disputes (is_holdout = 0).
 */
export async function trainClassifier(): Promise<TrainedModel> {
  const db = await getDb();

  // Get training data — NEVER the holdout set
  const rows = queryAll(db, `
    SELECT d.*, o.customer_id,
           ea.avs_match, ea.cvv_match, ea.three_ds_result, ea.device_fingerprint,
           ef.delivery_confirmed, ef.tracking_id, ef.delivered_at, ef.signature_captured,
           eb.prior_order_count, eb.prior_dispute_count, eb.policy_accepted_at, eb.account_age_days,
           ec.support_tickets_count, ec.last_contact_at, ec.confirmation_email_sent
    FROM disputes d
    JOIN orders o ON d.order_id = o.id
    LEFT JOIN evidence_authentication ea ON ea.order_id = o.id
    LEFT JOIN evidence_fulfillment ef ON ef.order_id = o.id
    LEFT JOIN evidence_behavioral eb ON eb.customer_id = o.customer_id
    LEFT JOIN evidence_communication ec ON ec.order_id = o.id
    WHERE d.is_holdout = 0
  `);

  // Build feature matrix and labels
  const X: number[][] = [];
  const y: number[] = [];

  for (const r of rows) {
    const bundle: EvidenceBundle = {
      disputeId: r.id as string,
      reasonCode: r.reason_code as ReasonCode,
      categories: [],
      authentication: r.avs_match !== undefined ? {
        order_id: r.order_id as string,
        avs_match: r.avs_match as number | null,
        cvv_match: r.cvv_match as number | null,
        three_ds_result: r.three_ds_result as string | null,
        device_fingerprint: r.device_fingerprint as string | null,
      } : null,
      fulfillment: r.delivery_confirmed !== undefined ? {
        order_id: r.order_id as string,
        delivery_confirmed: r.delivery_confirmed as number | null,
        tracking_id: r.tracking_id as string | null,
        delivered_at: r.delivered_at as number | null,
        signature_captured: r.signature_captured as number | null,
      } : null,
      behavioral: r.prior_order_count !== undefined ? {
        customer_id: r.customer_id as string,
        prior_order_count: r.prior_order_count as number | null,
        prior_dispute_count: r.prior_dispute_count as number | null,
        policy_accepted_at: r.policy_accepted_at as number | null,
        account_age_days: r.account_age_days as number | null,
      } : null,
      communication: r.support_tickets_count !== undefined ? {
        order_id: r.order_id as string,
        support_tickets_count: r.support_tickets_count as number | null,
        last_contact_at: r.last_contact_at as number | null,
        confirmation_email_sent: r.confirmation_email_sent as number | null,
      } : null,
    };

    X.push(extractFeatures(bundle, r.reason_code as ReasonCode));
    y.push(r.actual_outcome === 'won' ? 1 : 0);
  }

  // Gradient descent
  const nFeatures = FEATURE_NAMES.length;
  const weights = new Array(nFeatures).fill(0);
  let bias = 0;
  const lr = 0.5;       // learning rate
  const iters = 500;    // iterations
  const lambda = 0.01;  // L2 regularization

  for (let iter = 0; iter < iters; iter++) {
    const gradW = new Array(nFeatures).fill(0);
    let gradB = 0;

    for (let i = 0; i < X.length; i++) {
      const pred = predict(weights, bias, X[i]);
      const err = pred - y[i];
      gradB += err;
      for (let j = 0; j < nFeatures; j++) {
        gradW[j] += err * X[i][j];
      }
    }

    // Update with L2 regularization
    for (let j = 0; j < nFeatures; j++) {
      weights[j] -= lr * (gradW[j] / X.length + lambda * weights[j]);
    }
    bias -= lr * (gradB / X.length);
  }

  const model: TrainedModel = {
    weights,
    bias,
    featureNames: FEATURE_NAMES,
    trainSize: X.length,
    iterations: iters,
  };

  // Log training to audit
  insertAuditLog(db, {
    dispute_id: null,
    action: 'classifier_trained',
    actor: 'system',
    payload_json: JSON.stringify({
      model_version: 'trained_v1',
      train_size: X.length,
      iterations: iters,
      feature_count: nFeatures,
      weights: weights.map((w, i) => ({ feature: FEATURE_NAMES[i], weight: Math.round(w * 1000) / 1000 })),
      bias: Math.round(bias * 1000) / 1000,
    }),
    timestamp: Math.floor(Date.now() / 1000),
  });
  saveDb();

  return model;
}

/* ── Cached model singleton ── */
let cachedModel: TrainedModel | null = null;

export async function getTrainedModel(): Promise<TrainedModel> {
  if (cachedModel) return cachedModel;
  cachedModel = await trainClassifier();
  return cachedModel;
}

export function clearModelCache() {
  cachedModel = null;
}

/* ── Score a single dispute with trained model ── */

export async function scoreWithTrainedModel(
  bundle: EvidenceBundle,
  disputeMeta: { reason_code: ReasonCode; amount: number }
): Promise<WinProbabilityResult> {
  const model = await getTrainedModel();
  const features = extractFeatures(bundle, disputeMeta.reason_code);
  const probability = predict(model.weights, model.bias, features);

  // Feature importances = coefficient × feature value, sorted by |contribution|
  const contributions = model.featureNames
    .map((name, i) => ({
      name: name.replace(/_/g, ' '),
      contribution: model.weights[i] * features[i],
      weight: model.weights[i],
      value: features[i],
    }))
    .filter(c => c.contribution !== 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const topFactors = contributions.slice(0, 5).map(c =>
    `${c.contribution > 0 ? '+' : ''}${(c.contribution * 100 / (Math.abs(model.bias) + contributions.reduce((s, x) => s + Math.abs(x.contribution), 0) || 1)).toFixed(0)}% ${c.name} (coeff: ${c.weight.toFixed(2)})`
  );

  return { probability, topFactors };
}

/**
 * Score a dispute with the trained model and write to DB.
 */
export async function scoreDisputeTrained(
  bundle: EvidenceBundle,
  disputeMeta: { reason_code: ReasonCode; amount: number }
) {
  const completeness = scoreCompleteness(bundle, bundle.categories);
  const winProb = await scoreWithTrainedModel(bundle, disputeMeta);

  const now = Math.floor(Date.now() / 1000);
  const db = await getDb();

  db.run(
    `INSERT INTO scores (dispute_id, win_probability, completeness_score, missing_categories, model_version, scored_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [bundle.disputeId, winProb.probability, completeness.score, JSON.stringify(completeness.missing), 'trained_v1', now]
  );

  insertAuditLog(db, {
    dispute_id: bundle.disputeId,
    action: 'score_computed',
    actor: 'system',
    payload_json: JSON.stringify({
      win_probability: winProb.probability,
      completeness: completeness.score,
      missing: completeness.missing,
      top_factors: winProb.topFactors,
      model_version: 'trained_v1',
    }),
    timestamp: now,
  });

  saveDb();
  return { completeness, winProb };
}
