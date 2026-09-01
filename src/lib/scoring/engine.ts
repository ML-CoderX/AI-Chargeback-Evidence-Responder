// ============================================================
// Scoring Engine — Deterministic win-probability scorer
// ============================================================
// HARD BOUNDARY: Every score computation MUST be logged to
// scoring_history and audit_log. Scores are transparent and
// factor-level breakdowns are always available.
// ============================================================

import { Dispute, Payment, EvidenceItem, ScoreResult, ScoringFactor } from '@/types';
import { getReasonCodeInfo, getRequiredEvidence } from '@/lib/scoring/reason-codes';

const ENGINE_VERSION = '1.0.0';

/**
 * Compute win probability score for a dispute.
 *
 * This is a deterministic, rule-based heuristic scorer.
 * It NEVER fabricates data — it only evaluates what evidence
 * is actually present vs. what is required.
 */
export function computeWinScore(
  dispute: Dispute,
  payment: Payment,
  evidenceItems: EvidenceItem[]
): ScoreResult {
  const factors: ScoringFactor[] = [];
  const now = Math.floor(Date.now() / 1000);

  // ── Factor 1: Evidence Completeness (30%) ──
  const requiredCategories = getRequiredEvidence(dispute.reason_code);
  const presentCategories = evidenceItems
    .filter((e) => e.status === 'present')
    .map((e) => e.category);

  const completeness = requiredCategories.length > 0
    ? requiredCategories.filter((c) => presentCategories.includes(c)).length / requiredCategories.length
    : 0;

  factors.push({
    name: 'Evidence Completeness',
    weight: 0.30,
    value: completeness,
    weighted_score: 0.30 * completeness,
    description: `${Math.round(completeness * 100)}% of required evidence categories provided (${presentCategories.length}/${requiredCategories.length})`,
  });

  // ── Factor 2: 3DS Authentication (20%) ──
  const reasonInfo = getReasonCodeInfo(dispute.reason_code);
  const isFraudCase = reasonInfo?.category === 'fraud';
  const has3DS = payment.is_3ds_authenticated;

  // 3DS is critical for fraud cases, still helpful for others
  const authValue = isFraudCase
    ? (has3DS ? 1.0 : 0.1)
    : (has3DS ? 0.7 : 0.3);

  factors.push({
    name: '3DS Authentication',
    weight: 0.20,
    value: authValue,
    weighted_score: 0.20 * authValue,
    description: isFraudCase
      ? (has3DS ? 'Strong: 3DS/OTP verified — critical for fraud disputes' : 'Weak: No 3DS authentication — difficult for fraud cases')
      : (has3DS ? '3DS verified — supports legitimacy' : 'No 3DS — neutral for non-fraud disputes'),
  });

  // ── Factor 3: Delivery Confirmation (15%) ──
  const isDeliveryCase = dispute.reason_code.includes('not_received');
  const hasShippingProof = presentCategories.includes('shipping_proof');

  const deliveryValue = isDeliveryCase
    ? (hasShippingProof ? 1.0 : 0.05)
    : (hasShippingProof ? 0.6 : 0.4);

  factors.push({
    name: 'Delivery Confirmation',
    weight: 0.15,
    value: deliveryValue,
    weighted_score: 0.15 * deliveryValue,
    description: isDeliveryCase
      ? (hasShippingProof ? 'Strong: Shipping proof available for goods-not-received claim' : 'Critical gap: No shipping proof for goods-not-received claim')
      : (hasShippingProof ? 'Shipping proof available' : 'No shipping proof — less relevant for this dispute type'),
  });

  // ── Factor 4: Response Time Remaining (10%) ──
  const totalWindow = dispute.respond_by - dispute.created_at;
  const remaining = Math.max(0, dispute.respond_by - now);
  const timeRatio = totalWindow > 0 ? Math.min(1, remaining / totalWindow) : 0;

  factors.push({
    name: 'Response Time Remaining',
    weight: 0.10,
    value: timeRatio,
    weighted_score: 0.10 * timeRatio,
    description: remaining > 0
      ? `${Math.ceil(remaining / 3600)} hours remaining (${Math.round(timeRatio * 100)}% of window)`
      : 'EXPIRED — response window has closed',
  });

  // ── Factor 5: Transaction Amount (5%) ──
  // Lower amounts historically have slightly higher win rates
  const amountINR = dispute.amount / 100; // Convert from paise
  const amountValue = amountINR <= 500 ? 0.8
    : amountINR <= 2000 ? 0.6
    : amountINR <= 10000 ? 0.4
    : 0.3;

  factors.push({
    name: 'Transaction Amount',
    weight: 0.05,
    value: amountValue,
    weighted_score: 0.05 * amountValue,
    description: `₹${amountINR.toLocaleString()} — ${amountValue >= 0.6 ? 'favorable' : 'less favorable'} amount range`,
  });

  // ── Factor 6: Customer Dispute History (10%) ──
  // In a real system, this would query historical disputes for this customer.
  // For synthetic data, we derive a signal from the payment metadata.
  let disputeHistoryValue = 0.5; // neutral default
  try {
    const meta = JSON.parse(payment.metadata);
    if (meta.prior_disputes !== undefined) {
      // More prior disputes = higher chance this is a serial disputer = better for merchant
      disputeHistoryValue = meta.prior_disputes >= 3 ? 0.8
        : meta.prior_disputes >= 1 ? 0.6
        : 0.4;
    }
  } catch {
    // Metadata parsing failed — use neutral value
  }

  factors.push({
    name: 'Customer Dispute History',
    weight: 0.10,
    value: disputeHistoryValue,
    weighted_score: 0.10 * disputeHistoryValue,
    description: disputeHistoryValue >= 0.7
      ? 'Repeat disputer — pattern supports merchant defense'
      : disputeHistoryValue >= 0.5
        ? 'Limited dispute history — neutral signal'
        : 'First-time disputer — neutral to slight disadvantage',
  });

  // ── Factor 7: Reason Code Base Rate (10%) ──
  const baseRate = reasonInfo?.base_win_rate ?? 0.3;

  factors.push({
    name: 'Reason Code Base Rate',
    weight: 0.10,
    value: baseRate,
    weighted_score: 0.10 * baseRate,
    description: `"${reasonInfo?.description ?? dispute.reason_code}" — historical base win rate: ${Math.round(baseRate * 100)}%`,
  });

  // ── Compute final score ──
  const totalWeightedScore = factors.reduce((sum, f) => sum + f.weighted_score, 0);
  const maxPossibleScore = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round((totalWeightedScore / maxPossibleScore) * 100);

  return {
    score: Math.max(0, Math.min(100, score)),
    factors,
    engine_version: ENGINE_VERSION,
    computed_at: now,
  };
}

/**
 * Classify a score into a human-readable tier.
 */
export function getScoreTier(score: number): {
  tier: 'high' | 'medium' | 'low';
  label: string;
  color: string;
} {
  if (score >= 65) return { tier: 'high', label: 'Strong Case', color: '#22c55e' };
  if (score >= 40) return { tier: 'medium', label: 'Moderate Case', color: '#f59e0b' };
  return { tier: 'low', label: 'Weak Case', color: '#ef4444' };
}
