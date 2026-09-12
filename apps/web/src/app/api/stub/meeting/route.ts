import { NextResponse } from 'next/server';
import { createMeeting } from '@/lib/data';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const meeting = body.meeting;
    const transcript = body.transcript;
    const summaries = body.summaries ?? [];

    if (!meeting || !meeting.id) {
      return NextResponse.json({ error: 'missing meeting' }, { status: 400 });
    }

    await createMeeting({ meeting, transcript, summaries });

    return NextResponse.json({ ok: true, meetingId: meeting.id });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
