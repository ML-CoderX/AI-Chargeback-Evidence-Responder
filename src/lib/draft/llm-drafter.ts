// ============================================================
// Stage 4 — LLM-drafted response narrative (Gemini API)
// ============================================================
// Calls Gemini server-side, passing the full evidence bundle as
// structured JSON. The LLM generates the persuasive narrative;
// the deterministic JSON structure stays the source of truth for
// evidence flags in the UI.
//
// Falls back to the existing templated draft if the API fails.
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import { EvidenceBundle, DraftSection, ReasonCode, EvidenceCategory } from '@/types';
import { getDb, insertAuditLog, saveDb } from '@/lib/db';

const MODEL_NAME = 'gemini-2.0-flash';

function getGeminiClient(): GoogleGenerativeAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'REPLACE_ME') return null;
  return new GoogleGenerativeAI(apiKey);
}

const SYSTEM_PROMPT = `You are a chargeback dispute evidence analyst. Write a persuasive, professional dispute response narrative for a merchant defending against a chargeback.

STRICT RULES:
1. Use ONLY the evidence provided in the JSON input. Never state a fact not present in the input.
2. If an evidence category or field is null/missing, you MUST explicitly state it is missing in the narrative — do NOT omit it or work around it. Say exactly what is missing and that it weakens this area of the defense.
3. Organize the narrative into exactly 4 sections: Transaction Authentication, Fulfillment / Delivery, Customer Engagement, Policy Disclosure.
4. For each section, if evidence is present, write a persuasive paragraph citing the specific data points. If partially present, cite what exists and note what is absent.
5. Write in third person, as if the merchant's representative is presenting to a card network's dispute review team.
6. Be concise but thorough. Each section should be 2-4 sentences.
7. End with a brief conclusion summarizing the overall strength of the defense.`;

export async function generateLLMDraft(
  bundle: EvidenceBundle,
  reasonCode: ReasonCode,
  disputeId: string,
): Promise<{ sections: DraftSection[]; markdownText: string; usedLLM: boolean }> {
  const client = getGeminiClient();

  if (!client) {
    return { sections: [], markdownText: '', usedLLM: false };
  }

  // Build the evidence input for the LLM
  const evidenceInput = {
    dispute_id: disputeId,
    reason_code: reasonCode.replace(/_/g, ' '),
    authentication: bundle.authentication
      ? {
          avs_match: bundle.authentication.avs_match,
          cvv_match: bundle.authentication.cvv_match,
          three_ds_result: bundle.authentication.three_ds_result,
          device_fingerprint: bundle.authentication.device_fingerprint ? 'present' : null,
        }
      : 'NO DATA — entire authentication category is missing',
    fulfillment: bundle.fulfillment
      ? {
          delivery_confirmed: bundle.fulfillment.delivery_confirmed,
          tracking_id: bundle.fulfillment.tracking_id,
          delivered_at: bundle.fulfillment.delivered_at
            ? new Date(bundle.fulfillment.delivered_at * 1000).toISOString().split('T')[0]
            : null,
          signature_captured: bundle.fulfillment.signature_captured,
        }
      : 'NO DATA — entire fulfillment category is missing',
    behavioral: bundle.behavioral
      ? {
          prior_order_count: bundle.behavioral.prior_order_count,
          prior_dispute_count: bundle.behavioral.prior_dispute_count,
          policy_accepted_at: bundle.behavioral.policy_accepted_at
            ? new Date(bundle.behavioral.policy_accepted_at * 1000).toISOString().split('T')[0]
            : null,
          account_age_days: bundle.behavioral.account_age_days,
        }
      : 'NO DATA — entire behavioral category is missing',
    communication: bundle.communication
      ? {
          support_tickets_count: bundle.communication.support_tickets_count,
          last_contact_at: bundle.communication.last_contact_at
            ? new Date(bundle.communication.last_contact_at * 1000).toISOString().split('T')[0]
            : null,
          confirmation_email_sent: bundle.communication.confirmation_email_sent,
        }
      : 'NO DATA — entire communication category is missing',
  };

  try {
    const model = client.getGenerativeModel({ model: MODEL_NAME });
    const promptBody = `Evidence bundle (JSON):\n${JSON.stringify(evidenceInput, null, 2)}\n\nWrite the dispute response narrative now.`;
    const promptHash = crypto
      .createHash('sha256')
      .update(`${SYSTEM_PROMPT}\n\n${promptBody}`)
      .digest('hex');

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            { text: `\n\n${promptBody}` },
          ],
        },
      ],
    });

    const responseText = result.response.text();

    // Parse into sections (the LLM writes markdown with ## headers)
    const sections = parseLLMResponse(responseText, bundle);
    const markdownText = responseText;

    // Log to audit
    const db = await getDb();
    insertAuditLog(db, {
      dispute_id: disputeId,
      action: 'draft_generated',
      actor: 'system',
      payload_json: JSON.stringify({
        model: MODEL_NAME,
        source: 'gemini_api',
        prompt_hash: promptHash,
        prompt_evidence_keys: Object.keys(evidenceInput),
        response_length: responseText.length,
      }),
      timestamp: Math.floor(Date.now() / 1000),
    });
    saveDb();

    return { sections, markdownText, usedLLM: true };
  } catch (error) {
    console.error('Gemini API error:', error);
    return { sections: [], markdownText: '', usedLLM: false };
  }
}

