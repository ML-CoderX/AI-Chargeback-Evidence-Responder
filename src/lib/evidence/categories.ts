// ============================================================
// Evidence Categories — Razorpay-aligned evidence taxonomy
// ============================================================

import { EvidenceCategory } from '@/types';

export interface CategoryInfo {
  key: EvidenceCategory;
  label: string;
  description: string;
  icon: string; // lucide-react icon name
}

export const EVIDENCE_CATEGORIES: Record<EvidenceCategory, CategoryInfo> = {
  shipping_proof: {
    key: 'shipping_proof',
    label: 'Shipping Proof',
    description: 'Tracking numbers, carrier records, signed delivery receipts',
    icon: 'Truck',
  },
  billing_proof: {
    key: 'billing_proof',
    label: 'Billing Proof',
    description: 'Invoices, receipts, billing statements confirming the charge',
    icon: 'Receipt',
  },
  cancellation_proof: {
    key: 'cancellation_proof',
    label: 'Cancellation Proof',
    description: 'Evidence that no cancellation was requested or was outside policy',
    icon: 'XCircle',
  },
  customer_communication: {
    key: 'customer_communication',
    label: 'Customer Communication',
    description: 'Email threads, chat logs, support tickets with the customer',
    icon: 'MessageSquare',
  },
  proof_of_service: {
    key: 'proof_of_service',
    label: 'Proof of Service',
    description: 'Evidence that the service was rendered as described',
    icon: 'CheckCircle',
  },
  explanation_letter: {
    key: 'explanation_letter',
    label: 'Explanation Letter',
    description: 'Merchant's written explanation contesting the dispute',
    icon: 'FileText',
  },
  refund_confirmation: {
    key: 'refund_confirmation',
    label: 'Refund Confirmation',
    description: 'Proof that a refund was already processed for this transaction',
    icon: 'RotateCcw',
  },
  access_activity_log: {
    key: 'access_activity_log',
    label: 'Access / Activity Log',
    description: 'Login records, IP logs, device fingerprints, usage activity',
    icon: 'Activity',
  },
  refund_cancellation_policy: {
    key: 'refund_cancellation_policy',
    label: 'Refund / Cancellation Policy',
    description: 'Published refund and cancellation policy the customer agreed to',
    icon: 'ScrollText',
  },
  terms_and_conditions: {
    key: 'terms_and_conditions',
    label: 'Terms & Conditions',
    description: 'Terms of service the customer accepted at checkout',
    icon: 'Scale',
  },
  others: {
    key: 'others',
    label: 'Other Evidence',
    description: 'Any additional supporting documentation',
    icon: 'Paperclip',
  },
};

/**
 * Get the display label for an evidence category.
 */
export function getCategoryLabel(category: EvidenceCategory): string {
  return EVIDENCE_CATEGORIES[category]?.label ?? category;
}

/**
 * Get all evidence category keys.
 */
export function getAllCategories(): EvidenceCategory[] {
  return Object.keys(EVIDENCE_CATEGORIES) as EvidenceCategory[];
}
