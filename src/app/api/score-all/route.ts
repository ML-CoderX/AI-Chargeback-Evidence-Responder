import { NextResponse } from 'next/server';
import { getDb, queryAll } from '@/lib/db';
import { retrieveEvidence } from '@/lib/evidence/retriever';
import { scoreDispute } from '@/lib/scoring/engine';
import { ReasonCode } from '@/types';

export async function POST() {
  try {
    const db = await getDb();
    const disputes = queryAll(db, `SELECT * FROM disputes ORDER BY id`);

    const results: Record<string, unknown>[] = [];
    for (const d of disputes) {
      const bundle = await retrieveEvidence(d.id as string);
      const result = await scoreDispute(bundle, {
        reason_code: d.reason_code as ReasonCode,
        amount: d.amount as number,
      });
      results.push({
        dispute_id: d.id,
        reason_code: d.reason_code,
        completeness_score: Math.round(result.completeness.score * 100) / 100,
        win_probability: Math.round(result.winProb.probability * 100) / 100,
        missing_categories: result.completeness.missing,
        is_holdout: d.is_holdout,
        actual_outcome: d.actual_outcome,
      });
    }

    return NextResponse.json({ scored: results.length, results });
  } catch (error) {
    console.error('Score-all error:', error);
    return NextResponse.json({ error: 'Failed to score all' }, { status: 500 });
  }
}
