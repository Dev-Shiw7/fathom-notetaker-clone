import { saveBotTranscript } from '@/lib/data';
import type { TranscriptTurn } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { meetingCode, meetingUrl, botName, turns, summary } = body;

    if (!meetingCode || !turns || !Array.isArray(turns)) {
      return Response.json(
        { error: 'meetingCode and turns array are required' },
        { status: 400 }
      );
    }

    // Convert bot turns to web transcript turns (add audioUrl)
    const transcriptTurns: TranscriptTurn[] = turns.map((turn: any) => ({
      id: turn.id,
      speakerId: turn.speakerId,
      startMs: turn.startMs,
      endMs: turn.endMs,
      text: turn.text,
      audioUrl: null,
    }));

    // Build transcript object
    const transcript = {
      meetingId: meetingCode,
      turns: transcriptTurns,
      language: 'en',
    };

    // Save to data layer
    const saved = await saveBotTranscript({
      meetingCode,
      meetingUrl,
      botName: botName || 'Notetaker',
      transcript,
      summary,
    });

    if (!saved) {
      return Response.json(
        { error: 'Failed to save transcript' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: 'Transcript saved successfully',
      meeting: saved,
    });
  } catch (error) {
    console.error('Error saving transcript:', error);
    return Response.json(
      { error: 'Failed to save transcript: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
