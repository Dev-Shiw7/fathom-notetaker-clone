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

/** One stretch of speech as Meet's own captions showed it. */
export interface CaptionLine {
  /** Milliseconds from the start of the recording. */
  t: number;
  /** When this block was last seen changing; used to merge revisions, not sent on. */
  lastT: number;
  name: string;
  text: string;
}

export interface CaptureResult {
  durationMs: number;
  mime: string;
  samples: SpeakerSample[];
  /** What Meet's captions said: a transcript that does not depend on our audio. */
  captions: CaptionLine[];
  /** Loudest sample seen in the recorded mix (0..1); null if it could not be read. */
  audioPeak: number | null;
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
  const keep = [];
  const info = [];

  // Level meter on the mixed audio, so a silent recording can be detected.
  const mix = ctx.createGain();
  mix.connect(dest);
  const meter = ctx.createAnalyser();
  mix.connect(meter);
  const buf = new Float32Array(meter.fftSize);
  let peak = 0;
  setInterval(() => {
    meter.getFloatTimeDomainData(buf);
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  }, 250);

  const tap = (track, original) => {
    if (track.kind !== 'audio' || tapped.has(track.id)) return;
    tapped.add(track.id);
    const stream = new MediaStream([track]);
    const rec = { id: track.id.slice(0, 8), muted: track.muted, state: track.readyState, unmutes: 0, mutes: 0, el: null, peak: 0 };
    track.addEventListener('unmute', () => { rec.unmutes++; rec.muted = false; });
    track.addEventListener('mute', () => { rec.mutes++; rec.muted = true; });
    info.push(rec);
    // Chrome hands Web Audio silence for a remote WebRTC track unless the
    // stream is also attached to a media element. Muted, so the bot's machine
    // does not play the call out loud.
    try {
      const el = new Audio();
      el.muted = true;
      el.srcObject = stream;
      el.play().catch(() => {});
      keep.push(el);
      rec.el = el;
    } catch (e) {}
    // The stream object Meet itself received is the one Chrome ties the audio
    // pipeline to, so hold it on a muted element as well.
    try {
      if (original) {
        const el2 = new Audio();
        el2.muted = true;
        el2.srcObject = original;
        el2.play().catch(() => {});
        keep.push(el2);
      }
    } catch (e) {}
    try {
      const source = ctx.createMediaStreamSource(original || stream);
      source.connect(mix);
      // A meter per track, so the log shows which one carries sound.
      const own = ctx.createAnalyser();
      const ownBuf = new Float32Array(own.fftSize);
      source.connect(own);
      setInterval(() => {
        own.getFloatTimeDomainData(ownBuf);
        for (let i = 0; i < ownBuf.length; i++) rec.peak = Math.max(rec.peak, Math.abs(ownBuf[i]));
      }, 250);
    } catch (e) {}
  };

