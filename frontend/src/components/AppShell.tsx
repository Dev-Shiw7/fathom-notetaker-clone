'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Meeting, Transcript, MeetingAnalytics, Summary } from '@/lib/types';
import MeetingList from './MeetingList';
import MainPlayer from './MainPlayer';
import SearchModal from './SearchModal';
import { OPEN_SEARCH_EVENT } from './shell/CommandHint';

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
  // Only used below the sidebar breakpoint, where the rail becomes a drawer.
  const [railOpen, setRailOpen] = useState(false);

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

  // The header search button and `/` live in the layout, outside this tree, so
  // they ask for the modal by event rather than navigating to a route.
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, open);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      // optimistic set
      setMeeting(meetings.find((m) => m.id === id) ?? null);
      setTranscript(null);
      setAnalytics(null);
      setSummaries([]);
      // On small screens the rail covers the content it just changed.
      setRailOpen(false);
    },
    [meetings],
  );

  const handleSearchNavigate = useCallback(
    (meetingId: string, startMs: number) => {
      if (meetingId !== selectedId) {
        handleSelect(meetingId);
      }
      setSeekTarget(startMs);
    },
    [selectedId, handleSelect],
  );

  return (
    <div className="relative flex h-full min-h-0">
      {/* Sidebar rail. A fixed drawer under 900px, a static column above it. */}
      <div
        className={`z-30 w-[280px] shrink-0 transition-transform duration-200 max-[899px]:fixed max-[899px]:inset-y-0 max-[899px]:left-0 max-[899px]:shadow-[var(--shadow-lg)] ${
          railOpen
            ? 'max-[899px]:translate-x-0'
            : 'max-[899px]:-translate-x-full'
        }`}
      >
        <MeetingList
          meetings={meetings}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>

      {/* Scrim behind the drawer. */}
      {railOpen && (
        <button
          type="button"
          aria-label="Close meeting list"
          onClick={() => setRailOpen(false)}
          className="overlay-enter fixed inset-0 z-20 bg-black/45 min-[900px]:hidden"
        />
      )}

      <div className="min-w-0 flex-1">
        {meeting ? (
          <MainPlayer
            meeting={meeting}
            transcript={transcript}
            analytics={analytics}
            summaries={summaries}
            loading={loading}
            seekTarget={seekTarget}
            onSeekConsumed={() => setSeekTarget(null)}
            onOpenRail={() => setRailOpen(true)}
          />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-base font-semibold">No meeting selected</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Pick a meeting from the list to see its recording and summary.
              </p>
            </div>
          </div>
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
