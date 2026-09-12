import React from 'react';
import { listMeetings, getTranscript, getAnalytics } from '@/lib/data';
import type { Meeting } from '@/lib/types';
import AppShell from '@/components/AppShell';

export default async function Home() {
  const meetings = (await listMeetings()) as Meeting[];
  const first = meetings[0] ?? null;

  const transcript = first ? await getTranscript(first.id) : null;
  const analytics = first ? await getAnalytics(first.id) : null;

  // Render the client AppShell, passing server-fetched meetings as initial
  // data. This keeps the initial paint server-rendered while the client
  // manages selection and interactivity.
  return <AppShell meetings={meetings} />;
}
