/**
 * Streams a recording's audio with Range support, which is what lets the
 * player seek without downloading the whole file first.
 */
import { AudioUnavailableError, openAudio } from '@/lib/audio';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const audio = await openAudio(id);
    if (!audio) return new Response('No audio for this meeting.', { status: 404 });

    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
    let start = 0;
    let end = audio.length - 1;
    if (range) {
      if (range[1] !== '') start = Number(range[1]);
      if (range[2] !== '') end = Math.min(Number(range[2]), audio.length - 1);
      if (range[1] === '' && range[2] !== '') {
        start = Math.max(0, audio.length - Number(range[2]));
        end = audio.length - 1;
      }
      if (start > end || start >= audio.length) {
        return new Response(null, { status: 416, headers: { 'content-range': `bytes */${audio.length}` } });
      }
    }

    const headers: Record<string, string> = {
      'content-type': audio.contentType,
      'accept-ranges': 'bytes',
      'content-length': String(end - start + 1),
      'cache-control': 'public, max-age=3600',
    };
    if (range) headers['content-range'] = `bytes ${start}-${end}/${audio.length}`;
    return new Response(audio.read(start, end), { status: range ? 206 : 200, headers });
  } catch (err) {
    const status = err instanceof AudioUnavailableError ? 503 : 500;
    return new Response((err as Error).message, { status });
  }
}
