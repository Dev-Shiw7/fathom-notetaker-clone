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

export async function announce(page: Page, message: string): Promise<boolean> {
  if (page.isClosed()) return false;

  const chatButton = await resolveFirst(page, INCALL_CHAT_BUTTON, 4_000);
  if (!chatButton) return false;

  try {
    await chatButton.locator.click({ timeout: 3_000 });
  } catch {
    return false;
  }

  const input = await resolveFirst(page, INCALL_CHAT_INPUT, 5_000);
  if (!input) return false;

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

    // Close the panel so it doesn't obscure the controls we poll later.
    await chatButton.locator.click({ timeout: 2_000 }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
