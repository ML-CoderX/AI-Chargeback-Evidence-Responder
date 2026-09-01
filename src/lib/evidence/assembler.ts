// ============================================================
// Evidence Assembler — Builds evidence packages for disputes
// ============================================================
// HARD BOUNDARY: This module NEVER fabricates evidence.
// If a required evidence category is not present in the data,
// it is flagged as MISSING — never filled with a guess.
// ============================================================

import { Dispute, Payment, EvidenceItem, EvidenceCategory } from '@/types';
import { getRequiredEvidence, getReasonCodeInfo } from '@/lib/scoring/reason-codes';
import { EVIDENCE_CATEGORIES } from '@/lib/evidence/categories';

export interface AssembledEvidence {
  dispute_id: string;
  reason_code: string;
  required_categories: EvidenceCategory[];
  present: EvidenceItem[];
  missing: EvidenceCategory[];
  completeness: number; // 0–1
  summary: string;
  recommended_actions: string[];
}

/**
 * Assemble an evidence package for a dispute.
 *
 * Cross-references the reason code's required evidence against
 * what is actually present. Missing categories are explicitly
 * flagged — never fabricated.
 */
export function assembleEvidence(
  dispute: Dispute,
  payment: Payment,
  existingEvidence: EvidenceItem[]
): AssembledEvidence {
  const requiredCategories = getRequiredEvidence(dispute.reason_code);
  const reasonInfo = getReasonCodeInfo(dispute.reason_code);

  // Separate present from missing
  const presentEvidence = existingEvidence.filter((e) => e.status === 'present');
  const presentCategories = new Set(presentEvidence.map((e) => e.category));

  const missingCategories = requiredCategories.filter(
    (cat) => !presentCategories.has(cat)
  );

  const completeness = requiredCategories.length > 0
    ? (requiredCategories.length - missingCategories.length) / requiredCategories.length
    : 0;

  // Generate summary from ACTUAL data only — no fabrication
  const summary = generateSummary(dispute, payment, presentEvidence, missingCategories);

  return {
    dispute_id: dispute.id,
    reason_code: dispute.reason_code,
    required_categories: requiredCategories,
    present: presentEvidence,
    missing: missingCategories,
    completeness,
    summary,
    recommended_actions: reasonInfo?.recommended_actions ?? [],
  };
}

/**
 * Generate a factual summary from actual data.
 *
 * HARD BOUNDARY: This function uses template literals populated
 * exclusively from verified data fields. It NEVER infers,
 * guesses, or fabricates any information.
 */
function generateSummary(
  dispute: Dispute,
  payment: Payment,
  presentEvidence: EvidenceItem[],
  missingCategories: EvidenceCategory[]
): string {
  const reasonInfo = getReasonCodeInfo(dispute.reason_code);
  const amountINR = (dispute.amount / 100).toLocaleString('en-IN');
  const paymentDate = new Date(payment.created_at * 1000).toLocaleDateString('en-IN');
  const disputeDate = new Date(dispute.created_at * 1000).toLocaleDateString('en-IN');

  const lines: string[] = [];

  // Header
  lines.push(
    `Dispute ${dispute.id} contesting ₹${amountINR} charged on ${paymentDate}.`
  );
  lines.push(
    `Reason: ${reasonInfo?.description ?? dispute.reason_description} (${dispute.reason_code}).`
  );
  lines.push(`Dispute filed: ${disputeDate}. Phase: ${dispute.phase}.`);

  // Payment authentication
  if (payment.is_3ds_authenticated) {
    lines.push('Transaction was authenticated via 3D Secure (OTP verified).');
  }

  // Present evidence
  if (presentEvidence.length > 0) {
    lines.push('');
    lines.push('Evidence provided:');
    for (const item of presentEvidence) {
      const catInfo = EVIDENCE_CATEGORIES[item.category];
      lines.push(`• ${catInfo?.label ?? item.category}: ${item.source_description ?? 'Document on file'}`);
    }
  }

  // Missing evidence — explicitly flagged
  if (missingCategories.length > 0) {
    lines.push('');
    lines.push('⚠ MISSING EVIDENCE (required for this reason code):');
    for (const cat of missingCategories) {
      const catInfo = EVIDENCE_CATEGORIES[cat];
      lines.push(`• ${catInfo?.label ?? cat}: NOT AVAILABLE — ${catInfo?.description ?? 'Required documentation not found'}`);
    }
  }

  return lines.join('\n');
}
