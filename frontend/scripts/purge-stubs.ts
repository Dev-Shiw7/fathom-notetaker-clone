/**
 * One-off cleanup: removes everything produced by the old scripted capture
 * layer, and the canned collections that no longer have a reader.
 *
 *   - meetings tagged `stubbed` (the scripted Alice/Bob/Carol dialogue), with
 *     their transcripts, summaries and analytics
 *   - the `askThreads` and `upcoming` collections (hand-written Q&A and a fake
 *     calendar, replaced by retrieval over real transcripts and real .ics sync)
 *
 * Safe to re-run. Hand-authored seed meetings are never touched.
 *
 *   npx tsx --env-file=.env.local scripts/purge-stubs.ts
 */
import { MongoClient } from 'mongodb';

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 }).connect();
  const db = client.db(process.env.MONGODB_DB ?? 'notetaker');

  try {
    const stubs = await db.collection('meetings').find({ tags: 'stubbed' }).toArray();
    const ids = stubs.map((m) => m.id as string);
    console.log(`stubbed meetings: ${ids.length ? ids.join(', ') : 'none'}`);

    if (ids.length > 0) {
      await db.collection('meetings').deleteMany({ id: { $in: ids } });
      for (const name of ['transcripts', 'summaries', 'analytics', 'highlights', 'shares']) {
        const res = await db.collection(name).deleteMany({ meetingId: { $in: ids } });
        console.log(`  ${name}: removed ${res.deletedCount}`);
      }
    }

    for (const name of ['askThreads', 'upcoming']) {
      const exists = (await db.listCollections({ name }).toArray()).length > 0;
      if (exists) {
        await db.collection(name).drop();
        console.log(`dropped ${name}`);
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