  const Original = window.RTCPeerConnection;
  const Wrapped = function (...args) {
    const pc = new Original(...args);
    pc.addEventListener('track', (event) => tap(event.track, event.streams && event.streams[0]));
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
    peak: () => peak,
    diag: () => ({
      ctx: ctx.state,
      peak: Number(peak.toFixed(4)),
      tracks: info.map((r) => ({ id: r.id, muted: r.muted, state: r.state, unmutes: r.unmutes, mutes: r.mutes, elPaused: r.el ? r.el.paused : null, peak: Number(r.peak.toFixed(4)) })),
    }),
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

/**
 * Every caption block Meet currently shows, as {name, text}. Each block is
 * found from its speaker avatar by climbing to the largest ancestor that still
 * holds only that one avatar; its first line is the name, the rest the words.
 */
export function readCaptionRows(): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  const region = document.querySelector('[role="region"][aria-label*="aption" i]');
  if (!region) return out;
  const imgs = region.querySelectorAll('img');
  for (let i = 0; i < imgs.length; i += 1) {
    let el: HTMLElement | null = imgs[i]!.parentElement;
    while (el && el.parentElement && el.parentElement !== region && el.parentElement.querySelectorAll('img').length === 1) {
      el = el.parentElement;
    }
    if (!el) continue;
    const lines = (el.innerText || '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const name = lines[0] ?? '';
    if (!name || name.length > 80 || lines.length < 2) continue;
    out.push({ name, text: lines.slice(1).join(' ') });
  }
  return out;
}

export class AudioCapture {
  private startedAt = 0;
  private samples: SpeakerSample[] = [];
  private timer: NodeJS.Timeout | null = null;
  private mime = 'audio/webm';
  private uploads: Promise<void> = Promise.resolve();
  private uploaded = 0;
  private failed = 0;
  private captions: CaptionLine[] = [];
  private captionRowsSeen = 0;
  private lastDiag = 0;

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
      this.page
        .evaluate(readCaptionRows)
        .then((rows) => this.ingestCaptions(rows, Date.now() - this.startedAt))
        .catch(() => {});
      if (Date.now() - this.lastDiag >= 30_000) {
        this.lastDiag = Date.now();
        void this.logDiagnostics('Audio diagnostics');
      }
    }, SAMPLE_MS);
  }

  /**
   * Folds the newest caption block into the running log. Meet rewrites a block
   * in place as someone speaks: words are appended, punctuation changes ("Working
   * on?" becomes "Working on education moment?"), and once the block is long its
   * start scrolls off. So the block is matched to the log's tail by its opening
   * words, ignoring case and punctuation, and the tail is *replaced* by the
   * newer version rather than appended to.
   */
  private ingestCaptions(rows: Array<{ name: string; text: string }>, t: number): void {
    const last = rows[rows.length - 1];
    if (!last || !last.text) return;
    this.captionRowsSeen += 1;

    const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
    const tail = this.captions[this.captions.length - 1];
    if (tail && tail.name === last.name && t - tail.lastT < 8000) {
      const a = words(tail.text);
      const b = words(last.text);
      const head = Math.min(2, a.length, b.length);
      const sameStart = head > 0 && a.slice(0, head).join(' ') === b.slice(0, head).join(' ');
      // Front trimmed: the new text opens somewhere inside the old one.
      const probe = b.slice(0, 3).join(' ');
      let cut = -1;
      if (!sameStart && b.length >= 3) {
        for (let i = 1; i + 3 <= a.length; i += 1) {
          if (a.slice(i, i + 3).join(' ') === probe) {
            cut = i;
            break;
          }
        }
      }
      if (sameStart) {
        tail.text = last.text;
        tail.lastT = t;
        return;
      }
      if (cut > 0) {
        tail.text = `${tail.text.split(/\s+/).slice(0, cut).join(' ')} ${last.text}`;
        tail.lastT = t;
        return;
      }
    }
    if (this.captions.length < 5000) this.captions.push({ t, lastT: t, name: last.name, text: last.text });
  }

  private async logDiagnostics(message: string): Promise<void> {
    if (this.page.isClosed()) return;
    const diag = await this.page.evaluate(() => (window as any).__recall?.diag?.()).catch(() => null);
    this.options.log.emit('warn', {
      message,
      detail: JSON.stringify({ ...diag, captionBlocksSeen: this.captionRowsSeen, captionLines: this.captions.length }),
    });
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

    await this.logDiagnostics('Audio diagnostics (final)');
    const peak = this.page.isClosed()
      ? null
      : await this.page.evaluate(() => (window as any).__recall?.peak?.() as number).catch(() => null);
    if (peak !== null && peak < 0.001) {
      this.options.log.emit('warn', {
        message: 'Recording is silent',
        detail: `Peak level ${peak} over the whole call: the remote audio was not captured`,
      });
    }

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
      captions: this.captions,
      audioPeak: peak ?? null,
      chunksUploaded: this.uploaded,
      chunksFailed: this.failed,
    };
  }
}
