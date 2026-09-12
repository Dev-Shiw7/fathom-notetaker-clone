/**
 * The join → monitor → leave state machine.
 *
 * This is the only module that knows the *order* of operations; everything
 * under `meet/` is a stateless helper over a Page. Keeping the sequencing in
 * one place is what makes the lifecycle auditable — every transition emits an
 * event, so `events.jsonl` reconstructs the whole run.
 */
import { join as joinPath } from 'node:path';
import type { JoinOptions } from './config.js';
import { launchBrowser, type LaunchResult } from './browser/launch.js';
import { ArtifactStore } from './logging/artifacts.js';
import { SessionLogger, buildSessionDirName } from './logging/events.js';
import { classifyLanding, isTerminal, waitForSettled } from './meet/landing.js';
import {
  dismissOverlays,
  ensureMediaOff,
  requestJoin,
  setDisplayName,
} from './meet/prejoin.js';
import { confirmJoinRequested, waitForAdmission } from './meet/admission.js';
import { detectExit, getParticipantCount, leaveCall } from './meet/incall.js';
import { announce } from './meet/chat.js';
import { recordStubTranscript } from './recording.js';
import {
  ExitCode,
  type BotState,
  type LeaveReason,
  type SessionOutcome,
} from './types.js';

/** How often the in-call monitor polls. */
const MONITOR_INTERVAL_MS = 2_000;

