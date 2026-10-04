/**
 * How long a capture-queue entry stays in the "Bot activity" list.
 *
 * Only the queue entries (the Meet link and the bot's status for it) expire.
 * Recordings, transcripts and summaries are kept for good.
 */
export const RECORD_TTL_MS = 12 * 60 * 60 * 1000;

/** The oldest timestamp that is still listed, as an ISO string for queries. */
export function visibleSince(now = Date.now()): string {
  return new Date(now - RECORD_TTL_MS).toISOString();
}
