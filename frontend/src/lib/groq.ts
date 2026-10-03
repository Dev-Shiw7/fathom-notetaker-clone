/**
 * Groq client: speech-to-text and chat completions over plain fetch.
 *
 * Groq's API is OpenAI-compatible, so there is no SDK dependency to carry. The
 * two things worth handling properly are rate limits (the free tier is tight,
 * and a long meeting makes many calls) and JSON mode, which the summariser
 * leans on for structured output.
 */
const BASE = 'https://api.groq.com/openai/v1';

export const STT_MODEL = process.env.GROQ_STT_MODEL ?? 'whisper-large-v3-turbo';
export const LLM_MODEL = process.env.GROQ_LLM_MODEL ?? 'openai/gpt-oss-120b';

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

export const groqConfigured = () => Boolean(process.env.GROQ_API_KEY);

function key(): string {
  const value = process.env.GROQ_API_KEY;
  if (!value) throw new GroqError('GROQ_API_KEY is not set.', 503);
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POSTs with retry on 429. Groq returns `retry-after` in seconds; honouring it
 * is the difference between a long meeting finishing and half its summaries
 * failing on the free tier.
 */
async function post(path: string, init: () => RequestInit, attempts = 5): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`${BASE}${path}`, {
      ...init(),
      headers: { ...(init().headers ?? {}), authorization: `Bearer ${key()}` },
    });
    if (response.status !== 429 && response.status < 500) return response;
    last = response;
    const wait = Number(response.headers.get('retry-after')) || 2 ** attempt * 2;
    await sleep(Math.min(wait, 60) * 1000);
  }
  return last!;
}

async function fail(response: Response, what: string): Promise<never> {
  const text = await response.text().catch(() => '');
  throw new GroqError(`${what} failed (${response.status}): ${text.slice(0, 300)}`, response.status);
}

export interface SttSegment {
  start: number;
  end: number;
  text: string;
  noSpeechProb: number;
  avgLogprob: number;
}

/** Transcribes one audio file into timestamped segments. */
export async function transcribe(audio: Buffer, filename: string, mime: string): Promise<SttSegment[]> {
  const response = await post('/audio/transcriptions', () => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), filename);
    form.append('model', STT_MODEL);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('temperature', '0');
    return { method: 'POST', body: form };
  });
  if (!response.ok) await fail(response, 'Transcription');

  const body = (await response.json()) as {
    segments?: Array<{ start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number }>;
  };
  return (body.segments ?? []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
    noSpeechProb: s.no_speech_prob ?? 0,
    avgLogprob: s.avg_logprob ?? 0,
  }));
}

/** A chat completion constrained to a JSON object, parsed for the caller. */
export async function chatJson<T>(system: string, user: string, maxTokens = 2000): Promise<T> {
  const response = await post('/chat/completions', () => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.2,
      // Reasoning models spend completion tokens thinking before they answer,
      // so the budget has to cover both; "low" effort keeps that small.
      max_completion_tokens: maxTokens + 2000,
      ...(LLM_MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  }));
  if (!response.ok) await fail(response, 'Completion');

  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content ?? '';
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new GroqError(`Model returned invalid JSON: ${content.slice(0, 200)}`, 502);
  }
}
