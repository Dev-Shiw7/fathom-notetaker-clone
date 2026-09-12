'use client';

import React, { useEffect, useState } from 'react';
import type { Meeting, Transcript, MeetingAnalytics } from '@/lib/types';
import MeetingList from './MeetingList';
import MainPlayer from './MainPlayer';

interface Props {
  meetings: Meeting[];
}

export default function AppShell({ meetings }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(meetings[0]?.id ?? null);
  const [meeting, setMeeting] = useState<Meeting | null>(meetings[0] ?? null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [analytics, setAnalytics] = useState<MeetingAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // load details for initial meeting
    if (!selectedId) return;
    let mounted = true;
    setLoading(true);
    fetch(`/api/meeting/${selectedId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!mounted) return;
        setMeeting(json.meeting ?? null);
        setTranscript(json.transcript ?? null);
        setAnalytics(json.analytics ?? null);
      })
      .catch(() => {
        if (!mounted) return;
        setMeeting(meetings.find((m) => m.id === selectedId) ?? null);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    // optimistic set
    setMeeting(meetings.find((m) => m.id === id) ?? null);
    setTranscript(null);
    setAnalytics(null);
  };

  return (
    <div style={{display:'flex'}}>
      <MeetingList meetings={meetings} selectedId={selectedId} onSelect={handleSelect} />
      <div style={{flex:1}}>
        {meeting ? (
          <MainPlayer meeting={meeting} transcript={transcript} analytics={analytics} />
        ) : (
          <div style={{padding:20}}>Select a meeting</div>
        )}
      </div>
    </div>
  );
}
