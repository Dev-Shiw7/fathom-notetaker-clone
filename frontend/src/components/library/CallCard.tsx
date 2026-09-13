'use client';

import Link from 'next/link';
import type { Meeting } from '@/lib/types';
import { formatDuration } from '@/lib/analytics';
import { PLATFORM_LABEL } from '@/lib/platforms';
import { PlayIcon } from '@/components/ui/Icon';

interface Props {
  meeting: Meeting;
  /** Weekday shown under the title, pre-formatted by the server. */
  dayLabel: string;
}

/** More tiles than this and each one is too small to read an initial in. */
const MAX_TILES = 3;

export function CallCard({ meeting, dayLabel }: Props) {
  const tiles = meeting.participants.slice(0, MAX_TILES);
  const overflow = meeting.participants.length - tiles.length;

  return (
    <Link href={`/calls/${meeting.id}`} className="call-card">
      <div className="call-thumb">
        {/*
          A recording still would sit here in a product with video. This build
          captures audio and transcripts, so the frame is drawn from what the
          call actually was rather than faking a screenshot of one.
        */}
        <div className="call-stage">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/40">
            {PLATFORM_LABEL[meeting.platform]}
          </span>
          {/* The blurb rather than the title: the title is already the heading
              directly below the frame, and printing it twice wastes the one
              place a card can say something new about the call. */}
          <span className="line-clamp-3 text-[12.5px] font-medium leading-snug text-white/75">
            {meeting.blurb}
          </span>
          <span aria-hidden className="h-[3px] w-10 rounded-full bg-white/25" />

          <span className="call-dur">{formatDuration(meeting.durationMs)}</span>
        </div>

        <div className="call-tiles" aria-hidden>
          {tiles.map((person, index) => {
            const last = index === tiles.length - 1;
            return (
              <span
                key={person.id}
                className="call-tile"
                style={{
                  background: `linear-gradient(150deg, ${person.color}, ${person.color}99)`,
                }}
              >
                {last && overflow > 0 ? `+${overflow}` : person.initials}
              </span>
            );
          })}
        </div>

        <span className="call-play">
          <span>
            <PlayIcon size={18} />
          </span>
        </span>
      </div>

      <h3 className="call-title">{meeting.title}</h3>

      <div className="call-meta">
        <span>{dayLabel}</span>
        {meeting.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
        <span>
          {meeting.participants.length}{' '}
          {meeting.participants.length === 1 ? 'person' : 'people'}
        </span>
      </div>
    </Link>
  );
}
