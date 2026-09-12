/**
 * Loads the bundled seed dataset into MongoDB.
 *
 * The data layer treats `MONGODB_URI` being set as "the database is the source
 * of truth" and stops falling back to bundled content — so pointing the app at
 * a fresh Atlas cluster without running this yields an empty, working-looking
 * UI, which is the worst failure mode available. This script closes that gap.
 *
 * It is idempotent: every collection it owns is cleared and rewritten, so
 * running it twice leaves the same state as running it once. Collections the
 * app writes at runtime (highlights, shares) are seeded the same way, which
 * means re-running discards visitor-created highlights. That is the right
 * trade for a seed command, but it is why this is not run automatically.
 *
 *   npm run seed -w @notetaker/frontend
 */
import { MongoClient } from 'mongodb';
import { COLLECTIONS } from '../src/lib/mongo';
import {
  SEED_ASK_THREADS,
  SEED_HIGHLIGHTS,
  SEED_MEETINGS,
  SEED_UPCOMING,
} from '../src/seed';
import { TEMPLATES } from '../src/seed/templates';

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    // Not an error worth a stack trace — the app runs fine without Mongo.
    process.stderr.write(
      'MONGODB_URI is not set. Nothing to seed: the app serves bundled seed\n' +
        'data in that mode already. Set it in frontend/.env.local to use Atlas.\n',
    );
    process.exitCode = 1;
    return;
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? 'notetaker');

  try {
    const documents: Record<string, unknown[]> = {
      [COLLECTIONS.meetings]: SEED_MEETINGS.map((m) => m.meeting),
      [COLLECTIONS.transcripts]: SEED_MEETINGS.map((m) => m.transcript),
      [COLLECTIONS.summaries]: SEED_MEETINGS.flatMap((m) => m.summaries),
      [COLLECTIONS.analytics]: SEED_MEETINGS.map((m) => m.analytics),
      [COLLECTIONS.highlights]: SEED_HIGHLIGHTS,
      [COLLECTIONS.upcoming]: SEED_UPCOMING,
      [COLLECTIONS.askThreads]: SEED_ASK_THREADS,
      [COLLECTIONS.templates]: TEMPLATES,
      [COLLECTIONS.shares]: [],
    };

    for (const [name, docs] of Object.entries(documents)) {
      const collection = db.collection(name);
      await collection.deleteMany({});
      if (docs.length > 0) {
        // Cloned, because insertMany mutates its input by stamping `_id` —
        // which would then leak into anything else reading the seed module.
        await collection.insertMany(docs.map((d) => ({ ...(d as object) })));
      }
      process.stdout.write(`${name.padEnd(12)} ${docs.length}\n`);
    }

    // Lookups the app does on every page load; without these Atlas does a
    // collection scan per request, which is slow enough to notice on a free tier.
    await db.collection(COLLECTIONS.meetings).createIndex({ id: 1 }, { unique: true });
    await db.collection(COLLECTIONS.transcripts).createIndex({ meetingId: 1 });
    await db.collection(COLLECTIONS.summaries).createIndex({ meetingId: 1 });
    await db.collection(COLLECTIONS.analytics).createIndex({ meetingId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.highlights).createIndex({ meetingId: 1 });
    await db.collection(COLLECTIONS.shares).createIndex({ token: 1 }, { unique: true });

    process.stdout.write(`\nSeeded ${db.databaseName}.\n`);
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`seed failed: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
