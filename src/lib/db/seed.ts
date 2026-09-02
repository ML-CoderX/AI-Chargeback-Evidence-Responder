// ============================================================
// Seed — 80 synthetic disputes backed by real Razorpay orders
// ============================================================
// Order creation: REAL Razorpay test-mode API calls (order_* IDs)
// Payment simulation: synthetic pay_* IDs (Razorpay requires
//   client-side checkout for payment creation — PCI-DSS constraint)
// Disputes/evidence/outcomes: fully synthetic
//
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
// ~30% of evidence fields are deliberately NULL for completeness testing.
// ============================================================

import { getDb, insertAuditLog, saveDb } from '@/lib/db';
import { ReasonCode } from '@/types';

/* ---- Razorpay SDK ---- */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Razorpay = require('razorpay');

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || keyId === 'rzp_test_REPLACE_ME' || !keySecret || keySecret === 'REPLACE_ME') {
    return null; // Fall back to synthetic orders
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/* ---- helpers ---- */
function pick<T>(a: readonly T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function rInt(lo: number, hi: number) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function rBool(pTrue = 0.5): number { return Math.random() < pTrue ? 1 : 0; }
function maybe<T>(val: T, pNull = 0.3): T | null { return Math.random() < pNull ? null : val; }
function uid(prefix: string) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
const PRODUCTS = [
  'Wireless Earbuds','USB-C Hub','Laptop Stand','Mechanical Keyboard',
  'Webcam HD','Monitor Light','Phone Case','Charging Cable',
  'Power Bank','Desk Mat','Screen Protector','Travel Adapter',
];

function addr() {
  return `${rInt(1,500)}, ${pick(STREETS)}, ${pick(CITIES)} ${rInt(100000,999999)}`;
}

/* ---- Razorpay order creation with retry ---- */
async function createRazorpayOrder(
  rzp: InstanceType<typeof Razorpay>,
  amount: number,
  receipt: string,
  maxRetries = 2
): Promise<{ id: string; receipt: string }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const order = await rzp.orders.create({
        amount,
        currency: 'INR',
        receipt,
        notes: {
          source: 'chargeback_evidence_responder',
          environment: 'hackathon_seed',
          product: pick(PRODUCTS),
          customer: pick(NAMES),
        },
      });
      return { id: order.id, receipt: order.receipt };
    } catch (err) {
      if (attempt < maxRetries) {
        console.warn(`  Razorpay order creation failed (attempt ${attempt + 1}), retrying...`);
        await sleep(500);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Unreachable');
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
  const rzp = getRazorpayClient();
  const useRealOrders = rzp !== null;

  if (useRealOrders) {
    console.log('  Razorpay API keys detected — creating REAL test-mode orders');
  } else {
    console.log('  No Razorpay API keys — falling back to synthetic order IDs');
    console.log('  To use real orders, set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local');
  }

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

  let realOrderCount = 0;

  for (let i = 0; i < NUM; i++) {
    const isHoldout = i >= HOLDOUT_START ? 1 : 0;
    const customerId = pick(customerPool);
    const reason    = pick(REASON_CODES);
    const amount    = pick([15000,25000,49900,99900,149900,250000,499900,999900]);
    const placedAt  = now - rInt(10, 120) * 86400;
    const filedAt   = placedAt + rInt(3, 30) * 86400;
    const receipt   = `rcpt_${i}_${Date.now().toString(36)}`;

    // ---- Create order: real Razorpay or synthetic ----
    let orderId: string;
    let paymentId: string;

    if (useRealOrders) {
      try {
        const order = await createRazorpayOrder(rzp, amount, receipt);
        orderId = order.id;
        // Payment ID is synthetic — Razorpay requires client-side checkout
        // for payment creation (PCI-DSS compliance). We generate a synthetic
        // pay_* ID linked to the real order.
        paymentId = `pay_sim_${order.id.slice(6, 20)}`;
        realOrderCount++;
        if ((i + 1) % 10 === 0) {
          console.log(`  Created ${i + 1}/${NUM} orders via Razorpay API`);
        }
      } catch (err) {
        console.error(`  Failed to create Razorpay order #${i}, using synthetic:`, err);
        orderId = uid('ord');
        paymentId = uid('pay');
      }

      // Rate limiting: 200ms between API calls
      await sleep(200);
    } else {
      orderId = uid('ord');
      paymentId = uid('pay');
    }

    const disputeId = uid('disp');

    // ---- order ----
    db.run(
      `INSERT INTO orders (id,customer_id,amount,placed_at,billing_address,shipping_address)
       VALUES (?,?,?,?,?,?)`,
      [orderId, customerId, amount, placedAt, addr(), addr()]
    );

    // ---- evidence_authentication ----
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
      payload_json: JSON.stringify({
        reason_code: reason,
        amount,
        is_holdout: isHoldout,
        order_id: orderId,
        payment_id: paymentId,
        order_source: useRealOrders ? 'razorpay_test_api' : 'synthetic',
      }),
      timestamp: filedAt,
    });
  }

  insertAuditLog(db, {
    dispute_id: null,
    action: 'seed_complete',
    actor: 'system',
    payload_json: JSON.stringify({
      total: NUM,
      train: HOLDOUT_START,
      holdout: NUM - HOLDOUT_START,
      real_razorpay_orders: realOrderCount,
      order_source: useRealOrders ? 'razorpay_test_api' : 'synthetic',
    }),
    timestamp: now,
  });

  saveDb();
  return {
    total: NUM,
    train: HOLDOUT_START,
    holdout: NUM - HOLDOUT_START,
    realOrders: realOrderCount,
  };
}
