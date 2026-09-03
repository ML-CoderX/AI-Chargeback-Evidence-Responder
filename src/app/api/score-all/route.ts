import { NextResponse } from 'next/server';
import { getDb, queryAll } from '@/lib/db';
import { retrieveEvidence } from '@/lib/evidence/retriever';
import { scoreDispute } from '@/lib/scoring/engine';
import { scoreDisputeTrained, clearModelCache } from '@/lib/scoring/classifier';
import { ReasonCode } from '@/types';

export async function POST() {
  try {
    const db = await getDb();
    const disputes = queryAll(db, `SELECT * FROM disputes ORDER BY id`);

    // Clear cached model so it retrains on current data
    clearModelCache();

    const results: Record<string, unknown>[] = [];
    for (const d of disputes) {
      const bundle = await retrieveEvidence(d.id as string);
      const meta = { reason_code: d.reason_code as ReasonCode, amount: d.amount as number };

      // Score with BOTH models — baseline rule + trained classifier
      const baseline = await scoreDispute(bundle, meta, 'baseline_rule');
      const trained = await scoreDisputeTrained(bundle, meta);

      results.push({
        dispute_id: d.id,
        reason_code: d.reason_code,
        baseline_probability: Math.round(baseline.winProb.probability * 100) / 100,
        trained_probability: Math.round(trained.winProb.probability * 100) / 100,
        completeness_score: Math.round(baseline.completeness.score * 100) / 100,
        missing_categories: baseline.completeness.missing,
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