export async function runJoin(options: JoinOptions): Promise<ExitCode> {
  const startedAt = new Date();
  const { sessionId, dirName } = buildSessionDirName(
    options.meetingCode,
    startedAt,
  );
  const sessionDir = joinPath(options.outDir, dirName);
  const log = new SessionLogger(sessionId, sessionDir);
  const artifacts = new ArtifactStore(sessionDir);

  let state: BotState = 'IDLE';
  const setState = (next: BotState) => {
    log.emit('state.changed', { from: state, to: next });
    state = next;
  };

  /** Set by signal handlers; polled by every wait loop. */
  const interrupt = { requested: false as boolean };
  const detachSignals = attachSignalHandlers(interrupt);

  log.emit('session.started', {
    meetingUrl: options.meetingUrl,
    meetingCode: options.meetingCode,
    botName: options.botName,
    options: {
      admissionTimeoutMs: options.admissionTimeoutMs,
      aloneTimeoutMs: options.aloneTimeoutMs,
      maxDurationMs: options.maxDurationMs,
      chatAnnounce: options.chatAnnounce,
      headless: options.headless,
      profileDir: options.profileDir ?? null,
    },
  });

  let launched: LaunchResult | null = null;

  try {
    setState('LAUNCHING');
    launched = await launchBrowser({
      headless: options.headless,
      profileDir: options.profileDir,
    });
    log.emit('browser.launched', {
      channel: launched.channel,
      version: launched.version,
    });

    const { page } = launched;

    // ---- Navigate ------------------------------------------------------
    setState('NAVIGATING');
    const navStart = Date.now();
    await page.goto(options.meetingUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    const landing = await waitForSettled(page);
    log.emit('navigation.completed', {
      url: page.url(),
      landingState: landing,
      elapsedMs: Date.now() - navStart,
    });

    if (isTerminal(landing)) {
      await artifacts.screenshot(page, `landing-${landing}`);
      await artifacts.domSnapshot(page, `landing-${landing}`);
      return await finish('COULD_NOT_JOIN', ExitCode.CANNOT_JOIN);
    }

    // ---- Pre-join ------------------------------------------------------
    setState('PRE_JOIN');
    await dismissOverlays(page);
    log.emit('prejoin.ready', {});

    const media = await ensureMediaOff(page);
    log.emit('prejoin.media_muted', media);

    if (!media.verified) {
      // The fake-device launch flags already guarantee no real camera or mic is
      // ever opened, so an unverified UI mute is a warning rather than a hard
      // stop — refusing to join because an attribute was unreadable would make
      // the bot far more brittle than the risk warrants. `--require-muted`
      // flips this to strict for anyone who wants the guarantee.
      log.emit('warn', {
        message: 'Could not verify mic/camera are muted in the UI',
        detail: `camera=${media.camera} microphone=${media.microphone}`,
      });
      await artifacts.screenshot(page, 'unverified-mute');
      if (options.requireMuted) {
        return await finish('ERROR', ExitCode.FAILURE);
      }
    }

    const nameSet = await setDisplayName(page, options.botName);
    if (nameSet) log.emit('prejoin.name_set', { name: options.botName });

    await dismissOverlays(page, 2);
    await artifacts.screenshot(page, 'prejoin');

    if (interrupt.requested) return await finish('COMPLETED', ExitCode.OK);

    // ---- Request admission ---------------------------------------------
    setState('REQUESTING');
    if (!(await requestJoin(page))) {
      await artifacts.screenshot(page, 'join-button-missing');
      await artifacts.domSnapshot(page, 'join-button-missing');
      log.emit('selector.miss', {
        key: 'prejoin.joinButton',
        candidates: ['ask to join', 'join now'],
        snapshotPath: null,
        screenshotPath: null,
      });
      return await finish('COULD_NOT_JOIN', ExitCode.CANNOT_JOIN);
    }
    log.emit('join.requested', {});

    // The click not throwing is not evidence that Meet acted on it. Confirm
    // against the page, and capture what it looked like either way — this is
    // what distinguishes "nobody admitted us" from "we never knocked".
    const confirmStart = Date.now();
    const confirmation = await confirmJoinRequested(page);
    const confirmShot = await artifacts.screenshot(
      page,
      `after-join-click-${confirmation}`,
    );
    log.emit('join.confirmed', {
      confirmation,
      elapsedMs: Date.now() - confirmStart,
      screenshotPath: confirmShot,
    });

    if (confirmation === 'NOT_REGISTERED' || confirmation === 'UNCONFIRMED') {
      await artifacts.domSnapshot(page, `join-${confirmation}`);
      log.emit('warn', {
        message: 'Join click did not visibly register with Meet',
        detail:
          confirmation === 'NOT_REGISTERED'
            ? 'The join button is still on screen — the host will not have seen a prompt'
            : 'Page moved somewhere unrecognised after the join click',
      });
    }

    // ---- Waiting room ---------------------------------------------------
    setState('WAITING_ROOM');
    const admission = await waitForAdmission(
      page,
      options.admissionTimeoutMs,
      options.meetingCode,
    );

    if (admission.status === 'DENIED') {
      log.emit('admission.denied', { waitedMs: admission.waitedMs });
      return await finish('DENIED', ExitCode.ADMISSION_DENIED);
    }
    if (admission.status === 'TIMEOUT') {
      log.emit('admission.timeout', { waitedMs: admission.waitedMs });
      await artifacts.screenshot(page, 'admission-timeout');
      return await finish('NEVER_ADMITTED', ExitCode.ADMISSION_TIMEOUT);
    }
    log.emit('admission.granted', { waitedMs: admission.waitedMs });

    // ---- In call ---------------------------------------------------------
    setState('IN_CALL');
    const joinedAt = Date.now();
    await artifacts.screenshot(page, 'in-call');

    if (options.chatAnnounce) {
      if (await announce(page, options.consentMessage)) {
        log.emit('consent.disclosed', {
          channel: 'chat',
          message: options.consentMessage,
        });
      } else {
        log.emit('warn', {
          message: 'Consent message could not be posted to chat',
          detail: 'Bot is still named as a notetaker in the participant list',
        });
      }
    }

    // ---- Record transcript ----------------------------------------------
    const { turns, summary } = await recordStubTranscript(page, options.meetingCode || 'unknown', log);
    
    // Post transcript to web API for storage
    // Try to post, but don't fail the session if it doesn't work (web app may not be running)
    try {
      const apiResponse = await fetch('http://localhost:3000/api/bot/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingCode: options.meetingCode,
          meetingUrl: options.meetingUrl,
          botName: options.botName,
          turns,
          summary,
        }),
      });
      
      if (apiResponse.ok) {
        log.emit('warn', {
          message: 'Transcript posted to web API',
          detail: 'The web UI should now display this meeting',
        });
      } else {
        log.emit('warn', {
          message: 'Web API returned error when saving transcript',
          detail: `HTTP ${apiResponse.status}`,
        });
      }
    } catch (err) {
      // Web app might not be running; this is fine for testing
      log.emit('warn', {
        message: 'Could not post transcript to web API (web app may not be running)',
        detail: (err as Error).message,
      });
    }

    const reason = await monitorCall(page, options, joinedAt, interrupt, log);

    // ---- Leave -----------------------------------------------------------
    setState('LEAVING');
    log.emit('leave.triggered', { reason });
    await leaveCall(page);
    log.emit('leave.completed', { durationInCallMs: Date.now() - joinedAt });

    return await finish('COMPLETED', ExitCode.OK);
  } catch (err) {
    const screenshotPath = launched
      ? await artifacts.screenshot(launched.page, 'error')
      : null;
    log.emit('error', {
      phase: state,
      message: (err as Error).message,
      stack: (err as Error).stack ?? null,
      screenshotPath,
    });
    return await finish('ERROR', ExitCode.FAILURE);
  }

  async function finish(
    outcome: SessionOutcome,
    exitCode: ExitCode,
  ): Promise<ExitCode> {
    setState(exitCode === ExitCode.OK ? 'ENDED' : 'FAILED');
    const durationMs = Date.now() - startedAt.getTime();
    log.emit('session.ended', { outcome, exitCode, durationMs });
    log.writeMeta({
      sessionId,
      meetingUrl: options.meetingUrl,
      meetingCode: options.meetingCode,
      botName: options.botName,
      outcome,
      exitCode,
      startedAt: startedAt.toISOString(),
      durationMs,
    });

    detachSignals();
    if (launched && !options.keepOpen) {
      await launched.close().catch(() => {});
    }
    return exitCode;
  }
}

