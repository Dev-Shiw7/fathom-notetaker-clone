import { NextResponse } from 'next/server';
import { getMeeting, getTranscript, getAnalytics } from '@/lib/data';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

    const meeting = await getMeeting(id);
    if (!meeting) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const transcript = await getTranscript(id);
    const analytics = await getAnalytics(id);

    return NextResponse.json({ meeting, transcript, analytics });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
