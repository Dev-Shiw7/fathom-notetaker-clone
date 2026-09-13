/**
 * Chromium launch configuration.
 *
 * Two decisions are load-bearing here:
 *
 * 1. We drive the locally installed Google Chrome (`channel: 'chrome'`) rather
 *    than Playwright's bundled Chromium, which ships without proprietary codecs
 *    (H.264). Meet can misbehave without them.
 *
 * 2. Media is faked at the browser level *and* muted in the UI later. The fake
 *    device flags mean the bot never touches a real camera or microphone and
 *    macOS never raises a device permission prompt; the UI mute in `prejoin.ts`
 *    is the second, independent guarantee that it joins dark and silent.
 */
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright-core';

export interface LaunchResult {
  context: BrowserContext;
  page: Page;
  channel: string;
  version: string;
  /** Absent for persistent contexts, which own their own browser process. */
  browser: Browser | null;
  /** Closes whichever handle actually owns the process. */
  close: () => Promise<void>;
}

const CHROME_ARGS = [
  // Synthetic camera/mic: no real device is ever opened.
  '--use-fake-device-for-media-stream',
  // Auto-accept the getUserMedia permission prompt.
  '--use-fake-ui-for-media-stream',
  // Meet probes autoplay; without this it can stall waiting for a gesture.
  '--autoplay-policy=no-user-gesture-required',
  // Reduces the most obvious automation tell (navigator.webdriver).
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1280,860',
];

/**
 * Context options shared by both launch modes. Locale is pinned because every
 * selector matches on English accessible names — a localised UI would break
 * them silently rather than loudly.
 */
const CONTEXT_OPTIONS = {
  viewport: { width: 1280, height: 800 },
  permissions: ['camera', 'microphone'],
  locale: 'en-US',
  timezoneId: 'UTC',
} as const;

export async function launchBrowser(options: {
  headless: boolean;
  /**
   * Directory holding a signed-in Chrome profile. When set, the bot runs as
   * that Google account — it can be invited to calendar events and admitted
   * without a human. When absent it joins anonymously as a guest, which always
   * requires someone to let it in.
   *
   * Chrome locks a profile directory, so concurrent bots need one each.
   */
  profileDir?: string | undefined;
}): Promise<LaunchResult> {
  if (options.profileDir) {
    const context = await chromium.launchPersistentContext(options.profileDir, {
      channel: 'chrome',
      headless: options.headless,
      args: CHROME_ARGS,
      ignoreDefaultArgs: ['--enable-automation'],
      ...CONTEXT_OPTIONS,
      permissions: [...CONTEXT_OPTIONS.permissions],
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    return {
      context,
      page,
      channel: 'chrome (persistent profile)',
      version: context.browser()?.version() ?? 'unknown',
      browser: context.browser(),
      close: () => context.close(),
    };
  }

  const { browser, channel } = await launchWithFallback(options.headless);
  const context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    permissions: [...CONTEXT_OPTIONS.permissions],
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return {
    context,
    page,
    channel,
    version: browser.version(),
    browser,
    close: () => browser.close(),
  };
}

/**
 * Prefers real Chrome; falls back to bundled Chromium with a clear explanation
 * rather than failing outright, since the fallback usually still works.
 */
async function launchWithFallback(
  headless: boolean,
): Promise<{ browser: Browser; channel: string }> {
  try {
    const browser = await chromium.launch({
      channel: 'chrome',
      headless,
      args: CHROME_ARGS,
      ignoreDefaultArgs: ['--enable-automation'],
    });
    return { browser, channel: 'chrome' };
  } catch (chromeErr) {
    try {
      const browser = await chromium.launch({
        headless,
        args: CHROME_ARGS,
        ignoreDefaultArgs: ['--enable-automation'],
      });
      return { browser, channel: 'chromium-bundled' };
    } catch {
      throw new Error(
        'Could not launch a browser.\n' +
          `  Google Chrome failed to start: ${(chromeErr as Error).message}\n` +
          '  Bundled Chromium is not installed either. Install Chrome, or run:\n' +
          '    npx playwright install chromium',
      );
    }
  }
}