/**
 * Polls the call until something says it's time to go.
 *
 * Returns the reason, which the caller logs before actually leaving — so the
 * event stream records *why* we left even if the leave itself then fails.
 */
async function monitorCall(
  page: import('playwright-core').Page,
  options: JoinOptions,
  joinedAt: number,
  interrupt: { requested: boolean },
  log: SessionLogger,
): Promise<LeaveReason> {
  let previousCount: number | null = null;
  let aloneSince: number | null = null;

  for (;;) {
    if (interrupt.requested) return 'SIGNAL';

    if (Date.now() - joinedAt >= options.maxDurationMs) return 'MAX_DURATION';

    const exit = await detectExit(page);
    if (exit === 'REMOVED') return 'REMOVED';
    if (exit === 'MEETING_ENDED') return 'MEETING_ENDED';

    const count = await getParticipantCount(page);
    if (count !== null && count !== previousCount) {
      log.emit('participants.changed', { count, previous: previousCount });
      previousCount = count;
    }

    // `null` means unreadable, not empty — treating it as "alone" would make
    // the bot walk out of a meeting it is sitting in perfectly happily.
    if (count !== null && count <= 1) {
      aloneSince ??= Date.now();
      if (Date.now() - aloneSince >= options.aloneTimeoutMs) return 'ALONE';
    } else if (count !== null) {
      aloneSince = null;
    }

    await page.waitForTimeout(MONITOR_INTERVAL_MS).catch(() => {});
  }
}

/**
 * Ctrl-C should make the bot *leave*, not vanish — a killed process leaves a
 * frozen tile in the call for everyone else. The first signal requests a
 * graceful exit; a second one gives up and exits immediately, so an operator is
 * never trapped waiting on a wedged browser.
 */
function attachSignalHandlers(interrupt: { requested: boolean }): () => void {
  const handler = (signal: NodeJS.Signals) => {
    if (interrupt.requested) {
      process.stderr.write(`\nSecond ${signal}; exiting immediately.\n`);
      process.exit(ExitCode.FAILURE);
    }
    interrupt.requested = true;
    process.stderr.write(
      `\nReceived ${signal}; leaving the call cleanly (press again to force).\n`,
    );
  };

  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  return () => {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
  };
}

export { classifyLanding };
