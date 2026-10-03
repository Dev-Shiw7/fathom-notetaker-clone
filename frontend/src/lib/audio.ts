/**
 * Recording audio storage.
 *
 * The bot uploads a recording in small pieces as it goes, so a crash mid-call
 * loses seconds rather than the meeting. Pieces land in `audioChunks`; on
 * finalise they are joined (pieces of one MediaRecorder session concatenate
 * into a valid file) and moved into GridFS, which is what playback streams
 * from. Everything lives in the same Atlas database as the rest of the data,
 * so the deployed app needs no disk and no object store.
 */
import { Binary, GridFSBucket } from 'mongodb';
import { COLLECTIONS, db, hasMongo } from './mongo';

export class AudioUnavailableError extends Error {}

async function chunks() {
  if (!hasMongo) throw new AudioUnavailableError('Audio storage needs MONGODB_URI.');
  return (await db()).collection(COLLECTIONS.audioChunks);
}

async function bucket() {
  if (!hasMongo) throw new AudioUnavailableError('Audio storage needs MONGODB_URI.');
  return new GridFSBucket(await db(), { bucketName: 'audio' });
}

/** Idempotent per (session, seq): a retried upload overwrites rather than duplicates. */
export async function saveChunk(sessionId: string, seq: number, data: Buffer): Promise<void> {
  await (await chunks()).updateOne(
    { sessionId, seq },
    { $set: { sessionId, seq, data: new Binary(data), createdAt: new Date().toISOString() } },
    { upsert: true },
  );
}

/** Joins a session's pieces in order. Null when nothing was uploaded. */
export async function assembleChunks(sessionId: string): Promise<Buffer | null> {
  const docs = await (await chunks()).find({ sessionId }).sort({ seq: 1 }).toArray();
  if (docs.length === 0) return null;
  return Buffer.concat(docs.map((d) => Buffer.from((d.data as Binary).buffer)));
}

export async function dropChunks(sessionId: string): Promise<void> {
  await (await chunks()).deleteMany({ sessionId });
}

/** Stores the finished recording, replacing any earlier file for this meeting. */
export async function storeAudio(meetingId: string, data: Buffer, contentType: string): Promise<void> {
  const files = await bucket();
  for (const file of await files.find({ filename: meetingId }).toArray()) {
    await files.delete(file._id);
  }
  await new Promise<void>((resolve, reject) => {
    const upload = files.openUploadStream(meetingId, { metadata: { contentType } });
    upload.on('error', reject);
    upload.on('finish', () => resolve());
    upload.end(data);
  });
}

export interface AudioHandle {
  length: number;
  contentType: string;
  /** Streams bytes [start, end] inclusive. */
  read: (start: number, end: number) => ReadableStream<Uint8Array>;
}

export async function openAudio(meetingId: string): Promise<AudioHandle | null> {
  const files = await bucket();
  const file = await files.find({ filename: meetingId }).next();
  if (!file) return null;
  return {
    length: file.length,
    contentType: (file.metadata?.contentType as string) ?? 'audio/webm',
    read: (start, end) => {
      const node = files.openDownloadStream(file._id, { start, end: end + 1 });
      return new ReadableStream<Uint8Array>({
        start(controller) {
          node.on('data', (c: Buffer) => controller.enqueue(new Uint8Array(c)));
          node.on('end', () => controller.close());
          node.on('error', (e) => controller.error(e));
        },
        cancel() {
          node.destroy();
        },
      });
    },
  };
}
