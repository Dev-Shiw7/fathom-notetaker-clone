import { listMeetings } from '@/lib/data';
import { Library } from '@/components/library/Library';

/**
 * The call library — the app's home.
 *
 * Dynamic rather than prerendered for two reasons: the meeting list is
 * database-backed and changes whenever the bot files a recording, and the date
 * headings ("Yesterday", "Last Week") are relative to the clock read below. A
 * build-time render would freeze both.
 */
export const dynamic = 'force-dynamic';

export default async function Home() {
  const meetings = await listMeetings();

  return (
    <Library
      meetings={meetings}
      nowIso={new Date().toISOString()}
    />
  );
}
