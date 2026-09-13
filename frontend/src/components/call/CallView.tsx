'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  AskThread,
  Meeting,
  MeetingAnalytics,
  Summary,
  Transcript,
} from '@/lib/types';
import { usePlayback } from '@/components/player/usePlayback';
import { TalkRibbon } from '@/components/player/TalkRibbon';
import { TranscriptList } from '@/components/transcript/TranscriptList';
import { AskPanel } from '@/components/ask/AskPanel';
import { TEMPLATES } from '@/seed/templates';
import {
  formatDuration,
  formatMeetingDate,
  formatTimestamp,
} from '@/lib/analytics';
import { PLATFORM_LABEL } from '@/lib/platforms';
import { SEEK_EVENT, type SeekEventDetail } from '@/lib/events';
import { useToast } from '@/components/ui/Toast';
import {
  Back10Icon,
  BotIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ClockIcon,
  DocIcon,
  FolderPlusIcon,
  Forward10Icon,
  InfoIcon,
  LinkIcon,
  LinkedInIcon,
  MailIcon,
  PauseIcon,
  PlayIcon,
  SparkleIcon,
  SpinnerIcon,
  UserIcon,
  UsersIcon,
} from '@/components/ui/Icon';

interface RelatedCall {
  id: string;
  title: string;
  startedAt: string;
}

interface Props {
  meeting: Meeting;
  transcript: Transcript | null;
  analytics: MeetingAnalytics | null;
  summaries: Summary[];
  threads: AskThread[];
  related: RelatedCall[];
  meetingTitles: Record<string, string>;
  initialSeekMs: number | null;
}

const SPEEDS = [1, 1.25, 1.5, 2] as const;

/** Stage height bounds, in px. Below MIN the stage snaps shut. */
const STAGE_DEFAULT = 260;
const STAGE_MIN = 140;
const STAGE_MAX = 680;
const STAGE_KEY = 'recap-stage-height';
/** Sentinel stored when the user has collapsed the player entirely. */
const STAGE_COLLAPSED = 0;

type TabId = 'summary' | 'transcript' | 'ask';

