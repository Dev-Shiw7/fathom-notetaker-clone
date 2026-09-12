/**
 * Waiting-room resolution.
 *
 * Three distinct outcomes, and keeping them distinct matters: "denied" is
 * permanent and must not be retried, "timed out" is worth retrying later, and
 * only "granted" means we're in. Collapsing them into a boolean would make the
 * scheduler's retry logic impossible to write correctly.
 */
import type { Page } from 'playwright-core';
import type { AdmissionResult } from '../types.js';
import {
  INCALL_LEAVE_BUTTON,
  LANDING_DENIED_ENTRY,
  PREJOIN_JOIN_BUTTON,
  WAITING_INDICATOR,
  isPresent,
} from './selectors.js';

/** What the page shows after the join button was clicked. */
export type JoinConfirmation =
  /** "Asking to be let in" — the host should now see a prompt. */
  | 'WAITING'
  /** Straight into the call, no waiting room. */
  | 'IN_CALL'
  /** The join button is still sitting there; the click did not register. */
  | 'NOT_REGISTERED'
  /** Neither confirmed nor refuted — page moved somewhere unrecognised. */
  | 'UNCONFIRMED';

/**
 * Verifies that clicking "Ask to join" actually did something.
 *
 * A Playwright click resolving successfully only means it dispatched an event
 * at an element — not that Meet acted on it. Reporting `join.requested` off the
 * click alone made the bot claim it had asked to join when the host saw no
 * prompt at all, which is the difference between "nobody admitted us" and "we
 * never knocked". Those need different fixes, so the bot has to tell them
 * apart.
 */
export async function confirmJoinRequested(
  page: Page,
  timeoutMs = 15_000,
): Promise<JoinConfirmation> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (page.isClosed()) return 'UNCONFIRMED';

    if (await isPresent(page, INCALL_LEAVE_BUTTON)) return 'IN_CALL';
    if (await isPresent(page, WAITING_INDICATOR)) return 'WAITING';

    await page.waitForTimeout(750).catch(() => {});
  }

  // Still looking at the join button means the click never took effect.
  if (await isPresent(page, PREJOIN_JOIN_BUTTON)) return 'NOT_REGISTERED';
  return 'UNCONFIRMED';
}

export async function waitForAdmission(
  page: Page,
  timeoutMs: number,
  meetingCode: string | null,
  onTick?: (elapsedMs: number) => void,
): Promise<AdmissionResult> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;

  while (Date.now() < deadline) {
    const waitedMs = Date.now() - startedAt;

    // Meet tears the page down on some rejection paths rather than rendering a
    // message, so a closed page here means denial, not a crash.
    if (page.isClosed()) return { status: 'DENIED', waitedMs };

    if (await isPresent(page, INCALL_LEAVE_BUTTON)) {
      return { status: 'GRANTED', waitedMs };
    }
    if (await isPresent(page, LANDING_DENIED_ENTRY)) {
      return { status: 'DENIED', waitedMs };
    }
    if (wasBounced(page, meetingCode)) {
      return { status: 'DENIED', waitedMs };
    }

    onTick?.(waitedMs);
    await page.waitForTimeout(1_000).catch(() => {});
  }

  return { status: 'TIMEOUT', waitedMs: Date.now() - startedAt };
}

/**
 * Detects Meet silently ejecting us from the meeting URL.
 *
 * When an admission request goes unanswered — nobody is actually in the call —
 * Meet eventually redirects the guest to its marketing landing page instead of
 * rendering any rejection message. Without this check the bot cheerfully polls
 * a Google Workspace ad for the rest of its admission timeout, then reports
 * TIMEOUT when the truthful answer is DENIED.
 */
function wasBounced(page: Page, meetingCode: string | null): boolean {
  if (!meetingCode) return false;
  try {
    return !page.url().includes(meetingCode);
  } catch {
    return false;
  }
}
