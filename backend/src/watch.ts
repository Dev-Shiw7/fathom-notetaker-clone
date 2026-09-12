/**
 * `notetaker-bot watch` — the runner loop.
 *
 * Solves the problem that makes the capture layer undeployable: the app runs
 * somewhere with no browser, the browser runs somewhere with no public address.
 * Rather than the server pushing work to the bot, the bot polls the server and
 * pulls it. Every connection is outbound HTTPS, so this runs happily on a
 * laptop behind NAT with nothing forwarded and no tunnel.
 *
 * Same shape as a CI self-hosted runner or a print spooler, and for the same
 * reason.
 */
import { hostname } from 'node:os';
import { runJoin } from './session.js';
import { DEFAULTS, parseMeetingUrl } from './config.js';
import { ExitCode } from './types.js';

export interface WatchOptions {
  apiUrl: string;
  token: string;
  runner: string;
  pollIntervalMs: number;
  outDir: string;
  headless: boolean;
  profileDir: string | undefined;
  admissionTimeoutMs: number;
  aloneTimeoutMs: number;
  maxDurationMs: number;
  chatAnnounce: boolean;
  consentMessage: string;
  summaryDelayMs: number;
}

interface QueuedJob {
  id: string;
  meetingUrl: string;
  botName: string;
  title: string | null;
}

export async function runWatch(options: WatchOptions): Promise<ExitCode> {
  const runner = options.runner || `${hostname()}-${process.pid}`;
  let stopping = false;

  const stop = () => {
    if (stopping) process.exit(ExitCode.FAILURE);
    stopping = true;
    process.stderr.write('\nStopping after the current job…\n');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  process.stdout.write(
    `notetaker runner "${runner}"\n` +
      `  api      ${options.apiUrl}\n` +
      `  polling  every ${Math.round(options.pollIntervalMs / 1000)}s\n\n`,
  );

  // A poll failure must never kill the runner — the app may be redeploying, or
  // the laptop may have changed networks. Back off and keep going.
  let consecutiveFailures = 0;

  while (!stopping) {
    let job: QueuedJob | null = null;

    try {
      job = await claimNext(options, runner);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      const wait = Math.min(60_000, options.pollIntervalMs * consecutiveFailures);
      process.stderr.write(
        `poll failed (${(err as Error).message}); retrying in ${Math.round(wait / 1000)}s\n`,
      );
      await sleep(wait);
      continue;
    }

    if (!job) {
      await sleep(options.pollIntervalMs);
      continue;
    }

    process.stdout.write(
      `\n▶ claimed ${job.id} — ${job.title ?? job.meetingUrl}\n`,
    );
    await report(options, job.id, { status: 'joining', lastMessage: 'Launching browser' });

    try {
      const { url, code } = parseMeetingUrl(job.meetingUrl);
      const exitCode = await runJoin({
        meetingUrl: url,
        meetingCode: code,
        botName: job.botName || DEFAULTS.botName,
        outDir: options.outDir,
        admissionTimeoutMs: options.admissionTimeoutMs,
        aloneTimeoutMs: options.aloneTimeoutMs,
        maxDurationMs: options.maxDurationMs,
        chatAnnounce: options.chatAnnounce,
        consentMessage: options.consentMessage,
        headless: options.headless,
        keepOpen: false,
        requireMuted: false,
        profileDir: options.profileDir,
        summaryChat: options.chatAnnounce,
        summaryDelayMs: options.summaryDelayMs,
        // The bot posts results back to the same app it took the job from, so
        // the queue and the transcript sink can never drift apart.
        appUrl: options.apiUrl,
      });

      await report(options, job.id, {
        status: exitCode === ExitCode.OK ? 'done' : 'failed',
        lastMessage: describeExit(exitCode),
      });
      process.stdout.write(`■ ${job.id} — ${describeExit(exitCode)}\n`);
    } catch (err) {
      // One bad meeting must not take the runner down with it.
      await report(options, job.id, {
        status: 'failed',
        lastMessage: (err as Error).message,
      });
      process.stderr.write(`✗ ${job.id} — ${(err as Error).message}\n`);
    }
  }

  return ExitCode.OK;
}

async function claimNext(
  options: WatchOptions,
  runner: string,
): Promise<QueuedJob | null> {
  const url = `${options.apiUrl.replace(/\/$/, '')}/api/bot/jobs/next?runner=${encodeURIComponent(runner)}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${options.token}` },
  });

  if (response.status === 401) {
    throw new Error('Unauthorised — BOT_TOKEN does not match the server');
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = (await response.json()) as { job: QueuedJob | null };
  return body.job ?? null;
}

/** Progress reports are best-effort: losing one must not abort the meeting. */
async function report(
  options: WatchOptions,
  jobId: string,
  patch: { status?: string; lastMessage?: string; resultMeetingId?: string },
): Promise<void> {
  try {
    await fetch(`${options.apiUrl.replace(/\/$/, '')}/api/bot/jobs/${jobId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
  } catch {
    // Swallowed deliberately — see above.
  }
}

function describeExit(code: ExitCode): string {
  switch (code) {
    case ExitCode.OK:
      return 'Joined and left cleanly';
    case ExitCode.ADMISSION_TIMEOUT:
      return 'Never admitted — nobody let the bot in';
    case ExitCode.ADMISSION_DENIED:
      return 'Admission denied';
    case ExitCode.CANNOT_JOIN:
      return 'Could not join — bad code, sign-in required, or not started';
    default:
      return 'Failed';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
