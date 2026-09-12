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
async function post(page: Page, messages: string[]): Promise<number> {
  if (page.isClosed() || messages.length === 0) return 0;

  const chatButton = await resolveFirst(page, INCALL_CHAT_BUTTON, 4_000);
  if (!chatButton) return 0;

  try {
    await chatButton.locator.click({ timeout: 3_000 });
  } catch {
    return 0;
  }

  const input = await resolveFirst(page, INCALL_CHAT_INPUT, 5_000);
  if (!input) return 0;

  let sent = 0;
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
    } catch {
      break;
    }
  }

  // Close the panel so it doesn't obscure the controls we poll later.
  await chatButton.locator.click({ timeout: 2_000 }).catch(() => {});
  return sent;
}

export async function announce(page: Page, message: string): Promise<boolean> {
  return (await post(page, [message])) === 1;
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
): Promise<{ sent: number; total: number }> {
  return { sent: await post(page, lines), total: lines.length };
}
