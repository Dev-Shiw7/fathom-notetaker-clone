'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AskThread, Meeting } from '@/lib/types';
import { formatWeekday, relativeDayGroup } from '@/lib/analytics';
import { CallCard } from './CallCard';
import { AskPanel } from '@/components/ask/AskPanel';
import { openSearch } from '@/components/shell/SearchField';
import { FolderPlusIcon, SearchIcon, UsersIcon } from '@/components/ui/Icon';

interface Props {
  meetings: Meeting[];
  threads: AskThread[];
  /**
   * The clock, read once on the server. Every relative date heading is derived
   * from this rather than from `Date.now()`, so the server and the browser
   * cannot disagree about what "Yesterday" means.
   */
  nowIso: string;
}

type TabId = 'mine' | 'team' | 'folders' | 'playlists';

const TABS: { id: TabId; label: string }[] = [
  { id: 'mine', label: 'My Calls' },
  { id: 'team', label: 'Team Calls' },
  { id: 'folders', label: 'Folders' },
  { id: 'playlists', label: 'Playlists' },
];

export function Library({ meetings, threads, nowIso }: Props) {
  const [tab, setTab] = useState<TabId>('mine');

  /**
   * Calls under their date heading. Consecutive rather than keyed, because the
   * list arrives newest-first and every bucket boundary is therefore a single
   * point in the sequence — a Map would let a later call re-open a heading
   * that has already been closed.
   */
  const groups = useMemo(() => {
    const out: { label: string; items: Meeting[] }[] = [];
    for (const meeting of meetings) {
      const label = relativeDayGroup(meeting.startedAt, nowIso);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(meeting);
      else out.push({ label, items: [meeting] });
    }
    return out;
  }, [meetings, nowIso]);

  const meetingTitles = useMemo(
    () => Object.fromEntries(meetings.map((m) => [m.id, m.title])),
    [meetings],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="tabs" role="tablist" aria-label="Call library">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls="library-panel"
            className="tab"
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {/* The library and its Ask column. The column drops away under 1100px,
          where two of them stop fitting side by side — see .library-split,
          which owns the track sizing. An inline `gridTemplateColumns` here
          would beat that media query and pin the 340px column open at every
          width, squeezing the library itself off the screen on a phone. */}
      <div className="library-split">
        <div
          className="library"
          role="tabpanel"
          id="library-panel"
          aria-labelledby={`tab-${tab}`}
        >
          {tab === 'mine' ? (
            meetings.length === 0 ? (
              <EmptyState
                icon={<SearchIcon size={22} />}
                title="No calls yet"
                body="Connect a calendar and Recap will join your meetings and file them here."
                action={{ href: '/settings', label: 'Connect a calendar' }}
              />
            ) : (
              groups.map((group) => (
                <section key={group.label}>
                  <h2 className="date-heading">{group.label}</h2>
                  <div className="call-grid">
                    {group.items.map((meeting) => (
                      <CallCard
                        key={meeting.id}
                        meeting={meeting}
                        dayLabel={formatWeekday(meeting.startedAt)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )
          ) : tab === 'team' ? (
            <EmptyState
              icon={<UsersIcon size={22} />}
              title="No team calls"
              body="This workspace has no other members, so every call is already in My Calls. Team sharing arrives with accounts."
            />
          ) : tab === 'folders' ? (
            <EmptyState
              icon={<FolderPlusIcon size={22} />}
              title="No folders yet"
              body="Folders group related calls — a deal, an account, a project. Nothing has been filed into one."
            />
          ) : (
            <EmptyState
              icon={<SearchIcon size={22} />}
              title="No playlists yet"
              body="A playlist is a run of clips cut from different calls. Drag across a call's timeline to cut your first one."
            />
          )}
        </div>

        <AskPanel
          threads={threads}
          meetingTitles={meetingTitles}
          heading="Ask Recap"
        />
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-[440px] px-4 py-20 text-center">
      <span
        aria-hidden
        className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-faint)]"
      >
        {icon}
      </span>
      <h2 className="text-[17px] font-bold">{title}</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
        {body}
      </p>
      {action ? (
        <Link href={action.href} className="btn primary mt-5">
          {action.label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={openSearch}
          className="btn mt-5"
          title="Search across every transcript"
        >
          <SearchIcon size={14} />
          Search every transcript
        </button>
      )}
    </div>
  );
}
