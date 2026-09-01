// ============================================================
// Reason Codes — Maps Razorpay reason codes to evidence needs
// ============================================================

import { ReasonCodeInfo, ReasonCategory, EvidenceCategory } from '@/types';

/**
 * Synthetic Razorpay-format reason codes covering all 4 categories.
 * Each code maps to:
 *  - required evidence categories
 *  - a base win rate (historical heuristic)
 *  - recommended actions for the analyst
 */
export const REASON_CODES: Record<string, ReasonCodeInfo> = {
  // ── Fraud ──
  'chargeback_fraud_not_recognized': {
    code: 'chargeback_fraud_not_recognized',
    category: 'fraud',
    description: 'Cardholder claims they did not authorize or recognize this transaction.',
    required_evidence: [
      'access_activity_log',
      'billing_proof',
      'customer_communication',
      'explanation_letter',
    ],
    base_win_rate: 0.35,
    recommended_actions: [
      'Provide 3DS/OTP authentication proof',
      'Include IP address and device fingerprint match',
      'Show billing address matches card records',
      'Include any prior successful transactions from same device',
    ],
  },
  'chargeback_fraud_card_not_present': {
    code: 'chargeback_fraud_card_not_present',
    category: 'fraud',
    description: 'Fraud claim on a card-not-present (online) transaction.',
    required_evidence: [
      'access_activity_log',
      'billing_proof',
      'shipping_proof',
      'explanation_letter',
    ],
    base_win_rate: 0.25,
    recommended_actions: [
      'Provide full 3DS authentication trail',
      'Show device fingerprint consistency',
      'Match shipping address to billing address',
      'Include AVS and CVV verification results',
    ],
  },

  // ── Customer Dispute ──
  'chargeback_product_not_received': {
    code: 'chargeback_product_not_received',
    category: 'customer_dispute',
    description: 'Customer claims the goods or services were never received.',
    required_evidence: [
      'shipping_proof',
      'billing_proof',
      'customer_communication',
      'explanation_letter',
    ],
    base_win_rate: 0.55,
    recommended_actions: [
      'Provide carrier tracking number with delivery confirmation',
      'Include signed delivery receipt if available',
      'Show delivery address matches order address',
      'Include customer communication acknowledging receipt',
    ],
  },
  'chargeback_product_not_as_described': {
    code: 'chargeback_product_not_as_described',
    category: 'customer_dispute',
    description: 'Customer claims the product was not as described or was defective.',
    required_evidence: [
      'proof_of_service',
      'customer_communication',
      'refund_cancellation_policy',
      'terms_and_conditions',
      'explanation_letter',
    ],
    base_win_rate: 0.40,
    recommended_actions: [
      'Include product listing/description screenshots',
      'Show return policy was clearly communicated',
      'Provide customer communication about the issue',
      'If partial refund was offered, include proof',
    ],
  },
  'chargeback_service_not_rendered': {
    code: 'chargeback_service_not_rendered',
    category: 'customer_dispute',
    description: 'Customer claims the service was never provided.',
    required_evidence: [
      'proof_of_service',
      'access_activity_log',
      'customer_communication',
      'explanation_letter',
    ],
    base_win_rate: 0.50,
    recommended_actions: [
      'Provide access logs showing service usage',
      'Include timestamps of service delivery',
      'Show customer communication confirming service',
      'Include usage analytics if applicable',
    ],
  },
  'chargeback_credit_not_processed': {
    code: 'chargeback_credit_not_processed',
    category: 'customer_dispute',
    description: 'Customer claims a refund was promised but never processed.',
    required_evidence: [
      'refund_confirmation',
      'customer_communication',
      'refund_cancellation_policy',
      'explanation_letter',
    ],
    base_win_rate: 0.60,
    recommended_actions: [
      'Provide refund transaction ID and timestamp',
      'Show refund policy and whether conditions were met',
      'Include communication about the refund timeline',
      'If refund was processed, provide bank confirmation',
    ],
  },

  // ── Processing Error ──
  'chargeback_duplicate_charge': {
    code: 'chargeback_duplicate_charge',
    category: 'processing_error',
    description: 'Customer was charged multiple times for the same transaction.',
    required_evidence: [
      'billing_proof',
      'explanation_letter',
      'refund_confirmation',
    ],
    base_win_rate: 0.45,
    recommended_actions: [
      'Show each charge corresponds to a separate order',
      'Provide distinct order IDs and timestamps',
      'If duplicate was refunded, provide confirmation',
      'Include transaction logs from payment gateway',
    ],
  },
  'chargeback_incorrect_amount': {
    code: 'chargeback_incorrect_amount',
    category: 'processing_error',
    description: 'The charged amount differs from what the customer agreed to.',
    required_evidence: [
      'billing_proof',
      'terms_and_conditions',
      'customer_communication',
      'explanation_letter',
    ],
    base_win_rate: 0.50,
    recommended_actions: [
      'Provide the original order confirmation with agreed amount',
      'Include checkout screenshots showing the total',
      'If there are taxes/fees, show they were disclosed',
      'Include signed contract if applicable',
    ],
  },

  // ── Authorization Error ──
  'chargeback_no_authorization': {
    code: 'chargeback_no_authorization',
    category: 'authorization_error',
    description: 'Transaction processed without valid authorization.',
    required_evidence: [
      'access_activity_log',
      'billing_proof',
      'explanation_letter',
    ],
    base_win_rate: 0.30,
    recommended_actions: [
      'Provide authorization code from payment gateway',
      'Show card validation (AVS/CVV) results',
      'Include 3DS authentication proof if available',
      'Show the transaction was approved by the issuing bank',
    ],
  },
  'chargeback_expired_card': {
    code: 'chargeback_expired_card',
    category: 'authorization_error',
    description: 'Transaction processed on an expired card.',
    required_evidence: [
      'billing_proof',
      'explanation_letter',
    ],
    base_win_rate: 0.20,
    recommended_actions: [
      'Provide gateway authorization confirmation',
      'Show the issuing bank approved the transaction',
      'Include any updated card-on-file authorization',
    ],
  },
};

/**
 * Get reason code info by code string.
 */
export function getReasonCodeInfo(code: string): ReasonCodeInfo | null {
  return REASON_CODES[code] ?? null;
}

/**
 * Get all reason codes for a given category.
 */
export function getReasonCodesByCategory(category: ReasonCategory): ReasonCodeInfo[] {
  return Object.values(REASON_CODES).filter((rc) => rc.category === category);
}

/**
 * Get all reason code keys.
 */
export function getAllReasonCodes(): string[] {
  return Object.keys(REASON_CODES);
}

/**
 * Get the required evidence categories for a given reason code.
 */
export function getRequiredEvidence(code: string): EvidenceCategory[] {
  return REASON_CODES[code]?.required_evidence ?? [];
}
