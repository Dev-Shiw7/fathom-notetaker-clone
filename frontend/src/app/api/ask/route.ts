/** Question answering over the stored transcripts. See lib/ask.ts. */
import { askQuestion } from '@/lib/ask';
import { GroqError, groqConfigured } from '@/lib/groq';
import { DEMO_MEETING_IDS } from '@/lib/demo';

export async function POST(request: Request) {
  if (!groqConfigured()) {
    return Response.json({ error: 'Ask needs GROQ_API_KEY on the server.' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const question = String(body.question ?? '').trim();
    if (question.length < 3 || question.length > 500) {
      return Response.json({ error: 'Ask a question between 3 and 500 characters.' }, { status: 400 });
    }
    const meetingId = typeof body.meetingId === 'string' && body.meetingId ? body.meetingId : undefined;
    // The landing page's Ask sends `demo: true` and is limited to the sample calls.
    const scope = body.demo === true ? { meetingIds: DEMO_MEETING_IDS } : { meetingId };
    return Response.json(await askQuestion(question, scope));
  } catch (err) {
    const status = err instanceof GroqError ? 502 : 500;
    return Response.json({ error: (err as Error).message }, { status });
  }
}
