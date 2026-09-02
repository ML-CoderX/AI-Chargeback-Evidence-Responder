import { NextResponse } from 'next/server';
import { evaluateHoldout, findFailureCase } from '@/lib/scoring/evaluator';

export async function GET() {
  try {
    const metrics = await evaluateHoldout();
    const failureCase = await findFailureCase();
    return NextResponse.json({ metrics, failureCase });
  } catch (error) {
    console.error('Metrics error:', error);
    return NextResponse.json({ error: 'Failed to compute metrics' }, { status: 500 });
  }
}
