/**
 * Receives recording audio from the bot in small pieces, as the call happens.
 * Runner-only: this writes to the database.
 */
import { AudioUnavailableError, saveChunk } from '@/lib/audio';
import { isAuthorisedRunner } from '@/lib/jobs';

export async function POST(request: Request) {
  if (!isAuthorisedRunner(request)) {
    return Response.json({ error: 'Unauthorised runner.' }, { status: 401 });
  }
  const url = new URL(request.url);
  const session = url.searchParams.get('session') ?? '';
  const seq = Number(url.searchParams.get('seq'));
  if (!/^[\w-]{6,80}$/.test(session) || !Number.isInteger(seq) || seq < 0) {
    return Response.json({ error: 'session and seq are required.' }, { status: 400 });
  }

  try {
    const data = Buffer.from(await request.arrayBuffer());
    if (data.length === 0) return Response.json({ error: 'Empty chunk.' }, { status: 400 });
    await saveChunk(session, seq, data);
    return Response.json({ ok: true, bytes: data.length });
  } catch (err) {
    const status = err instanceof AudioUnavailableError ? 503 : 500;
    return Response.json({ error: (err as Error).message }, { status });
  }
}
