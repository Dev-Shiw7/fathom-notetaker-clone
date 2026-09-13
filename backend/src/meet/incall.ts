/**
 * In-call monitoring and exit.
 *
 * Everything here has to tolerate the page disappearing underneath it. When a
 * host ends a meeting Meet frequently tears the tab down rather than rendering
 * a farewell screen, so "page is gone" is a normal control-flow outcome in this
 * module, not an error.
 */
import type { Page } from 'playwright-core';
import {
  INCALL_ENDED_SCREEN,
  INCALL_LEAVE_BUTTON,
  INCALL_PEOPLE_BUTTON,
  INCALL_REMOVED_BANNER,
  isPresent,
  resolveFirst,
} from './selectors.js';

export type ExitSignal = 'REMOVED' | 'MEETING_ENDED' | null;

/**
 * Reads the participant count from the People control.
 *
 * Meet puts the number in the button's accessible name or its text, and the
 * exact shape varies by version — so we pull the first integer out of either.
 * Returns null when it can't be read, and callers must treat null as "unknown"
 * rather than as zero, or the bot will leave a meeting it is happily sitting in.
 */
export async function getParticipantCount(page: Page): Promise<number | null> {
  if (page.isClosed()) return null;
  const found = await resolveFirst(page, INCALL_PEOPLE_BUTTON, 800);
  if (!found) return null;

  try {
    const label = (await found.locator.getAttribute('aria-label')) ?? '';
    const textContent = (await found.locator.textContent()) ?? '';
    const match = `${label} ${textContent}`.match(/\d+/);
    return match ? Number(match[0]) : null;
  } catch {
    return null;
  }
}

/** Detects the call ending out from under us — removal or host hang-up. */
export async function detectExit(page: Page): Promise<ExitSignal> {
  if (page.isClosed()) return 'MEETING_ENDED';

  try {
    if (await isPresent(page, INCALL_REMOVED_BANNER)) return 'REMOVED';
    if (await isPresent(page, INCALL_ENDED_SCREEN)) return 'MEETING_ENDED';

    // Losing the leave button means the call has ended or the page torn down.
    const inCall = await isPresent(page, INCALL_LEAVE_BUTTON);
    if (!inCall) {
      // Re-verify with a short timeout to prevent false positives during fast DOM updates
      const recheck = await resolveFirst(page, INCALL_LEAVE_BUTTON, 1_000);
      if (!recheck) {
        return 'MEETING_ENDED';
      }
    }
  } catch {
    return 'MEETING_ENDED';
  }

  return null;
}

/**
 * Leaves via the real UI button rather than by killing the process, so other
 * participants see a clean departure instead of a frozen tile.
 *
 * Returns true if we left deliberately; a page that has already gone counts as
 * left, since there is nothing to click.
 */
export async function leaveCall(page: Page): Promise<boolean> {
  if (page.isClosed()) return true;

  const found = await resolveFirst(page, INCALL_LEAVE_BUTTON, 3_000);
  if (!found) return false;

  try {
    await found.locator.click({ timeout: 5_000 });
  } catch {
    return false;
  }

  // Confirm departure, but don't fail the leave if the page simply vanished.
  for (let i = 0; i < 10; i += 1) {
    if (page.isClosed()) return true;
    if (await isPresent(page, INCALL_ENDED_SCREEN)) return true;
    if (!(await isPresent(page, INCALL_LEAVE_BUTTON))) return true;
    await page.waitForTimeout(500).catch(() => {});
  }
  return true;
}
