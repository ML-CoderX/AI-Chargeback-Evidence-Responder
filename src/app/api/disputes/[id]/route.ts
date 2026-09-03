import { NextRequest, NextResponse } from 'next/server';
import { getDb, queryOne, queryAll } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();

  const dispute = queryOne(db, `
    SELECT d.*, o.customer_id, o.payment_id, o.placed_at AS order_placed_at,
           o.billing_address, o.shipping_address, o.amount AS order_amount
    FROM disputes d JOIN orders o ON d.order_id = o.id
    WHERE d.id = ?
  `, [id]);

  if (!dispute) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const evidence = {
    authentication: queryOne(db, `SELECT * FROM evidence_authentication WHERE order_id = ?`, [dispute.order_id as string]),
    fulfillment: queryOne(db, `SELECT * FROM evidence_fulfillment WHERE order_id = ?`, [dispute.order_id as string]),
    behavioral: queryOne(db, `SELECT * FROM evidence_behavioral WHERE customer_id = ?`, [dispute.customer_id as string]),
    communication: queryOne(db, `SELECT * FROM evidence_communication WHERE order_id = ?`, [dispute.order_id as string]),
  };

  const scores = queryAll(db, `
    SELECT * FROM scores
    WHERE dispute_id = ?
    ORDER BY scored_at DESC, CASE model_version WHEN 'trained_v1' THEN 0 ELSE 1 END
  `, [id]);
  const auditLog = queryAll(db, `SELECT * FROM audit_log WHERE dispute_id = ? ORDER BY timestamp DESC`, [id]);

  return NextResponse.json({ dispute, evidence, scores, auditLog });
}
