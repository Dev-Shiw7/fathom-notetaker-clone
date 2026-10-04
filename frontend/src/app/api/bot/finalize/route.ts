/**
 * The bot calls this once the call is over. It transcribes the uploaded audio,
 * writes the summaries and files the meeting, then hands back what the bot
 * needs to post a summary into the chat. Runner-only.
 *
 * This is deliberately one long request: the bot has to wait for the result
 * anyway (it posts the summary from inside the call), and the server has no
 * function-timeout ceiling on a Node host.
 */
import { isAuthorisedRunner } from '@/lib/jobs';
import { PipelineError, finalizeRecording, type CaptionLine, type SpeakerSample } from '@/lib/pipeline';
import { GroqError, groqConfigured } from '@/lib/groq';
import { AudioUnavailableError } from '@/lib/audio';

export const maxDuration = 600;

export async function POST(request: Request) {
  if (!isAuthorisedRunner(request)) {
    return Response.json({ error: 'Unauthorised runner.' }, { status: 401 });
  }
  if (!groqConfigured()) {
    return Response.json({ error: 'GROQ_API_KEY is not set on the server.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const sessionId = String(body.sessionId ?? '');
    const meetingCode = String(body.meetingCode ?? '').trim();
    if (!sessionId || !meetingCode) {
      return Response.json({ error: 'sessionId and meetingCode are required.' }, { status: 400 });
    }

    const samples: SpeakerSample[] = Array.isArray(body.samples)
      ? body.samples
          .filter((s: { t?: unknown }) => Number.isFinite(Number(s?.t)))
          .map((s: { t: number; name?: string | null }) => ({
            t: Number(s.t),
            name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : null,
          }))
      : [];

    const captions: CaptionLine[] = Array.isArray(body.captions)
      ? body.captions
          .filter((c: { t?: unknown; name?: unknown; text?: unknown }) =>
            Number.isFinite(Number(c?.t)) && typeof c?.name === 'string' && typeof c?.text === 'string' && c.text.trim(),
          )
          .map((c: { t: number; name: string; text: string }) => ({
            t: Number(c.t),
            name: c.name.trim(),
            text: c.text.trim(),
          }))
      : [];

    const { meeting, summaries, failedTemplates } = await finalizeRecording({
      sessionId,
      meetingCode,
      title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null,
      startedAt: typeof body.startedAt === 'string' ? body.startedAt : new Date().toISOString(),
      durationMs: Number(body.durationMs) || 0,
      mime: typeof body.mime === 'string' ? body.mime : 'audio/webm',
      samples,
      captions,
      audioSilent: body.audioSilent === true,
    });

    const general = summaries.find((s) => s.templateId === 'general') ?? summaries[0];
    const nameOf = new Map(meeting.participants.map((p) => [p.id, p.name]));
    return Response.json({
      success: true,
      meeting: { id: meeting.id, title: meeting.title },
      failedTemplates,
      summary: general
        ? {
            text: general.tldr,
            keyPoints: general.keyPoints.map((k) => k.text),
            actionItems: general.actionItems.map((a) => ({
              task: a.text,
              owner: a.ownerId ? nameOf.get(a.ownerId) : undefined,
              dueDate: a.dueDate ?? undefined,
            })),
          }
        : null,
    });
  } catch (err) {
    if (err instanceof PipelineError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof GroqError || err instanceof AudioUnavailableError) {
      return Response.json({ error: err.message }, { status: err instanceof GroqError ? 502 : 503 });
    }
    console.error('[finalize]', err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
