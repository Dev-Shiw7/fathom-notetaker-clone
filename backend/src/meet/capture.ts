/**
 * Real audio capture from inside a Meet call.
 *
 * Two independent signals are collected while the bot sits in the call:
 *
 *  1. Audio. A script injected before Meet loads wraps RTCPeerConnection and
 *     routes every incoming audio track into one mixed MediaStream, which a
 *     MediaRecorder encodes in timed slices. Only *remote* audio is tapped, so
 *     the bot never records itself. Slices are shipped to the app as they are
 *     produced, which means a crash mid-call costs seconds, not the meeting.
 *
 *  2. Speaker identity. Whisper (run server-side) returns text without
 *     speakers, so the bot turns on Meet's captions and samples whose name
 *     they currently show. The caption text is ignored; only "who is talking
 *     now" is used, aligned to the recording clock.
 *
 * Both depend on Meet's page internals. The audio path uses a standard web
 * API and is stable; the speaker path reads the captions region by its
 * accessible name and is the part to check first when Meet changes.
 */
import type { Page } from 'playwright-core';
import type { SessionLogger } from '../logging/events.js';

export interface SpeakerSample {
  t: number;
  name: string | null;
}

export interface CaptureResult {
  durationMs: number;
  mime: string;
  samples: SpeakerSample[];
  chunksUploaded: number;
  chunksFailed: number;
}

interface CaptureOptions {
  apiUrl: string;
  token: string | undefined;
  sessionId: string;
  log: SessionLogger;
}

const SLICE_MS = 20_000;
const SAMPLE_MS = 500;

/**
 * Runs in the page before any Meet script, so the wrap sees every connection.
 *
 * Kept as a plain JavaScript string rather than a function: TypeScript tooling
 * rewrites function bodies with helper calls that do not exist in the page, and
 * a hook that silently fails to install would look exactly like a quiet call.
 */
const PAGE_HOOK = (sliceMs: number) => `(() => {
  if (window.__recall) return;
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const tapped = new Set();

  const tap = (track) => {
    if (track.kind !== 'audio' || tapped.has(track.id)) return;
    tapped.add(track.id);
    try { ctx.createMediaStreamSource(new MediaStream([track])).connect(dest); } catch (e) {}
  };

  const Original = window.RTCPeerConnection;
  const Wrapped = function (...args) {
    const pc = new Original(...args);
    pc.addEventListener('track', (event) => tap(event.track));
    return pc;
  };
  Wrapped.prototype = Original.prototype;
  Object.setPrototypeOf(Wrapped, Original);
  window.RTCPeerConnection = Wrapped;
  window.webkitRTCPeerConnection = Wrapped;

  let recorder = null, seq = 0, pending = 0, stopped = null;

  window.__recall = {
    start() {
      ctx.resume();
      const mime = ['audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      recorder = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 32000 });
      recorder.ondataavailable = async (event) => {
        if (!event.data.size) return;
        const n = seq++;
        pending += 1;
        try {
          const bytes = new Uint8Array(await event.data.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          await window.__recallChunk(n, btoa(binary));
        } finally {
          pending -= 1;
          if (pending === 0 && recorder.state === 'inactive' && stopped) stopped();
        }
      };
      recorder.start(${sliceMs});
      return mime || 'audio/webm';
    },
    stop() {
      return new Promise((resolve) => {
        if (!recorder || recorder.state === 'inactive') return resolve();
        stopped = resolve;
        recorder.stop();
        setTimeout(resolve, 15000);
      });
    },
    tracks: () => tapped.size,
  };
})();`;

/** Reads the speaker name Meet's captions currently show, or null. */
function readSpeaker(): string | null {
  const region = document.querySelector('[role="region"][aria-label*="aption" i]');
  if (!region) return null;
  const avatars = region.querySelectorAll('img');
  const last = avatars[avatars.length - 1];
  if (!last) return null;
  const label = (last.parentElement?.textContent ?? '').trim();
  const name = label.split('\n')[0]?.trim() ?? '';
  return name && name.length < 80 ? name : null;
}

