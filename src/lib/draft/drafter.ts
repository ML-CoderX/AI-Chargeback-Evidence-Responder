// ============================================================
// Phase 3 — Response drafter
// ============================================================
// Assembles a structured document with sections matching
// real card-network dispute categories. Missing sections
// explicitly state what's absent and why it matters.
// ============================================================

import { getDb, queryOne, insertAuditLog, saveDb } from '@/lib/db';
import { retrieveEvidence } from '@/lib/evidence/retriever';
import { EvidenceBundle, DraftSection, ResponseDraft, ReasonCode } from '@/types';

function fmtDate(ts: number | null): string {
  if (ts === null) return 'N/A';
  return new Date(ts * 1000).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function buildAuthSection(bundle: EvidenceBundle): DraftSection {
  const a = bundle.authentication;
  if (!a) {
    return {
      title: 'Transaction Authentication Proof',
      status: 'missing',
      content: 'No authentication evidence available for this dispute.',
      missingReason: 'Authentication records (3DS, AVS, CVV) are required to prove the cardholder authorized this transaction.',
    };
  }

  const lines: string[] = [];
  if (a.three_ds_result !== null) {
    lines.push(`3D Secure result: ${a.three_ds_result.toUpperCase()}`);
  } else {
    lines.push('3D Secure: not recorded');
  }
  if (a.avs_match !== null) {
    lines.push(`AVS (Address Verification): ${a.avs_match === 1 ? 'MATCH' : 'NO MATCH'}`);
  } else {
    lines.push('AVS: not available');
  }
  if (a.cvv_match !== null) {
    lines.push(`CVV verification: ${a.cvv_match === 1 ? 'MATCH' : 'NO MATCH'}`);
  } else {
    lines.push('CVV: not available');
  }
  if (a.device_fingerprint !== null) {
    lines.push(`Device fingerprint: ${a.device_fingerprint}`);
  } else {
    lines.push('Device fingerprint: not captured');
  }

  const hasMissing = a.three_ds_result === null || a.avs_match === null || a.cvv_match === null;

  return {
    title: 'Transaction Authentication Proof',
    status: hasMissing ? 'missing' : 'present',
    content: lines.join('\n'),
    missingReason: hasMissing ? 'Some authentication fields are not on file. Partial data may weaken the defense.' : undefined,
  };
}

function buildFulfillmentSection(bundle: EvidenceBundle): DraftSection {
  const f = bundle.fulfillment;
  if (!f) {
    return {
      title: 'Fulfillment / Delivery Proof',
      status: 'missing',
      content: 'No fulfillment evidence available for this dispute.',
      missingReason: 'Delivery confirmation is required to contest a not-received or not-as-described claim. Without tracking or delivery proof, this section cannot be defended.',
    };
  }

  const lines: string[] = [];
  if (f.delivery_confirmed !== null) {
    lines.push(`Delivery confirmed: ${f.delivery_confirmed === 1 ? 'YES' : 'NO'}`);
  } else {
    lines.push('Delivery confirmation: not recorded');
  }
  if (f.tracking_id !== null) {
    lines.push(`Tracking ID: ${f.tracking_id}`);
  } else {
    lines.push('Tracking ID: not available');
  }
  if (f.delivered_at !== null) {
    lines.push(`Delivered at: ${fmtDate(f.delivered_at)}`);
  } else {
    lines.push('Delivery date: not recorded');
  }
  if (f.signature_captured !== null) {
    lines.push(`Signature on delivery: ${f.signature_captured === 1 ? 'YES' : 'NO'}`);
  } else {
    lines.push('Signature: not captured');
  }

  const hasMissing = f.delivery_confirmed === null || f.tracking_id === null;

  return {
    title: 'Fulfillment / Delivery Proof',
    status: hasMissing ? 'missing' : 'present',
    content: lines.join('\n'),
    missingReason: hasMissing
      ? 'No delivery confirmation on file — required to contest a not-received claim.'
      : undefined,
  };
}

function buildBehavioralSection(bundle: EvidenceBundle): DraftSection {
  const b = bundle.behavioral;
  if (!b) {
    return {
      title: 'Customer Engagement History',
      status: 'missing',
      content: 'No behavioral evidence available for this customer.',
      missingReason: 'Customer order history and policy acceptance records help establish the customer relationship and dispute pattern.',
    };
  }

  const lines: string[] = [];
  if (b.prior_order_count !== null) {
    lines.push(`Prior orders: ${b.prior_order_count}`);
  } else {
    lines.push('Prior order count: unknown');
  }
  if (b.prior_dispute_count !== null) {
    lines.push(`Prior disputes: ${b.prior_dispute_count}`);
  } else {
    lines.push('Prior dispute count: unknown');
  }
  if (b.account_age_days !== null) {
    lines.push(`Account age: ${b.account_age_days} days`);
  } else {
    lines.push('Account age: unknown');
  }
  if (b.policy_accepted_at !== null) {
    lines.push(`Policy accepted: ${fmtDate(b.policy_accepted_at)}`);
  } else {
    lines.push('Policy acceptance: not on record');
  }

  const hasMissing = b.prior_order_count === null || b.policy_accepted_at === null;

  return {
    title: 'Customer Engagement History',
    status: hasMissing ? 'missing' : 'present',
    content: lines.join('\n'),
    missingReason: hasMissing ? 'Incomplete customer history reduces the strength of the behavioral defense.' : undefined,
  };
}

function buildCommunicationSection(bundle: EvidenceBundle): DraftSection {
  const c = bundle.communication;
  if (!c) {
    return {
      title: 'Policy Disclosure and Acceptance',
      status: 'missing',
      content: 'No communication evidence available for this dispute.',
      missingReason: 'Without confirmation emails or support ticket records, it is harder to prove the merchant engaged with the customer pre-dispute.',
    };
  }

  const lines: string[] = [];
  if (c.support_tickets_count !== null) {
    lines.push(`Support tickets: ${c.support_tickets_count}`);
  } else {
    lines.push('Support ticket count: unknown');
  }
  if (c.last_contact_at !== null) {
    lines.push(`Last customer contact: ${fmtDate(c.last_contact_at)}`);
  } else {
    lines.push('Last contact: no record');
  }
  if (c.confirmation_email_sent !== null) {
    lines.push(`Order confirmation email: ${c.confirmation_email_sent === 1 ? 'SENT' : 'NOT SENT'}`);
  } else {
    lines.push('Confirmation email: status unknown');
  }

  const hasMissing = c.confirmation_email_sent === null;

  return {
    title: 'Policy Disclosure and Acceptance',
    status: hasMissing ? 'missing' : 'present',
    content: lines.join('\n'),
    missingReason: hasMissing ? 'Missing email confirmation weakens proof of merchant disclosure.' : undefined,
  };
}

/**
 * Build all 4 sections in card-network order.
 * Missing categories explicitly say what is absent and why it matters.
 */
function buildSections(bundle: EvidenceBundle): DraftSection[] {
  const sections: DraftSection[] = [];

  // Always include all 4 sections — if not relevant for this reason code,
  // the evidence will be null and the section will say so explicitly.
  sections.push(buildAuthSection(bundle));
  sections.push(buildFulfillmentSection(bundle));
  sections.push(buildBehavioralSection(bundle));
  sections.push(buildCommunicationSection(bundle));

  return sections;
}

function renderMarkdown(draft: ResponseDraft): string {
  const lines: string[] = [];
  lines.push(`# Chargeback Response — ${draft.disputeId}`);
  lines.push(`Reason code: ${draft.reasonCode.replace(/_/g, ' ')}`);
  lines.push('');

  for (const s of draft.sections) {
    lines.push(`## ${s.title}`);
    if (s.status === 'missing' && s.missingReason) {
      lines.push(`> ⚠ ${s.missingReason}`);
      lines.push('');
    }
    lines.push(s.content);
    lines.push('');
  }

  lines.push('---');
  lines.push('*This tool does not submit to the network. Copy this draft into your dispute portal after review.*');

  return lines.join('\n');
}

export async function draftResponse(disputeId: string): Promise<ResponseDraft> {
  const bundle = await retrieveEvidence(disputeId);
  const sections = buildSections(bundle);
  const draft: ResponseDraft = {
    disputeId,
    reasonCode: bundle.reasonCode,
    sections,
    markdownText: '',
    reviewedAt: null,
  };
  draft.markdownText = renderMarkdown(draft);

  // Audit log
  const db = await getDb();
  insertAuditLog(db, {
    dispute_id: disputeId,
    action: 'draft_generated',
    actor: 'system',
    payload_json: JSON.stringify({
      section_count: sections.length,
      missing_count: sections.filter(s => s.status === 'missing').length,
    }),
    timestamp: Math.floor(Date.now() / 1000),
  });
  saveDb();

  return draft;
}

export async function markReviewed(disputeId: string, reviewerName: string): Promise<void> {
  const db = await getDb();
  db.run(`UPDATE disputes SET status = 'under_review' WHERE id = ? AND status = 'open'`, [disputeId]);
  insertAuditLog(db, {
    dispute_id: disputeId,
    action: 'marked_reviewed',
    actor: reviewerName,
    payload_json: JSON.stringify({ action: 'mark_reviewed' }),
    timestamp: Math.floor(Date.now() / 1000),
  });
  saveDb();
}
