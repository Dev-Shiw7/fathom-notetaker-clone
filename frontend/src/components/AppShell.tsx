'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Meeting, Transcript, MeetingAnalytics, Summary } from '@/lib/types';
import MeetingList from './MeetingList';
import MainPlayer from './MainPlayer';
import SearchModal from './SearchModal';

interface Props {
  meetings: Meeting[];
}

export default function AppShell({ meetings }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(meetings[0]?.id ?? null);
  const [meeting, setMeeting] = useState<Meeting | null>(meetings[0] ?? null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [analytics, setAnalytics] = useState<MeetingAnalytics | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);

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
        setSummaries(json.summaries ?? []);
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

  // Global ⌘K / Ctrl+K shortcut to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    // optimistic set
    setMeeting(meetings.find((m) => m.id === id) ?? null);
    setTranscript(null);
    setAnalytics(null);
    setSummaries([]);
  };

  const handleSearchNavigate = useCallback((meetingId: string, startMs: number) => {
    if (meetingId !== selectedId) {
      handleSelect(meetingId);
    }
    setSeekTarget(startMs);
  }, [selectedId]);

  return (
    <div style={{display:'flex'}}>
      <MeetingList
        meetings={meetings}
        selectedId={selectedId}
        onSelect={handleSelect}
        onSearchClick={() => setSearchOpen(true)}
      />
      <div style={{flex:1}}>
        {meeting ? (
          <MainPlayer
            meeting={meeting}
            transcript={transcript}
            analytics={analytics}
            summaries={summaries}
            seekTarget={seekTarget}
            onSeekConsumed={() => setSeekTarget(null)}
          />
        ) : (
          <div style={{padding:20}}>Select a meeting</div>
        )}
      </div>
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={handleSearchNavigate}
      />
    </div>
  );
}
