/**
 * The pre-join ("green room") sequence.
 *
 * The hard requirement here is that the bot never joins hot. Fake media devices
 * at the browser level mean no real camera or mic is ever opened, but a fake
 * camera still *transmits* — participants would see a synthetic video tile from
 * something calling itself a notetaker. So we mute in the UI as well, and then
 * verify it stuck. `ensureMediaOff` reports `verified: false` rather than
 * guessing, and the caller aborts the join on that.
 */
import type { Page } from 'playwright-core';
import {
  PREJOIN_CAMERA_TOGGLE,
  PREJOIN_DISMISS_OVERLAY,
  PREJOIN_JOIN_BUTTON,
  PREJOIN_MIC_TOGGLE,
  PREJOIN_NAME_INPUT,
  resolveFirst,
  type SelectorChain,
} from './selectors.js';

export interface MediaState {
  camera: boolean;
  microphone: boolean;
  verified: boolean;
}

/**
 * Clears onboarding and permission overlays that sit on top of the join
 * controls. Loops because dismissing one can reveal another.
 */
export async function dismissOverlays(page: Page, maxRounds = 4): Promise<number> {
  let dismissed = 0;
  for (let round = 0; round < maxRounds; round += 1) {
    const found = await resolveFirst(page, PREJOIN_DISMISS_OVERLAY, 400);
    if (!found) break;
    try {
      await found.locator.click({ timeout: 2_000 });
      dismissed += 1;
      await page.waitForTimeout(400);
    } catch {
      break;
    }
  }
  return dismissed;
}

/** Turns the mic and camera off, then re-reads the DOM to confirm. */
export async function ensureMediaOff(page: Page): Promise<MediaState> {
  const microphone = await setToggleMuted(page, PREJOIN_MIC_TOGGLE, 'microphone');
  const camera = await setToggleMuted(page, PREJOIN_CAMERA_TOGGLE, 'camera');
  return { camera, microphone, verified: camera && microphone };
}

/** How long to keep trying to get one toggle into the muted state. */
const MUTE_DEADLINE_MS = 15_000;

/**
 * Drives one mute toggle to the "off" state, retrying until it verifiably
 * sticks.
 *
 * A single click is not enough, and this cost us a live run to learn: the
 * selectors resolve immediately, the click reports success, and `data-is-muted`
 * stays `"false"`. Meet is still wiring up its media devices at that point and
 * quietly discards the toggle. On top of that, a "Sign in with your Google
 * account" tooltip renders a beat *after* the pre-join screen and can swallow
 * the click — so overlays get cleared on every attempt, not just once up front.
 *
 * Current state is read from `data-is-muted` where present, falling back to the
 * aria-label, which names the *action* rather than the state ("Turn off
 * microphone" means it is currently on).
 */
async function setToggleMuted(
  page: Page,
  selector: SelectorChain,
  kind: 'microphone' | 'camera',
): Promise<boolean> {
  const deadline = Date.now() + MUTE_DEADLINE_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;

    // Clear anything that might intercept the click before each try.
    await dismissOverlays(page, 1);

    const found = await resolveFirst(page, selector, 2_000);
    if (!found) {
      await page.waitForTimeout(500);
      continue;
    }

    try {
      if (await isMuted(found.locator, kind)) return true;

      await found.locator.click({ timeout: 2_000 });
      await page.waitForTimeout(700);
      if (await isMuted(found.locator, kind)) return true;

      // Meet's own shortcuts are a different code path into the same state,
      // and have outlived several markup revisions.
      if (attempt >= 2) {
        await muteViaKeyboard(page, kind);
        await page.waitForTimeout(500);
        if (await isMuted(found.locator, kind)) return true;
      }
    } catch {
      // Element went stale mid-attempt; re-resolve on the next pass.
    }
  }

  return false;
}

async function isMuted(
  locator: import('playwright-core').Locator,
  kind: 'microphone' | 'camera',
): Promise<boolean> {
  const dataMuted = await locator.getAttribute('data-is-muted').catch(() => null);
  if (dataMuted !== null) return dataMuted === 'true';

  const label = (await locator.getAttribute('aria-label').catch(() => null)) ?? '';
  // "Turn on X"  → currently off (muted). "Turn off X" → currently on.
  if (new RegExp(`turn on ${kind}`, 'i').test(label)) return true;
  if (new RegExp(`turn off ${kind}`, 'i').test(label)) return false;
  return false;
}

/** Meet's own shortcuts: ⌘/Ctrl+D toggles mic, ⌘/Ctrl+E toggles camera. */
async function muteViaKeyboard(
  page: Page,
  kind: 'microphone' | 'camera',
): Promise<void> {
  const key = kind === 'microphone' ? 'ControlOrMeta+d' : 'ControlOrMeta+e';
  await page.keyboard.press(key).catch(() => {});
}

/**
 * Fills the guest display-name field.
 *
 * Returns false when the field is absent, which is the normal case for a
 * signed-in session — the name comes from the Google account instead.
 */
export async function setDisplayName(page: Page, name: string): Promise<boolean> {
  const found = await resolveFirst(page, PREJOIN_NAME_INPUT, 3_000);
  if (!found) return false;
  try {
    await found.locator.fill(name, { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

/** Clicks "Ask to join" / "Join now". */
export async function requestJoin(page: Page): Promise<boolean> {
  const found = await resolveFirst(page, PREJOIN_JOIN_BUTTON, 8_000);
  if (!found) return false;
  try {
    await found.locator.click({ timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
