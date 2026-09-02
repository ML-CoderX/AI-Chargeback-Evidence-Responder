// ============================================================
// Seed — 80 synthetic disputes (60 train + 20 holdout)
// ============================================================
// Ground-truth rule for actual_outcome:
//   won  if  (auth_strong AND fulfillment_strong)
//            OR (auth_strong AND reason is fraud-related)
//            OR (fulfillment_strong AND reason is delivery-related)
//   lost otherwise
//
// Where:
//   auth_strong     = three_ds_result === 'success' AND (avs_match OR cvv_match)
//   fulfillment_strong = delivery_confirmed AND tracking_id != null
//
// Deliberately introduces NULL evidence fields on ~30% of disputes
// so Phase 3 completeness-flag testing is meaningful.
// ============================================================

import { getDb, insertAuditLog, saveDb } from '@/lib/db';
import { ReasonCode } from '@/types';

/* ---- helpers ---- */
function pick<T>(a: readonly T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function rInt(lo: number, hi: number) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function rBool(pTrue = 0.5): number { return Math.random() < pTrue ? 1 : 0; }
function maybe<T>(val: T, pNull = 0.3): T | null { return Math.random() < pNull ? null : val; }
function uid(prefix: string) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

const NAMES = [
  'Aarav Sharma','Priya Patel','Vikram Singh','Ananya Gupta',
  'Rohan Mehta','Neha Reddy','Arjun Kumar','Kavya Nair',
  'Siddharth Joshi','Meera Iyer','Rahul Deshmukh','Pooja Banerjee',
  'Aditya Verma','Sneha Kulkarni','Karthik Rao','Divya Menon',
];
const CITIES = ['Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Pune','Kolkata','Ahmedabad'];
const STREETS = ['MG Road','Station Road','Gandhi Nagar','Park Street','Lake View','Hill Top'];
const REASON_CODES: ReasonCode[] = [
  'fraudulent_transaction','product_not_received',
  'product_not_as_described','duplicate_charge',
];

function addr() {
  return `${rInt(1,500)}, ${pick(STREETS)}, ${pick(CITIES)} ${rInt(100000,999999)}`;
}

/* ---- ground-truth rule ---- */
function computeOutcome(
  reason: ReasonCode,
  auth: { avs: number | null; cvv: number | null; tds: string | null },
  ful: { delivered: number | null; tracking: string | null }
): 'won' | 'lost' {
  const authStrong = auth.tds === 'success' && (auth.avs === 1 || auth.cvv === 1);
  const fulStrong  = ful.delivered === 1 && ful.tracking !== null;

  if (authStrong && fulStrong) return 'won';
  if (authStrong && (reason === 'fraudulent_transaction' || reason === 'duplicate_charge')) return 'won';
  if (fulStrong  && (reason === 'product_not_received' || reason === 'product_not_as_described')) return 'won';
  return 'lost';
}

/* ---- main ---- */
export async function seedDatabase() {
  const db = await getDb();

  // Wipe existing data (order matters for FK)
  for (const t of [
    'audit_log','scores','evidence_communication','evidence_behavioral',
    'evidence_fulfillment','evidence_authentication','disputes','orders',
  ]) {
    db.run(`DELETE FROM ${t}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const NUM = 80;
  const HOLDOUT_START = 60; // indices 60-79 are holdout

  const customerPool: string[] = [];
  for (let i = 0; i < 30; i++) customerPool.push(uid('cust'));

  for (let i = 0; i < NUM; i++) {
    const isHoldout = i >= HOLDOUT_START ? 1 : 0;
    const orderId   = uid('ord');
    const disputeId = uid('disp');
    const customerId = pick(customerPool);
    const reason    = pick(REASON_CODES);
    const amount    = pick([15000,25000,49900,99900,149900,250000,499900,999900]);
    const placedAt  = now - rInt(10, 120) * 86400;
    const filedAt   = placedAt + rInt(3, 30) * 86400;

    // ---- order ----
    db.run(
      `INSERT INTO orders (id,customer_id,amount,placed_at,billing_address,shipping_address)
       VALUES (?,?,?,?,?,?)`,
      [orderId, customerId, amount, placedAt, addr(), addr()]
    );

    // ---- evidence_authentication ----
    // ~30% chance each field is null to simulate missing evidence
    const avs = maybe(rBool(0.7), 0.25);
    const cvv = maybe(rBool(0.7), 0.25);
    const tds = maybe(pick(['success','success','success','failure','attempted']), 0.2);
    const fp  = maybe(uid('fp'), 0.3);
    db.run(
      `INSERT INTO evidence_authentication (order_id,avs_match,cvv_match,three_ds_result,device_fingerprint)
       VALUES (?,?,?,?,?)`,
      [orderId, avs, cvv, tds, fp]
    );

    // ---- evidence_fulfillment ----
    const delivered   = maybe(rBool(0.65), 0.2);
    const trackingId  = maybe(`TRACK${rInt(100000,999999)}`, 0.25);
    const deliveredAt = delivered === 1 ? placedAt + rInt(2, 14) * 86400 : null;
    const sigCaptured = maybe(delivered === 1 ? rBool(0.5) : 0, 0.35);
    db.run(
      `INSERT INTO evidence_fulfillment (order_id,delivery_confirmed,tracking_id,delivered_at,signature_captured)
       VALUES (?,?,?,?,?)`,
      [orderId, delivered, trackingId, deliveredAt, sigCaptured]
    );

    // ---- evidence_behavioral (keyed by customer, insert-or-ignore) ----
    const priorOrders   = maybe(rInt(1, 50), 0.1);
    const priorDisputes = maybe(rInt(0, 5), 0.15);
    const policyAt      = maybe(placedAt - rInt(1, 365) * 86400, 0.2);
    const accountAge    = maybe(rInt(10, 1500), 0.1);
    db.run(
      `INSERT OR IGNORE INTO evidence_behavioral
       (customer_id,prior_order_count,prior_dispute_count,policy_accepted_at,account_age_days)
       VALUES (?,?,?,?,?)`,
      [customerId, priorOrders, priorDisputes, policyAt, accountAge]
    );

    // ---- evidence_communication ----
    const tickets = maybe(rInt(0, 8), 0.2);
    const lastContact = maybe(filedAt - rInt(0, 15) * 86400, 0.25);
    const emailSent   = maybe(rBool(0.8), 0.15);
    db.run(
      `INSERT INTO evidence_communication (order_id,support_tickets_count,last_contact_at,confirmation_email_sent)
       VALUES (?,?,?,?)`,
      [orderId, tickets, lastContact, emailSent]
    );

    // ---- dispute (with ground-truth label) ----
    const outcome = computeOutcome(
      reason,
      { avs, cvv, tds },
      { delivered, tracking: trackingId }
    );
    db.run(
      `INSERT INTO disputes (id,order_id,reason_code,filed_at,amount,status,actual_outcome,is_holdout)
       VALUES (?,?,?,?,?,?,?,?)`,
      [disputeId, orderId, reason, filedAt, amount, 'open', outcome, isHoldout]
    );

    // ---- audit ----
    insertAuditLog(db, {
      dispute_id: disputeId,
      action: 'dispute_created',
      actor: 'system',
      payload_json: JSON.stringify({ reason_code: reason, amount, is_holdout: isHoldout }),
      timestamp: filedAt,
    });
  }

  insertAuditLog(db, {
    dispute_id: null,
    action: 'seed_complete',
    actor: 'system',
    payload_json: JSON.stringify({ total: NUM, train: HOLDOUT_START, holdout: NUM - HOLDOUT_START }),
    timestamp: now,
  });

  saveDb();
  return { total: NUM, train: HOLDOUT_START, holdout: NUM - HOLDOUT_START };
}
