import { NextRequest, NextResponse } from 'next/server';
import { draftResponse, markReviewed } from '@/lib/draft/drafter';
import { generateLLMDraft } from '@/lib/draft/llm-drafter';
import { retrieveEvidence } from '@/lib/evidence/retriever';
import { getDb, queryOne } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try LLM draft first
    const db = await getDb();
    const dispute = queryOne(db, `SELECT * FROM disputes WHERE id = ?`, [id]);
    if (dispute) {
      const bundle = await retrieveEvidence(id);
      const llmResult = await generateLLMDraft(
        bundle,
        dispute.reason_code as string as import('@/types').ReasonCode,
        id
      );

      if (llmResult.usedLLM && llmResult.sections.length > 0) {
        return NextResponse.json({
          disputeId: id,
          reasonCode: bundle.reasonCode,
          sections: llmResult.sections,
          markdownText: llmResult.markdownText,
          reviewedAt: null,
          source: 'gemini',
        });
      }
    }

    // Fallback to template-based draft
    const draft = await draftResponse(id);
    return NextResponse.json({ ...draft, source: 'template' });
  } catch (error) {
    console.error('Draft error:', error);
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  if (body.action === 'mark_reviewed') {
    await markReviewed(id, body.reviewer ?? 'analyst');
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
