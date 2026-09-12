/**
 * Figures out what screen we actually landed on after navigating to a meeting.
 *
 * Meet takes its time: it renders a "Getting ready…" placeholder before the
 * real pre-join controls exist, so a fixed sleep either wastes seconds or races
 * the page. `waitForSettled` instead polls for a *concrete* outcome.
 *
 * There's a hard deadline on the other side, too — Meet's terminal error
 * screens close their own tab roughly 30 seconds after load. Anything we want
 * to observe or capture has to happen inside that window.
 */
import type { Page } from 'playwright-core';
import type { LandingState } from '../types.js';
import {
  INCALL_LEAVE_BUTTON,
  LANDING_DENIED_ENTRY,
  LANDING_INVALID_CODE,
  LANDING_NOT_STARTED,
  LANDING_SIGN_IN_REQUIRED,
  PREJOIN_JOIN_BUTTON,
  PREJOIN_NAME_INPUT,
  isPresent,
} from './selectors.js';

/** Error states, checked before the joinable ones — see `classifyLanding`. */
const TERMINAL_CHAINS = [
  { chain: LANDING_INVALID_CODE, state: 'INVALID_CODE' as const },
  { chain: LANDING_SIGN_IN_REQUIRED, state: 'SIGN_IN_REQUIRED' as const },
  { chain: LANDING_NOT_STARTED, state: 'NOT_STARTED' as const },
  { chain: LANDING_DENIED_ENTRY, state: 'DENIED_ENTRY' as const },
];

/**
 * Waits until the page reaches a state worth acting on, or the deadline passes.
 *
 * Returns as soon as any recognised screen appears, so the common case costs a
 * few seconds rather than the full budget.
 */
export async function waitForSettled(
  page: Page,
  timeoutMs = 25_000,
): Promise<LandingState> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (page.isClosed()) return 'UNKNOWN';

    const state = await classifyLanding(page);
    if (state !== 'UNKNOWN') return state;

    await page.waitForTimeout(500).catch(() => {});
  }

  return page.isClosed() ? 'UNKNOWN' : classifyLanding(page);
}

/**
 * Single-pass classification of the current screen.
 *
 * Terminal error states are checked first. Meet renders the header (including
 * its "Sign in" link and home button) on every screen, so the ordering matters
 * less than the selectors being specific — see the NOTE comments in
 * `selectors.ts` about two false positives that cost us exactly this.
 */
export async function classifyLanding(page: Page): Promise<LandingState> {
  if (page.isClosed()) return 'UNKNOWN';

  try {
    for (const { chain, state } of TERMINAL_CHAINS) {
      if (await isPresent(page, chain)) return state;
    }

    // Already inside a call — happens if the host had auto-admitted us.
    if (await isPresent(page, INCALL_LEAVE_BUTTON)) return 'PRE_JOIN';

    if (
      (await isPresent(page, PREJOIN_NAME_INPUT)) ||
      (await isPresent(page, PREJOIN_JOIN_BUTTON))
    ) {
      return 'PRE_JOIN';
    }
  } catch {
    // Page torn down mid-check; treat as unknown rather than crashing.
  }

  return 'UNKNOWN';
}

/** Whether this landing state means the bot can never get in. */
export function isTerminal(state: LandingState): boolean {
  return (
    state === 'INVALID_CODE' ||
    state === 'SIGN_IN_REQUIRED' ||
    state === 'NOT_STARTED' ||
    state === 'DENIED_ENTRY'
  );
}
