/**
 * Consent disclosure via meeting chat.
 *
 * A recording bot that appears silently is a bad actor. The bot joins under a
 * name that reads as a bot and posts a plain-language disclosure on arrival;
 * the emitted `consent.disclosed` event is the durable record that it did.
 *
 * Failure here is reported, never swallowed into success — "we said we
 * disclosed and didn't" is precisely the bug that must not exist.
 */
import type { Page } from 'playwright-core';
import {
  INCALL_CHAT_BUTTON,
  INCALL_CHAT_INPUT,
  INCALL_CHAT_SEND,
  resolveFirst,
} from './selectors.js';

/**
 * Posts one or more messages, opening and closing the chat panel once.
 *
 * Meet's composer is a contenteditable: a `\n` inside a single fill either
 * submits early or is swallowed, so anything multi-line is sent as separate
 * messages rather than one block. Returns how many were actually sent, so a
 * partial delivery is reportable instead of rounding up to success.
 */
export interface PostResult {
  sent: number;
  /** Which step failed, in words; null when everything was sent. */
  why: string | null;
}

const short = (err: unknown) => (err as Error).message.split('\n')[0]?.slice(0, 140) ?? 'unknown error';

async function post(page: Page, messages: string[]): Promise<PostResult> {
  if (page.isClosed()) return { sent: 0, why: 'the page was already closed' };
  if (messages.length === 0) return { sent: 0, why: null };

  // Meet fades out its bottom controls after a few idle seconds, and the chat
  // button lives there. Nudge the pointer to bring them back, and try again a
  // couple of times before giving up.
  let chatButton = null as Awaited<ReturnType<typeof resolveFirst>>;
  for (let attempt = 0; attempt < 3 && !chatButton; attempt += 1) {
    await page.mouse.move(640 + attempt * 20, 720).catch(() => {});
    await page.mouse.move(660 + attempt * 20, 760, { steps: 4 }).catch(() => {});
    chatButton = await resolveFirst(page, INCALL_CHAT_BUTTON, 2_500);
  }
  if (!chatButton) return { sent: 0, why: 'the chat button was not found on the page, even after waking the controls' };

  try {
    await chatButton.locator.click({ timeout: 3_000 });
  } catch (err) {
    return { sent: 0, why: `clicking the chat button failed: ${short(err)}` };
  }

  const input = await resolveFirst(page, INCALL_CHAT_INPUT, 5_000);
  if (!input) return { sent: 0, why: 'the chat box did not appear after opening chat' };

  let sent = 0;
  let why: string | null = null;
  for (const message of messages) {
    try {
      await input.locator.fill(message, { timeout: 3_000 });

      // Prefer the explicit send control; Enter is the fallback because on some
      // Meet versions it inserts a newline instead of sending.
      const send = await resolveFirst(page, INCALL_CHAT_SEND, 1_000);
      if (send) {
        await send.locator.click({ timeout: 3_000 });
      } else {
        await input.locator.press('Enter', { timeout: 3_000 });
      }

      await page.waitForTimeout(500);
      sent += 1;
    } catch (err) {
      why = `typing or sending message ${sent + 1} failed: ${short(err)}`;
      break;
    }
  }

  // Close the panel so it doesn't obscure the controls we poll later.
  await chatButton.locator.click({ timeout: 2_000 }).catch(() => {});
  return { sent, why };
}

export async function announce(page: Page, message: string): Promise<{ ok: boolean; why: string | null }> {
  const result = await post(page, [message]);
  return { ok: result.sent === 1, why: result.why };
}

/**
 * Posts the end-of-meeting summary into chat, one line per message.
 *
 * Delivery happens while the bot is still in the call, because chat is only
 * reachable from inside it — see `formatSummaryForChat` for why that is the
 * channel. Partial sends are reported as such by the caller.
 */
export async function postSummary(
  page: Page,
  lines: string[],
): Promise<{ sent: number; total: number; why: string | null }> {
  const result = await post(page, lines);
  return { sent: result.sent, total: lines.length, why: result.why };
}