export class AudioCapture {
  private startedAt = 0;
  private samples: SpeakerSample[] = [];
  private timer: NodeJS.Timeout | null = null;
  private mime = 'audio/webm';
  private uploads: Promise<void> = Promise.resolve();
  private uploaded = 0;
  private failed = 0;

  private constructor(
    private readonly page: Page,
    private readonly options: CaptureOptions,
  ) {}

  /** Must run before navigation: the hook has to exist before Meet creates its connections. */
  static async install(page: Page, options: CaptureOptions): Promise<AudioCapture> {
    const capture = new AudioCapture(page, options);
    await page.exposeFunction('__recallChunk', (seq: number, b64: string) => capture.enqueue(seq, b64));
    await page.addInitScript({ content: PAGE_HOOK(SLICE_MS) });
    return capture;
  }

  private enqueue(seq: number, b64: string): Promise<void> {
    const body = Buffer.from(b64, 'base64');
    const url = `${this.options.apiUrl}/api/bot/audio?session=${encodeURIComponent(this.options.sessionId)}&seq=${seq}`;
    // Serialised so slices arrive in order, with retries so one blip is not a gap.
    const task = this.uploads.then(async () => {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/octet-stream',
              ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
            },
            body,
          });
          if (response.ok) {
            this.uploaded += 1;
            return;
          }
          if (response.status === 401 || response.status === 400) break;
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
      this.failed += 1;
      this.options.log.emit('warn', {
        message: `Audio slice ${seq} could not be uploaded`,
        detail: 'The recording will have a gap here',
      });
    });
    this.uploads = task;
    return task;
  }

  async start(): Promise<void> {
    await this.ensureCaptions();
    this.mime = await this.page.evaluate(() => (window as any).__recall.start() as string);
    this.startedAt = Date.now();
    const tracks = await this.page.evaluate(() => (window as any).__recall.tracks() as number);
    this.options.log.emit('recording.started', {
      method: 'webrtc-audio',
      reason: `mime=${this.mime} remoteAudioTracks=${tracks}`,
    });

    this.timer = setInterval(() => {
      if (this.page.isClosed()) return;
      this.page
        .evaluate(readSpeaker)
        .then((name) => this.samples.push({ t: Date.now() - this.startedAt, name }))
        .catch(() => {});
    }, SAMPLE_MS);
  }

  /** Turns captions on once, by their accessible name, falling back to Meet's `c` shortcut. */
  private async ensureCaptions(): Promise<void> {
    try {
      const on = await this.page.locator('[role="region"][aria-label*="aption" i]').count();
      if (on > 0) return;
      const button = this.page.getByRole('button', { name: /turn on captions/i }).first();
      if (await button.isVisible({ timeout: 1500 }).catch(() => false)) {
        await button.click();
      } else {
        await this.page.keyboard.press('c');
      }
      await this.page.waitForTimeout(1500);
    } catch (err) {
      this.options.log.emit('warn', {
        message: 'Could not turn on captions; speakers will be unlabelled',
        detail: (err as Error).message,
      });
    }
  }

  async stop(): Promise<CaptureResult> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.page.isClosed()) {
      await this.page.evaluate(() => (window as any).__recall?.stop()).catch(() => {});
    }
    await this.uploads;

    const named = new Set(this.samples.map((s) => s.name).filter(Boolean));
    if (named.size === 0) {
      this.options.log.emit('selector.miss', {
        key: 'captions.speakerName',
        candidates: ['[role=region][aria-label*=aption] img'],
        snapshotPath: null,
        screenshotPath: null,
      });
    }
    this.options.log.emit('recording.completed', { durationMs: Date.now() - this.startedAt });
    return {
      durationMs: Date.now() - this.startedAt,
      mime: this.mime,
      samples: this.samples,
      chunksUploaded: this.uploaded,
      chunksFailed: this.failed,
    };
  }
}
