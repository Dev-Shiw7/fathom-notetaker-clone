'use client';

import React, { useMemo } from 'react';
import type { Meeting } from '@/lib/types';
import { formatDuration, formatMeetingDate } from '@/lib/analytics';
import { PlayIcon, PlusIcon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

interface Props {
  meetings: Meeting[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Groups meetings under their date heading.
 *
 * Deliberately keyed on the absolute formatted date rather than "Today" /
 * "Yesterday": this list is server-rendered first, and anything derived from
 * `Date.now()` would disagree between server and client — the exact hydration
 * mismatch that `formatMeetingDate` exists to prevent.
 */
function groupByDate(meetings: Meeting[]) {
  const groups: { label: string; items: Meeting[] }[] = [];
  for (const meeting of meetings) {
    const label = formatMeetingDate(meeting.startedAt) || 'Undated';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(meeting);
    else groups.push({ label, items: [meeting] });
  }
  return groups;
}

export default function MeetingList({ meetings, selectedId, onSelect }: Props) {
  const { toast } = useToast();
  const groups = useMemo(() => groupByDate(meetings), [meetings]);

  return (
    <aside className="sidebar">
      {/*
        Two things used to sit above this button and both were duplicates: the
        "Cadence" wordmark, directly below the same wordmark in the header, and
        a readonly "Search all meetings… ⌘K" box opening the same modal as the
        header's search button a few hundred pixels to the right. The rail is
        now purely the meeting list.
      */}
      <button
        type="button"
        className="new-btn mt-4"
        onClick={() =>
          toast(
            'Recording is stubbed in this demo — queue a meeting from Calendar & bot instead.',
            'info',
            5000,
          )
        }
      >
        <PlusIcon size={14} />
        Record a meeting
      </button>

      <div className="meeting-list">
        {meetings.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-[var(--text-faint)]">
            No meetings yet.
            <br />
            Connect a calendar to start capturing them.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label}>
              <h2 className="section-label mx-2.5 mb-2 mt-3">{group.label}</h2>
              {group.items.map((meeting) => {
                const active = meeting.id === selectedId;
                return (
                  <button
                    key={meeting.id}
                    type="button"
                    // A row that changes what the whole screen shows must be a
                    // real button — this was a <div onClick>, invisible to the
                    // keyboard and to screen readers.
                    aria-current={active ? 'true' : undefined}
                    className={`m-card ${active ? 'active' : ''}`}
                    onClick={() => onSelect(meeting.id)}
                  >
                    <span className="m-thumb" aria-hidden>
                      <PlayIcon size={13} />
                    </span>
                    <span className="m-info">
                      <span className="m-title block" title={meeting.title}>
                        {meeting.title}
                      </span>
                      <span className="m-sub">
                        {formatDuration(meeting.durationMs)}
                        <span aria-hidden>·</span>
                        {meeting.participants.length}{' '}
                        {meeting.participants.length === 1 ? 'person' : 'people'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