export function CallView({
  meeting,
  transcript,
  analytics,
  summaries,
  threads,
  related,
  meetingTitles,
  initialSeekMs,
}: Props) {
  const duration = meeting.durationMs;
  const audioUrl = meeting.audioUrl;
  const pb = usePlayback(duration, audioUrl);
  const { toast } = useToast();

  const [tab, setTab] = useState<TabId>('summary');
  const [botJoining, setBotJoining] = useState(false);
  // Auto-scroll state lives here because TranscriptList is controlled. It was
  // previously hardcoded `following={true}` with a no-op setter, so the
  // "Auto-scroll" chip did nothing and the transcript yanked itself back to
  // the playhead while you were reading further down.
  const [following, setFollowing] = useState(true);
  const [templateId, setTemplateId] = useState(
    () => summaries[0]?.templateId ?? '',
  );
  /** Ticked action items. Local to the visit, and the UI says as much. */
  const [done, setDone] = useState<Record<string, boolean>>({});

  /*
   * How tall the video stage is. Starts at the default so server and client
   * render identically, then adopts the stored preference after mount —
   * reading localStorage during render would be a hydration mismatch.
   */
  const [stageHeight, setStageHeight] = useState(STAGE_DEFAULT);
  const [dragging, setDragging] = useState(false);
  /** Height to restore when expanding from collapsed. */
  const lastOpenHeight = useRef(STAGE_DEFAULT);

  useEffect(() => {
    try {
      // Read the raw string first: getItem returns null when the key is absent
      // and Number(null) is 0, which sails through a `isFinite && >= 0` check
      // and collapses the player for every first-time visitor.
      const raw = localStorage.getItem(STAGE_KEY);
      if (raw !== null) {
        const stored = Number(raw);
        if (Number.isFinite(stored) && stored >= 0) {
          setStageHeight(stored);
          if (stored > 0) lastOpenHeight.current = stored;
        }
      }
    } catch {
      // Blocked storage just means the default height, which is fine.
    }
  }, []);

  const persistHeight = useCallback((height: number) => {
    try {
      localStorage.setItem(STAGE_KEY, String(height));
    } catch {
      // Non-fatal: the size simply will not survive a reload.
    }
  }, []);

  const applyHeight = useCallback(
    (height: number) => {
      const clamped =
        height < STAGE_MIN / 2
          ? STAGE_COLLAPSED
          : Math.min(STAGE_MAX, Math.max(STAGE_MIN, height));
      setStageHeight(clamped);
      if (clamped > 0) lastOpenHeight.current = clamped;
      persistHeight(clamped);
    },
    [persistHeight],
  );

  const toggleStage = useCallback(() => {
    applyHeight(stageHeight === STAGE_COLLAPSED ? lastOpenHeight.current : 0);
  }, [stageHeight, applyHeight]);

  /** Drag the strip under the player to resize it. */
  const onResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = stageHeight;
    setDragging(true);

    const move = (moveEvent: PointerEvent) => {
      const next = startHeight + (moveEvent.clientY - startY);
      // Live feedback tracks the pointer; the final value is clamped on release.
      setStageHeight(
        next < STAGE_MIN / 2 ? 0 : Math.min(STAGE_MAX, Math.max(STAGE_MIN, next)),
      );
    };

    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
      applyHeight(startHeight + (upEvent.clientY - startY));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const stageCollapsed = stageHeight === STAGE_COLLAPSED;

  // A search hit or a citation arrives as `?t=`, read once on mount. Keyed on
  // the value so following a second link to the same call still moves the
  // playhead.
  useEffect(() => {
    if (initialSeekMs != null) pb.seek(initialSeekMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeekMs]);

  // The search dialog lives in the root layout, outside this tree, so it asks
  // for a seek by event rather than by prop.
  useEffect(() => {
    const onSeekRequest = (event: Event) => {
      const detail = (event as CustomEvent<SeekEventDetail>).detail;
      if (detail?.meetingId === meeting.id) pb.seek(detail.ms);
    };
    window.addEventListener(SEEK_EVENT, onSeekRequest);
    return () => window.removeEventListener(SEEK_EVENT, onSeekRequest);
  }, [meeting.id, pb]);

  /** Transport shortcuts, matching what the Help menu advertises. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      // The ribbon is a slider and handles its own arrows when focused.
      if (target?.getAttribute('role') === 'slider') return;

      if (event.key === ' ') {
        event.preventDefault();
        pb.toggle();
      } else if (event.key === 'ArrowLeft') {
        pb.nudge(-5_000);
      } else if (event.key === 'ArrowRight') {
        pb.nudge(5_000);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pb]);

  const turns = transcript?.turns ?? [];

  /** The turn under the playhead — what the live caption should show. */
  const activeTurn = useMemo(() => {
    let current = null as (typeof turns)[number] | null;
    for (const turn of turns) {
      if (turn.startMs <= pb.positionMs) current = turn;
      else break;
    }
    return current;
  }, [turns, pb.positionMs]);

  const participantsById = useMemo(
    () => new Map(meeting.participants.map((p) => [p.id, p] as const)),
    [meeting.participants],
  );

  const activeSpeaker = activeTurn
    ? participantsById.get(activeTurn.speakerId) ?? null
    : null;

  /**
   * Speaker legend for the ribbon, busiest first. Without it the ribbon is a
   * row of anonymous coloured blocks — the colours only mean something once
   * they are tied to a name.
   */
  const legend = useMemo(() => {
    if (!analytics?.speakers?.length) return [];
    return [...analytics.speakers]
      .sort((a, b) => b.talkMs - a.talkMs)
      .map((stat) => ({ stat, person: participantsById.get(stat.speakerId) }))
      .filter((row) => row.person);
  }, [analytics, participantsById]);

  /** Talk share by speaker id, for the attendee rows in the rail. */
  const shareById = useMemo(
    () =>
      new Map(
        (analytics?.speakers ?? []).map(
          (stat) => [stat.speakerId, stat.talkShare] as const,
        ),
      ),
    [analytics],
  );

  const summary =
    summaries.find((entry) => entry.templateId === templateId) ??
    summaries[0] ??
    null;

  const templateName = (id: string) =>
    TEMPLATES.find((template) => template.id === id)?.name ?? id;

  const handleAddBot = async () => {
    try {
      setBotJoining(true);

      const response = await fetch('/api/bot/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id,
          meetingUrl: `https://meet.google.com/${meeting.id}`,
          botName: 'Recap Notetaker',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // A stubbed capture layer is a deliberate decision, not a failure —
        // say what it is and how to run the real bot, rather than "Error:".
        if (data.stubbed) {
          toast(`${data.error} ${data.detail ?? ''}`.trim(), 'info', 7000);
        } else {
          toast(data.error ?? 'Could not start the bot.', 'error');
        }
        return;
      }

      toast('Recap is joining the meeting.', 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBotJoining(false);
    }
  };

  /**
   * Turns a ribbon drag into a real, openable link.
   *
   * This used to raise a toast and discard the range, while `createShare` sat
   * unused in the data layer and `/share/[token]` did not exist — the whole
   * flow was a gesture with nothing behind it.
   */
  const handleCreateClip = async (startMs: number, endMs: number) => {
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meeting.id, startMs, endMs }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast(data.error ?? 'Could not create that clip.', 'error');
        return;
      }

      const url = `${window.location.origin}/share/${data.share.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast(
          `Clip ${formatTimestamp(startMs)}–${formatTimestamp(endMs)} — link copied to clipboard.`,
          'success',
          6000,
        );
      } catch {
        // Clipboard blocked outside a secure context; the link still exists,
        // so hand it over rather than losing the clip they just cut.
        toast(`Clip created: ${url}`, 'success', 10000);
      }
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const copy = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(success, 'success');
    } catch {
      // Clipboard access is denied outside a secure context, and silently
      // doing nothing looks identical to a broken button.
      toast('Could not copy — your browser blocked clipboard access.', 'error');
    }
  };

  /** The summary as plain text, which is the form people paste it in. */
  const summaryAsText = () => {
    if (!summary) return '';
    const lines = [
      meeting.title,
      formatMeetingDate(meeting.startedAt),
      '',
      'MEETING PURPOSE',
      summary.tldr,
    ];

    if (summary.keyPoints.length) {
      lines.push('', 'KEY TAKEAWAYS');
      for (const point of summary.keyPoints) {
        lines.push(`• ${point.text} [${formatTimestamp(point.citation.startMs)}]`);
      }
    }

    if (summary.actionItems.length) {
      lines.push('', 'ACTION ITEMS');
      for (const item of summary.actionItems) {
        const owner = item.ownerId
          ? participantsById.get(item.ownerId)?.name ?? 'Unassigned'
          : 'Unassigned';
        lines.push(
          `• ${item.text} — ${owner} [${formatTimestamp(item.citation.startMs)}]`,
        );
      }
    }

    return lines.join('\n');
  };

  return (
    <div className="call-view">
      <div className="call-left">
        {/* The hook has always returned an audioRef, but nothing ever rendered
            an element for it — so meetings that do have audio still played
            nothing but the synthetic clock. */}
        {audioUrl && (
          <audio
            ref={pb.audioRef}
            src={audioUrl}
            preload="metadata"
            className="hidden"
          />
        )}

        {/* Below 1080px the rail is hidden, so this is the only way back. */}
        <Link
          href="/"
          className="tap mb-3 inline-flex shrink-0 items-center gap-1.5 self-start text-[12.5px] font-bold text-[var(--text-muted)]"
        >
          <ChevronLeftIcon size={14} />
          All calls
        </Link>

        <div
          className={`player-stage ${dragging ? 'dragging' : ''}`}
          style={{ height: stageHeight }}
        >
          <div className="player">
            <button
              className="center-play"
              onClick={() => pb.toggle()}
              aria-label={pb.playing ? 'Pause recording' : 'Play recording'}
            >
              {pb.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
            </button>

            {/* Who is talking right now, drawn from the same playhead the
                transcript uses. */}
            {activeSpeaker && (
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/45 py-1 pl-1 pr-3 backdrop-blur-sm">
                <span
                  aria-hidden
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: activeSpeaker.color }}
                >
                  {activeSpeaker.initials}
                </span>
                <span className="text-[12px] font-semibold text-white/95">
                  {activeSpeaker.name}
                </span>
              </div>
            )}

            {/* The caption used to be pinned to turns[0] forever, so it showed
                the meeting's opening line no matter where you scrubbed to. */}
            {activeTurn ? (
              <p className="caption">{activeTurn.text}</p>
            ) : (
              /* At rest the frame would otherwise be an empty gradient, which
                 reads as a recording that failed to load rather than one that
                 has not been started. */
              <div className="pointer-events-none absolute inset-x-4 bottom-4">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/40">
                  {PLATFORM_LABEL[meeting.platform]} · recording
                </p>
                <p className="mt-1 text-[14px] font-bold leading-snug text-white/85">
                  {meeting.title}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Drag to resize the stage; double-click to collapse or restore. */}
        <button
          type="button"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the video area"
          aria-valuenow={stageHeight}
          aria-valuemin={0}
          aria-valuemax={STAGE_MAX}
          title="Drag to resize · double-click to collapse"
          className="player-resize"
          onPointerDown={onResizeStart}
          onDoubleClick={toggleStage}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') applyHeight(stageHeight - 32);
            if (event.key === 'ArrowDown') applyHeight(stageHeight + 32);
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleStage();
            }
          }}
        />

        {/* The scrubber. Every turn drawn in its speaker's colour, so the shape
            of the hour is readable before a single number is. */}
        <div className="shrink-0">
          <TalkRibbon
            durationMs={duration}
            turns={turns}
            participants={meeting.participants}
            highlights={[]}
            positionMs={pb.positionMs}
            onSeek={(ms) => pb.seek(ms)}
            onCreateClip={handleCreateClip}
          />
        </div>

        {/* Transport. Every control here is an existing usePlayback method
            that previously had no UI at all. */}
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
          <button
            className="btn btn-icon"
            onClick={toggleStage}
            aria-expanded={!stageCollapsed}
            title={
              stageCollapsed
                ? 'Show the video area'
                : 'Hide the video area and give the transcript the space'
            }
            aria-label={stageCollapsed ? 'Show video area' : 'Hide video area'}
          >
            {stageCollapsed ? (
              <ChevronDownIcon size={15} />
            ) : (
              <ChevronUpIcon size={15} />
            )}
          </button>

          <button
            className="btn btn-icon"
            onClick={() => pb.nudge(-10_000)}
            title="Back 10 seconds"
            aria-label="Back 10 seconds"
          >
            <Back10Icon size={15} />
          </button>
          <button
            className="btn btn-icon"
            onClick={() => pb.toggle()}
            title={pb.playing ? 'Pause' : 'Play'}
            aria-label={pb.playing ? 'Pause' : 'Play'}
          >
            {pb.playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
          </button>
          <button
            className="btn btn-icon"
            onClick={() => pb.nudge(10_000)}
            title="Forward 10 seconds"
            aria-label="Forward 10 seconds"
          >
            <Forward10Icon size={15} />
          </button>

          <span className="ml-1 font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]">
              {formatTimestamp(pb.positionMs)}
            </span>
            {' / '}
            {formatTimestamp(duration)}
          </span>

          {/*
            Lives in the transport rather than on the video, so it survives the
            stage being collapsed. A player that looks like it is playing but
            makes no sound reads as a broken build; saying why turns it into a
            stated limitation.
          */}
          {!pb.hasAudio && (
            <span
              title="This call has no stitched audio track. The playhead advances on a timer so the transcript, ribbon and citations all stay in sync."
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-muted)]"
            >
              <InfoIcon size={11} />
              Simulated playback
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              Speed
            </span>
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => pb.setRate(speed)}
                aria-pressed={pb.rate === speed}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition duration-150 hover:scale-110 active:scale-95 ${
                  pb.rate === speed
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
                }`}
              >
                {speed}×
              </button>
            ))}
          </div>
        </div>

        {/* Ribbon legend — makes the colours mean something.
            Wraps rather than scrolls horizontally: a single `overflow-x-auto`
            row saved ~22px but bought a horizontal scrollbar under the legend,
            and a scrollbar you have to drag to read a *legend* is worse than a
            second line. */}
        {legend.length > 0 && (
          <ul className="mt-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
            {legend.map(({ stat, person }) => (
              <li
                key={stat.speakerId}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-[var(--text-muted)]"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: person!.color }}
                />
                <span className="font-semibold text-[var(--text)]">
                  {person!.name}
                </span>
                <span className="tabular-nums">
                  {Math.round(stat.talkShare * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="vtabs" role="tablist" aria-label="Call detail">
          {(
            [
              ['summary', 'Summary'],
              ['transcript', 'Transcript'],
              ['ask', 'Ask Recap'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`vtab-${id}`}
              aria-selected={tab === id}
              aria-controls="vpanel"
              className="vtab"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="vpanel"
          role="tabpanel"
          id="vpanel"
          aria-labelledby={`vtab-${tab}`}
        >
          {tab === 'summary' && (
            <div className="vscroll">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {/* Fathom's "Enhanced" dropdown. Here it switches between the
                    summary templates this call actually has, which is a real
                    choice rather than a label. */}
                {summaries.length > 1 ? (
                  <label className="btn cursor-pointer gap-1.5">
                    <SparkleIcon size={13} className="text-[var(--accent)]" />
                    <span className="sr-only">Summary template</span>
                    <select
                      value={summary?.templateId ?? ''}
                      onChange={(event) => setTemplateId(event.target.value)}
                      className="cursor-pointer border-none bg-transparent font-bold text-[var(--text)] outline-none"
                    >
                      {summaries.map((entry) => (
                        <option key={entry.templateId} value={entry.templateId}>
                          {templateName(entry.templateId)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : summary ? (
                  <span className="btn cursor-default">
                    <SparkleIcon size={13} className="text-[var(--accent)]" />
                    {templateName(summary.templateId)}
                  </span>
                ) : null}

                <span
                  className="btn cursor-default"
                  title={`Transcribed in ${transcript?.language ?? 'en-US'}`}
                >
                  {(transcript?.language ?? 'en').slice(0, 2).toUpperCase()}
                </span>

                <button
                  type="button"
                  className="btn primary ml-auto"
                  disabled={!summary}
                  onClick={() =>
                    copy(summaryAsText(), 'Summary copied to clipboard.')
                  }
                >
                  <DocIcon size={14} />
                  Copy Summary
                </button>
              </div>

              {summary ? (
                <div className="space-y-7">
                  <section>
                    <h3 className="sec-title">Meeting purpose</h3>
                    <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-raised)] p-3.5 text-[13.5px] leading-relaxed">
                      {summary.tldr}
                    </p>
                  </section>

                  {summary.keyPoints.length > 0 && (
                    <section>
                      <h3 className="sec-title">Key takeaways</h3>
                      <ul className="space-y-2.5">
                        {summary.keyPoints.map((point, index) => (
                          <li
                            key={index}
                            className="flex gap-2.5 text-[13px] leading-relaxed text-[var(--text-muted)]"
                          >
                            <span
                              aria-hidden
                              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                            />
                            <span>
                              {point.text}{' '}
                              <button
                                type="button"
                                onClick={() => pb.seek(point.citation.startMs)}
                                title="Jump to the moment this came from"
                                className="tap font-mono text-[11px] font-bold text-[var(--accent)]"
                              >
                                {formatTimestamp(point.citation.startMs)}
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {summary.topics.length > 0 && (
                    <section>
                      <h3 className="sec-title">Topics discussed</h3>
                      <ul className="space-y-3">
                        {summary.topics.map((topic, index) => (
                          <li key={index}>
                            <button
                              type="button"
                              onClick={() => pb.seek(topic.startMs)}
                              title="Jump to this topic"
                              className="tap mb-0.5 flex items-baseline gap-2 text-left text-[13px] font-bold"
                            >
                              <span>{topic.title}</span>
                              <span className="shrink-0 font-mono text-[11px] font-semibold text-[var(--accent)]">
                                {formatTimestamp(topic.startMs)}
                              </span>
                            </button>
                            <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                              {topic.summary}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              ) : (
                <EmptyPanel text="No summary has been generated for this call yet." />
              )}
            </div>
          )}

          {tab === 'transcript' &&
            (turns.length === 0 ? (
              <div className="vscroll">
                <EmptyPanel text="No transcript was captured for this call." />
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center justify-between gap-3 py-3">
                  <p className="text-[12px] text-[var(--text-muted)]">
                    {turns.length} turns · click any line to jump there
                  </p>
                  {/*
                    This was a static <div> that always rendered as "on". It is
                    now a real toggle bound to the state TranscriptList already
                    accepts.
                  */}
                  <button
                    type="button"
                    onClick={() => setFollowing((on) => !on)}
                    aria-pressed={following}
                    title="Keep the transcript scrolled to the playhead"
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition duration-150 hover:scale-105 active:scale-95 ${
                      following
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]'
                    }`}
                  >
                    Auto-scroll {following ? 'on' : 'off'}
                  </button>
                </div>

                <TranscriptList
                  turns={turns}
                  participants={meeting.participants}
                  positionMs={pb.positionMs}
                  onSeek={(ms) => pb.seek(ms)}
                  following={following}
                  onFollowingChange={setFollowing}
                />
              </>
            ))}

          {tab === 'ask' && (
            <AskPanel
              threads={threads}
              meetingTitles={meetingTitles}
              currentMeetingId={meeting.id}
              onSeek={(ms) => pb.seek(ms)}
              heading="Ask about this call"
              bare
            />
          )}
        </div>
      </div>

      <aside className="rail">
        <h1 className="rail-title">{meeting.title}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon size={13} />
            {formatMeetingDate(meeting.startedAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon size={13} />
            {formatDuration(meeting.durationMs)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersIcon size={13} />
            {meeting.participants.length}
          </span>
        </div>

        <button
          type="button"
          className="tap mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-muted)]"
          onClick={() =>
            toast(
              'Folders arrive with accounts — there is nobody to file this for yet.',
              'info',
              5000,
            )
          }
        >
          <FolderPlusIcon size={14} />
          Add to Folder
        </button>

        <button
          type="button"
          className="share-bar"
          onClick={() =>
            copy(window.location.href, 'Link to this call copied to clipboard.')
          }
        >
          Share
          <LinkIcon size={16} />
        </button>

        <button
          type="button"
          className="btn mt-2 w-full justify-center"
          onClick={handleAddBot}
          disabled={botJoining}
          title="Queue the capture bot for this meeting"
        >
          {botJoining ? <SpinnerIcon size={14} /> : <BotIcon size={14} />}
          {botJoining ? 'Starting…' : 'Send Recap to this meeting'}
        </button>

        <h2 className="rail-label">Attendees</h2>
        <ul>
          {meeting.participants.map((person) => {
            const share = shareById.get(person.id);
            return (
              <li key={person.id} className="attendee">
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: person.color }}
                >
                  {person.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="attendee-name block truncate">
                    {person.name}
                    {person.isHost && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
                        host
                      </span>
                    )}
                  </span>
                  <span className="attendee-sub block truncate">
                    {person.role ?? 'Attendee'}
                    {/* Talk share is the one fact about an attendee this app
                        actually knows, so it sits where Fathom puts a job
                        title it scraped from somewhere else. */}
                    {share != null && ` · ${Math.round(share * 100)}% talk`}
                  </span>
                </span>
                {person.isExternal && (
                  <span
                    className="shrink-0 text-[var(--text-faint)]"
                    title={`${person.name} is outside ${person.org ?? 'your organisation'}`}
                  >
                    <LinkedInIcon size={14} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {related.length > 0 && (
          <>
            <h2 className="rail-label">Related</h2>
            <ul className="space-y-1">
              {related.map((other) => (
                <li key={other.id}>
                  <Link
                    href={`/calls/${other.id}`}
                    className="tap-surface block rounded-[var(--radius-sm)] px-2 py-2"
                  >
                    <span className="block text-[13px] font-bold leading-snug">
                      {other.title}
                    </span>
                    <span className="block text-[11.5px] text-[var(--text-muted)]">
                      {formatMeetingDate(other.startedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="rail-label">
          Action items
          {summary?.actionItems.length ? ` (${summary.actionItems.length})` : ''}
        </h2>

        {summary?.actionItems.length ? (
          <>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                className="btn flex-1 justify-center"
                onClick={() =>
                  copy(
                    summary.actionItems
                      .map((item) => `• ${item.text}`)
                      .join('\n'),
                    'Action items copied to clipboard.',
                  )
                }
              >
                <DocIcon size={13} />
                Copy
              </button>
              <button
                type="button"
                className="btn flex-1 justify-center"
                onClick={() =>
                  copy(summaryAsText(), 'Follow-up email copied to clipboard.')
                }
              >
                <MailIcon size={13} />
                Follow-up
              </button>
            </div>

            <ul>
              {summary.actionItems.map((item, index) => {
                const key = item.id || String(index);
                const owner = item.ownerId
                  ? participantsById.get(item.ownerId)
                  : null;
                const checked = Boolean(done[key]);

                return (
                  <li key={key} className="action-item">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={`Mark "${item.text}" done`}
                      title="Ticking is local to this visit — there is nowhere to save it yet."
                      className="action-check"
                      onClick={() =>
                        setDone((current) => ({ ...current, [key]: !checked }))
                      }
                    >
                      {checked && <CheckIcon size={11} />}
                    </button>

                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[13px] font-semibold leading-snug ${
                          checked
                            ? 'text-[var(--text-faint)] line-through'
                            : 'text-[var(--text)]'
                        }`}
                      >
                        {item.text}
                      </span>

                      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--text-muted)]">
                        <button
                          type="button"
                          onClick={() => pb.seek(item.citation.startMs)}
                          title="Jump to where this was agreed"
                          className="tap inline-flex items-center gap-1 font-mono font-bold text-[var(--accent)]"
                        >
                          <SparkleIcon size={11} />
                          {formatTimestamp(item.citation.startMs)}
                        </button>

                        {owner ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold text-white"
                              style={{ background: owner.color }}
                            >
                              {owner.initials}
                            </span>
                            {owner.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[var(--text-faint)]">
                            <UserIcon size={12} />
                            Unassigned
                          </span>
                        )}

                        {item.dueDate && (
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarIcon size={12} />
                            {item.dueDate}
                          </span>
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <EmptyPanel text="No action items were identified in this call." />
        )}
      </aside>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <p className="rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] px-4 py-8 text-center text-[12.5px] leading-relaxed text-[var(--text-muted)]">
      {text}
    </p>
  );
}
