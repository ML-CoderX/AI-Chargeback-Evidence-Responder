// ============================================================
// Phase 1 — Reason-code classifier
// ============================================================
// Maps each reason code to the evidence categories actually
// relevant for contesting that specific chargeback type.
// This is explicit routing logic, not hidden in an LLM prompt.
// ============================================================

import { ReasonCode, EvidenceCategory } from '@/types';

/**
 * Given a dispute's reason code, return which evidence categories
 * are relevant for building a defense.
 *
 * Mapping rationale:
 * - fraudulent_transaction: authentication proves merchant verified identity;
 *   behavioral shows customer history (repeat buyer vs. serial disputer)
 * - product_not_received: fulfillment proves delivery happened;
 *   communication shows customer was engaged pre-dispute
 * - product_not_as_described: fulfillment shows what was sent;
 *   communication shows customer was offered resolution
 * - duplicate_charge: authentication proves charges were distinct;
 *   behavioral shows customer's engagement pattern
 */
export function classifyReasonCode(reasonCode: ReasonCode): {
  primary: EvidenceCategory;
  required: EvidenceCategory[];
} {
  switch (reasonCode) {
    case 'fraudulent_transaction':
      return {
        primary: 'authentication',
        required: ['authentication', 'behavioral'],
      };
    case 'product_not_received':
      return {
        primary: 'fulfillment',
        required: ['fulfillment', 'communication'],
      };
    case 'product_not_as_described':
      return {
        primary: 'fulfillment',
        required: ['fulfillment', 'communication'],
      };
    case 'duplicate_charge':
      return {
        primary: 'authentication',
        required: ['authentication', 'behavioral'],
      };
  }
}
