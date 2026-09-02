import { NextRequest, NextResponse } from 'next/server';
import { getDb, queryAll } from '@/lib/db';

export async function GET(req: NextRequest) {
  const db = await getDb();
  const url = new URL(req.url);
  const disputeId = url.searchParams.get('dispute_id');
  const action = url.searchParams.get('action');
  const limit = Number(url.searchParams.get('limit') ?? 200);

  let where = 'WHERE 1=1';
  const params: (string | number | null)[] = [];
  if (disputeId) { where += ' AND dispute_id = ?'; params.push(disputeId); }
  if (action) { where += ' AND action = ?'; params.push(action); }

  const rows = queryAll(db, `
    SELECT * FROM audit_log ${where}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `, params);

  return NextResponse.json({ data: rows, total: rows.length });
}
