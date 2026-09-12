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
  isPresent,
} from './selectors.js';

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
