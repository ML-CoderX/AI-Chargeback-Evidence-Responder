// ============================================================
// Phase 1 — Evidence retriever
// ============================================================
// Pulls only the categories relevant to a dispute's reason code.
// Every retrieval call is logged to audit_log.
// ============================================================

import { getDb, queryOne, insertAuditLog, saveDb } from '@/lib/db';
import { classifyReasonCode } from '@/lib/evidence/classifier';
import {
  ReasonCode, EvidenceCategory, EvidenceBundle,
  EvidenceAuthentication, EvidenceFulfillment,
  EvidenceBehavioral, EvidenceCommunication,
} from '@/types';

export async function retrieveEvidence(disputeId: string): Promise<EvidenceBundle> {
  const db = await getDb();

  // Get dispute + order info
  const dispute = queryOne(db,
    `SELECT d.*, o.customer_id
     FROM disputes d JOIN orders o ON d.order_id = o.id
     WHERE d.id = ?`, [disputeId]);

  if (!dispute) throw new Error(`Dispute not found: ${disputeId}`);

  const reasonCode = dispute.reason_code as ReasonCode;
  const orderId = dispute.order_id as string;
  const customerId = dispute.customer_id as string;
  const { required } = classifyReasonCode(reasonCode);

  // Retrieve only relevant categories
  let authentication: EvidenceAuthentication | null = null;
  let fulfillment: EvidenceFulfillment | null = null;
  let behavioral: EvidenceBehavioral | null = null;
  let communication: EvidenceCommunication | null = null;

  if (required.includes('authentication')) {
    const row = queryOne(db, `SELECT * FROM evidence_authentication WHERE order_id = ?`, [orderId]);
    if (row) authentication = row as unknown as EvidenceAuthentication;
  }
  if (required.includes('fulfillment')) {
    const row = queryOne(db, `SELECT * FROM evidence_fulfillment WHERE order_id = ?`, [orderId]);
    if (row) fulfillment = row as unknown as EvidenceFulfillment;
  }
  if (required.includes('behavioral')) {
    const row = queryOne(db, `SELECT * FROM evidence_behavioral WHERE customer_id = ?`, [customerId]);
    if (row) behavioral = row as unknown as EvidenceBehavioral;
  }
  if (required.includes('communication')) {
    const row = queryOne(db, `SELECT * FROM evidence_communication WHERE order_id = ?`, [orderId]);
    if (row) communication = row as unknown as EvidenceCommunication;
  }

  // Audit log for every retrieval
  insertAuditLog(db, {
    dispute_id: disputeId,
    action: 'evidence_retrieved',
    actor: 'system',
    payload_json: JSON.stringify({ categories: required, disputeId }),
    timestamp: Math.floor(Date.now() / 1000),
  });
  saveDb();

  return {
    disputeId,
    reasonCode,
    categories: required,
    authentication,
    fulfillment,
    behavioral,
    communication,
  };
}
