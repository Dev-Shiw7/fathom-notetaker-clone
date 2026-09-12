/**
 * MongoDB connection.
 *
 * Next.js recreates modules on every hot reload in development and runs many
 * concurrent lambdas in production, so the client is cached on `globalThis` —
 * without that, dev burns through Atlas connection limits within minutes.
 *
 * `MONGODB_URI` being unset is a supported state, not an error: the data layer
 * falls back to bundled seed content. That keeps the repo runnable by anyone
 * who clones it, with no database to provision.
 */
import { MongoClient, type Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? 'notetaker';

declare global {
  // eslint-disable-next-line no-var
  var __notetakerMongo: Promise<MongoClient> | undefined;
}

export const hasMongo = Boolean(uri);

function client(): Promise<MongoClient> {
  if (!uri) throw new Error('MONGODB_URI is not set');
  globalThis.__notetakerMongo ??= new MongoClient(uri, {
    // A public demo should fail fast and fall back rather than hang a page
    // load while Atlas is cold or unreachable.
    serverSelectionTimeoutMS: 5_000,
  }).connect();
  return globalThis.__notetakerMongo;
}

export async function db(): Promise<Db> {
  return (await client()).db(dbName);
}

export const COLLECTIONS = {
  meetings: 'meetings',
  transcripts: 'transcripts',
  summaries: 'summaries',
  analytics: 'analytics',
  highlights: 'highlights',
  shares: 'shares',
  askThreads: 'askThreads',
  upcoming: 'upcoming',
  templates: 'templates',
} as const;
