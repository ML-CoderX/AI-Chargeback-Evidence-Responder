import { NextRequest, NextResponse } from 'next/server';
import { getDb, queryAll } from '@/lib/db';

export async function GET(req: NextRequest) {
  const db = await getDb();
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const reason = url.searchParams.get('reason_code');
  const holdout = url.searchParams.get('holdout');
  const sort = url.searchParams.get('sort') ?? 'filed_at';
  const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

  let where = 'WHERE 1=1';
  const params: (string | number | null)[] = [];
  if (status) { where += ' AND d.status = ?'; params.push(status); }
  if (reason) { where += ' AND d.reason_code = ?'; params.push(reason); }
  if (holdout !== null && holdout !== '') { where += ' AND d.is_holdout = ?'; params.push(Number(holdout)); }

  const validSorts: Record<string, string> = {
    filed_at: 'd.filed_at',
    amount: 'd.amount',
    win_probability: 'latest_score.win_probability',
    completeness_score: 'latest_score.completeness_score',
  };
  const sortCol = validSorts[sort] ?? 'd.filed_at';

  const rows = queryAll(db, `
    SELECT d.*,
           o.customer_id, o.billing_address, o.shipping_address,
           latest_score.win_probability,
           latest_score.completeness_score,
           latest_score.missing_categories
    FROM disputes d
    JOIN orders o ON d.order_id = o.id
    LEFT JOIN (
      SELECT s1.* FROM scores s1
      INNER JOIN (SELECT dispute_id, MAX(scored_at) AS max_at FROM scores GROUP BY dispute_id) s2
      ON s1.dispute_id = s2.dispute_id AND s1.scored_at = s2.max_at
    ) latest_score ON latest_score.dispute_id = d.id
    ${where}
    ORDER BY ${sortCol} ${order}
  `, params);

  return NextResponse.json({ data: rows, total: rows.length });
}
