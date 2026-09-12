/**
 * Screenshot and DOM snapshot capture.
 *
 * These exist to make selector rot diagnosable. When the bot can't find
 * something it expected, the raw page at that instant is far more useful than
 * any message we could write about it.
 *
 * Every capture is best-effort: a failure here must never fail the run, so all
 * of these swallow errors and return `null`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';

export class ArtifactStore {
  private readonly screenshotDir: string;
  private readonly snapshotDir: string;
  private counter = 0;

  constructor(private readonly sessionDir: string) {
    this.screenshotDir = join(sessionDir, 'screenshots');
    this.snapshotDir = join(sessionDir, 'snapshots');
  }

  /** Captures a screenshot. Returns a session-relative path. */
  async screenshot(page: Page, label: string): Promise<string | null> {
    try {
      mkdirSync(this.screenshotDir, { recursive: true });
      const name = `${this.nextPrefix()}_${slug(label)}.png`;
      await page.screenshot({
        path: join(this.screenshotDir, name),
        fullPage: false,
        timeout: 15_000,
      });
      return join('screenshots', name);
    } catch (err) {
      warn('screenshot', label, err);
      return null;
    }
  }

  /** Dumps the live DOM. Written only on selector misses — they're large. */
  async domSnapshot(page: Page, label: string): Promise<string | null> {
    try {
      mkdirSync(this.snapshotDir, { recursive: true });
      const name = `${this.nextPrefix()}_${slug(label)}.html`;
      const html = await page.content();
      writeFileSync(join(this.snapshotDir, name), html, 'utf8');
      return join('snapshots', name);
    } catch (err) {
      warn('dom snapshot', label, err);
      return null;
    }
  }

  /** Sequence prefix so artifacts sort in capture order. */
  private nextPrefix(): string {
    this.counter += 1;
    return String(this.counter).padStart(3, '0');
  }
}

/**
 * Artifact capture is best-effort, but it must not fail *silently* — a missing
 * screenshot is precisely what you need when diagnosing a failed run.
 */
function warn(kind: string, label: string, err: unknown): void {
  const message = (err as Error)?.message ?? String(err);
  process.stderr.write(
    `warn: ${kind} capture failed for "${label}": ${message.split('\n')[0]}\n`,
  );
}

function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'capture'
  );
}
