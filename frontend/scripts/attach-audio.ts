/**
 * Attaches a real audio track to a meeting.
 *
 *   npm run attach-audio -- ~/Downloads/fathom-call.m4a
 *   npm run attach-audio -- ~/Downloads/fathom-call.m4a meridian-discovery
 *
 * Everything downstream of `audioUrl` already works — `usePlayback` drives a
 * real <audio> element the moment one is present, and falls back to a
 * synthetic clock when it is not. The only thing missing has ever been a file.
 *
 * Writes to both places a meeting can come from:
 *   - the seed module, so `git clone && npm run dev` has audio with no database
 *   - MongoDB, when MONGODB_URI is set, since that is what the app reads first
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { COLLECTIONS, db, hasMongo } from '../src/lib/mongo';

const DEFAULT_MEETING = 'q4-planning';
const MEDIA_DIR = resolve(process.cwd(), 'public/media');

/** Types a browser will actually play back. */
const PLAYABLE = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.webm', '.mp4']);

/** Seed files are keyed by meeting id so we can patch the right one. */
const SEED_FILES: Record<string, string> = {
  'q4-planning': 'src/seed/meetings/q4-planning.ts',
  'meridian-discovery': 'src/seed/meetings/meridian-discovery.ts',
};

function fail(message: string): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

async function main() {
  const [sourceArg, meetingArg] = process.argv.slice(2);
  if (!sourceArg) {
    fail(
      'usage: npm run attach-audio -- <audio-file> [meetingId]\n' +
        `       meetingId defaults to "${DEFAULT_MEETING}"`,
    );
  }

  const source = resolve(sourceArg);
  if (!existsSync(source)) fail(`no such file: ${source}`);

  const ext = extname(source).toLowerCase();
  if (!PLAYABLE.has(ext)) {
    fail(
      `"${ext}" is not a format browsers reliably play.\n` +
        `       Use one of: ${[...PLAYABLE].join(', ')}`,
    );
  }

  const meetingId = meetingArg ?? DEFAULT_MEETING;
  const fileName = `${meetingId}${ext}`;
  const audioUrl = `/media/${fileName}`;

  mkdirSync(MEDIA_DIR, { recursive: true });
  copyFileSync(source, join(MEDIA_DIR, fileName));

  const sizeMb = (statSync(source).size / 1_048_576).toFixed(1);
  process.stdout.write(`copied ${basename(source)} (${sizeMb} MB) -> public${audioUrl}\n`);

  // --- seed -----------------------------------------------------------------
  const seedPath = SEED_FILES[meetingId];
  if (seedPath && existsSync(seedPath)) {
    const before = readFileSync(seedPath, 'utf8');
    const after = before.replace(
      /audioUrl:\s*(null|'[^']*'|"[^"]*")/,
      `audioUrl: '${audioUrl}'`,
    );
    if (after !== before) {
      writeFileSync(seedPath, after);
      process.stdout.write(`patched ${seedPath}\n`);
    } else {
      process.stdout.write(`note: no audioUrl field found in ${seedPath}\n`);
    }
  } else {
    process.stdout.write(
      `note: no seed file mapped for "${meetingId}" — database only\n`,
    );
  }

  // --- database -------------------------------------------------------------
  if (!hasMongo) {
    process.stdout.write('note: MONGODB_URI unset — seed updated, database skipped\n');
  } else {
    try {
      const result = await (await db())
        .collection(COLLECTIONS.meetings)
        .updateOne({ id: meetingId }, { $set: { audioUrl } });
      process.stdout.write(
        result.matchedCount
          ? `updated meeting "${meetingId}" in MongoDB\n`
          : `warn: no meeting "${meetingId}" in MongoDB — seed was still patched\n`,
      );
    } catch (err) {
      process.stdout.write(
        `warn: could not reach MongoDB (${(err as Error).message}); seed was still patched\n`,
      );
    }
  }

  process.stdout.write(
    '\ndone. Restart `npm run dev` and the player will drive real audio —\n' +
      'the "Simulated playback" badge disappears on its own.\n',
  );
  process.exit(0);
}

void main();
