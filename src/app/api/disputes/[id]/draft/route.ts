import { NextRequest, NextResponse } from 'next/server';
import { draftResponse, markReviewed } from '@/lib/draft/drafter';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const draft = await draftResponse(id);
    return NextResponse.json(draft);
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
