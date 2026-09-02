import { NextRequest, NextResponse } from 'next/server';
import { getDb, queryOne } from '@/lib/db';
import { retrieveEvidence } from '@/lib/evidence/retriever';
import { scoreDispute } from '@/lib/scoring/engine';
import { ReasonCode } from '@/types';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();
  const dispute = queryOne(db, `SELECT * FROM disputes WHERE id = ?`, [id]);
  if (!dispute) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const bundle = await retrieveEvidence(id);
  const result = await scoreDispute(bundle, {
    reason_code: dispute.reason_code as ReasonCode,
    amount: dispute.amount as number,
  });

  return NextResponse.json({
    disputeId: id,
    completeness: result.completeness,
    winProbability: result.winProb,
  });
}
