/**
 * `notetaker-bot doctor` — selector health report.
 *
 * Opens a meeting URL and walks every chain in `selectors.ts`, reporting which
 * candidate resolved (if any). Selector rot is the main operational risk of a
 * self-built bot, and this turns "the bot is broken" into a ten-second
 * diagnosis pointing at the exact chain to fix.
 *
 * It always writes a screenshot and a DOM snapshot, so a chain that fails can
 * be repaired against the captured markup without rejoining the meeting.
 */
import type { Page } from 'playwright-core';
import type { DoctorOptions } from './config.js';
import { launchBrowser } from './browser/launch.js';
import { ArtifactStore } from './logging/artifacts.js';
import { ALL_CHAINS, resolveFirst, type SelectorChain } from './meet/selectors.js';
import { waitForSettled } from './meet/landing.js';
import { ExitCode } from './types.js';

interface ChainReport {
  chain: SelectorChain;
  matchedCandidate: string | null;
  matchCount: number;
}

export async function runDoctor(options: DoctorOptions): Promise<ExitCode> {
  const { close, page, channel, version } = await launchBrowser({
    headless: options.headless,
    profileDir: options.profileDir,
  });
  const artifacts = new ArtifactStore(options.outDir);

  try {
    process.stdout.write(`Browser: ${channel} ${version}\n`);
    process.stdout.write(`Opening: ${options.meetingUrl}\n\n`);

    await page.goto(options.meetingUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    // Meet shows "Getting ready…" long after DOMContentLoaded, so wait for a
    // concrete screen rather than sleeping a fixed amount.
    const landing = await waitForSettled(page);
    process.stdout.write(`Landing state: ${landing}\n\n`);

    // Captured BEFORE the selector walk, not after. Meet's error pages close
    // their own tab roughly 30s after load, and the walk can take longer than
    // that — capturing afterwards loses exactly the evidence we came for.
    const screenshot = await artifacts.screenshot(page, 'doctor');
    const snapshot = await artifacts.domSnapshot(page, 'doctor');

    const reports = await inspect(page);
    printReport(reports);

    process.stdout.write(`\nScreenshot: ${screenshot ?? '(failed)'}\n`);
    process.stdout.write(`DOM snapshot: ${snapshot ?? '(failed)'}\n`);
    process.stdout.write(`Artifacts under: ${options.outDir}\n`);

    if (page.isClosed()) {
      process.stdout.write(
        '\nNote: Meet closed the page during inspection — this is what its ' +
          'terminal error screens do after ~30s. Chains checked after that ' +
          'point report as absent.\n',
      );
    }

    const requiredMissing = reports.filter(
      (r) => !r.chain.optional && r.matchedCandidate === null,
    );
    if (requiredMissing.length > 0) {
      process.stdout.write(
        `\n${requiredMissing.length} required selector(s) did not resolve. ` +
          'Note that pre-join and in-call chains cannot both resolve on the ' +
          'same screen — run doctor at the stage you care about.\n',
      );
    }

    if (options.keepOpen) {
      process.stdout.write('\n--keep-open set; press Ctrl-C to close.\n');
      await new Promise<void>((resolvePromise) => {
        process.once('SIGINT', () => resolvePromise());
      });
    }

    return ExitCode.OK;
  } finally {
    if (!options.keepOpen) await close().catch(() => {});
  }
}

async function inspect(page: Page): Promise<ChainReport[]> {
  const reports: ChainReport[] = [];
  for (const chain of ALL_CHAINS) {
    if (page.isClosed()) {
      reports.push({ chain, matchedCandidate: null, matchCount: 0 });
      continue;
    }
    // Deliberately short per-candidate budget. Doctor walks every chain and
    // most are legitimately absent on any given screen, so the total run is
    // dominated by misses — and the whole walk has to finish inside the ~30s
    // before Meet may close a terminal error page.
    const resolved = await resolveFirst(page, chain, 250);
    let matchCount = 0;
    if (resolved) {
      matchCount = await resolved.locator.count().catch(() => 0);
    }
    reports.push({
      chain,
      matchedCandidate: resolved?.candidate.describe ?? null,
      matchCount,
    });
  }
  return reports;
}

function printReport(reports: ChainReport[]): void {
  const keyWidth = Math.max(...reports.map((r) => r.chain.key.length));
  process.stdout.write(`${'SELECTOR'.padEnd(keyWidth)}  STATUS    MATCHED VIA\n`);
  process.stdout.write(`${'-'.repeat(keyWidth)}  --------  -----------\n`);

  for (const report of reports) {
    const status = report.matchedCandidate
      ? 'OK'
      : report.chain.optional
        ? 'absent'
        : 'MISSING';
    const via = report.matchedCandidate
      ? `${report.matchedCandidate}${report.matchCount > 1 ? `  (${report.matchCount} matches)` : ''}`
      : '—';
    process.stdout.write(
      `${report.chain.key.padEnd(keyWidth)}  ${status.padEnd(8)}  ${via}\n`,
    );
  }
}