/** Parse LLM response into DraftSection[] by detecting section headers */
function parseLLMResponse(text: string, bundle: EvidenceBundle): DraftSection[] {
  const sectionDefs = [
    { pattern: /transaction\s*authentication/i, title: 'Transaction Authentication Proof', evidenceKey: 'authentication' as const },
    { pattern: /fulfillment|delivery/i, title: 'Fulfillment / Delivery Proof', evidenceKey: 'fulfillment' as const },
    { pattern: /customer\s*engagement|behavioral/i, title: 'Customer Engagement History', evidenceKey: 'behavioral' as const },
    { pattern: /policy\s*disclosure|communication/i, title: 'Policy Disclosure', evidenceKey: 'communication' as const },
  ];

  // Split text by markdown headers or section markers
  const lines = text.split('\n');
  const segments: { title: string; content: string[]; evidenceKey: EvidenceCategory }[] = [];
  let current: { title: string; content: string[]; evidenceKey: EvidenceCategory } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^#+\s*(.+)/);
    if (headerMatch) {
      const headerText = headerMatch[1];
      const def = sectionDefs.find(d => d.pattern.test(headerText));
      if (def) {
        if (current) segments.push(current);
        current = { title: def.title, content: [], evidenceKey: def.evidenceKey };
        continue;
      }
    }
    if (current) {
      current.content.push(line);
    }
  }
  if (current) segments.push(current);

  // If LLM didn't use headers, treat as a single block
  if (segments.length === 0) {
    return [{
      title: 'Response Narrative',
      status: 'present',
      content: text,
    }];
  }

  return segments.map(seg => {
    const data = bundle[seg.evidenceKey];
    const hasData = data !== null && data !== undefined;
    // Check if section has any non-null fields
    let hasSomePresent = false;
    if (hasData && typeof data === 'object') {
      hasSomePresent = Object.entries(data as unknown as Record<string, unknown>)
        .filter(([k]) => k !== 'order_id' && k !== 'customer_id')
        .some(([, v]) => v !== null && v !== undefined);
    }

    return {
      title: seg.title,
      status: hasSomePresent ? 'present' as const : 'missing' as const,
      content: seg.content.join('\n').trim(),
      missingReason: !hasSomePresent ? `Missing evidence in ${seg.title.toLowerCase()} weakens this area of the defense.` : undefined,
    };
  });
}
