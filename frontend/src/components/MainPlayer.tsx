'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Meeting, Transcript, MeetingAnalytics, Summary } from '@/lib/types';
import { usePlayback } from '@/components/player/usePlayback';
import { TalkRibbon } from '@/components/player/TalkRibbon';
import { TranscriptList } from '@/components/transcript/TranscriptList';
import { formatTimestamp, formatDuration, formatMeetingDate } from '@/lib/analytics';
import { useToast } from '@/components/ui/Toast';
import {
  Back10Icon,
  BotIcon,
  CalendarIcon,
  ClockIcon,
  Forward10Icon,
  MenuIcon,
  PauseIcon,
  PlayIcon,
  ShareIcon,
  SparkleIcon,
  SpinnerIcon,
  UserIcon,
  UsersIcon,
} from '@/components/ui/Icon';

interface Props {
  meeting: Meeting;
  transcript: Transcript | null;
  analytics: MeetingAnalytics | null;
  summaries: Summary[];
  loading?: boolean;
  seekTarget?: number | null;
  onSeekConsumed?: () => void;
  onOpenRail?: () => void;
}

const SPEEDS = [1, 1.25, 1.5, 2] as const;

export default function MainPlayer({
  meeting,
  transcript,
  analytics,
  summaries,
  loading = false,
  seekTarget,
  onSeekConsumed,
  onOpenRail,
}: Props) {
  const duration = meeting?.durationMs ?? 0;
  const audioUrl = meeting?.audioUrl ?? null;
  const pb = usePlayback(duration, audioUrl);
  const { toast } = useToast();
  const [botJoining, setBotJoining] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'actions'>('summary');
  // Auto-scroll state lives here because TranscriptList is controlled. It was
  // previously hardcoded `following={true}` with a no-op setter, so the
  // "Auto-scroll" chip did nothing and the transcript yanked itself back to
  // the playhead while you were reading further down.
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    // reset on meeting change
    pb.seek(0);
    setActiveTab('summary');
    setFollowing(true);
  }, [meeting?.id]);

  // Handle external seek requests (e.g. from global search)
  useEffect(() => {
    if (seekTarget != null) {
      pb.seek(seekTarget);
      onSeekConsumed?.();
    }
  }, [seekTarget]);

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

  const handleAddBot = async () => {
    try {
      setBotJoining(true);

      const response = await fetch('/api/bot/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id,
          meetingUrl: `https://meet.google.com/${meeting.id}`,
          botName: 'Notetaker',
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

      toast('Bot is joining the meeting.', 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBotJoining(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('Link copied to clipboard.', 'success');
    } catch {
      // Clipboard access is denied outside a secure context, and silently
      // doing nothing looks identical to a broken button.
      toast('Could not copy — your browser blocked clipboard access.', 'error');
    }
  };

  if (!meeting) {
    return <div className="grid h-full place-items-center">No meeting selected</div>;
  }

  const currentSummary = summaries[0] ?? null;

  return (
    <div className="main">
      {/* The hook has always returned an audioRef, but nothing ever rendered
          an element for it — so meetings that do have audio still played
          nothing but the synthetic clock. */}
      {audioUrl && (
        <audio ref={pb.audioRef} src={audioUrl} preload="metadata" className="hidden" />
      )}

      <header className="topbar">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onOpenRail}
            aria-label="Show meeting list"
            className="btn btn-icon mt-0.5 min-[900px]:hidden"
          >
            <MenuIcon size={16} />
          </button>

          <div className="min-w-0">
            <h1 className="tb-title truncate" title={meeting.title}>
              {meeting.title}
            </h1>
            <div className="tb-meta">
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
                {meeting.participants.length}{' '}
                {meeting.participants.length === 1 ? 'person' : 'people'}
              </span>
            </div>
          </div>
        </div>

        <div className="tb-actions">
          <button
            className="btn"
            onClick={handleAddBot}
            disabled={botJoining}
            title="Start the Notetaker bot to join this meeting"
          >
            {botJoining ? <SpinnerIcon size={14} /> : <BotIcon size={14} />}
            {botJoining ? 'Starting…' : 'Bot'}
          </button>
          <button className="btn" onClick={handleShare} title="Copy a link to this meeting">
            <ShareIcon size={14} />
            Share
          </button>
          <button
            className="btn primary"
            onClick={() => pb.toggle()}
            title={pb.playing ? 'Pause' : 'Play'}
            aria-label={pb.playing ? 'Pause' : 'Play'}
          >
            {pb.playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
            {pb.playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </header>

      <div className="workspace">
        <div className="left-pane">
          <div className="player">
            <button
              className="center-play"
              onClick={() => pb.toggle()}
              aria-label={pb.playing ? 'Pause recording' : 'Play recording'}
            >
              {pb.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </button>

            {/* Who is talking right now, drawn from the same playhead the
                transcript uses. */}
            {activeSpeaker && (
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 py-1 pl-1 pr-3 backdrop-blur-sm">
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
            {activeTurn && <p className="caption">{activeTurn.text}</p>}
          </div>

          {/* Transport. Every control here is an existing usePlayback method
              that previously had no UI at all. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
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

          <div className="mt-3 shrink-0">
            <TalkRibbon
              durationMs={duration}
              turns={turns}
              participants={meeting.participants}
              highlights={[]}
              positionMs={pb.positionMs}
              onSeek={(ms) => pb.seek(ms)}
              onCreateClip={(startMs, endMs) =>
                toast(
                  `Clip ${formatTimestamp(startMs)}–${formatTimestamp(endMs)} selected. Saving clips is not wired up in this demo.`,
                  'info',
                  5000,
                )
              }
            />
          </div>

          {/* Ribbon legend — makes the colours mean something. */}
          {legend.length > 0 && (
            <ul className="mt-2.5 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5">
              {legend.map(({ stat, person }) => (
                <li
                  key={stat.speakerId}
                  className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]"
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

          <div className="mt-4 flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-faint)]">
              Transcript
            </h2>
            {/*
              This was a static <div> that always rendered as "on". It is now a
              real toggle bound to the state TranscriptList already accepts.
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

          {loading && turns.length === 0 ? (
            <TranscriptSkeleton />
          ) : turns.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              No transcript for this meeting yet.
            </p>
          ) : (
            <TranscriptList
              turns={turns}
              participants={meeting.participants}
              positionMs={pb.positionMs}
              onSeek={(ms) => pb.seek(ms)}
              following={following}
              onFollowingChange={setFollowing}
            />
          )}
        </div>

        <aside className="right-pane">
          <div className="r-tabs" role="tablist" aria-label="Meeting insights">
            {(['summary', 'actions'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`panel-${tab}`}
                className="r-tab"
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'summary' ? 'Summary' : 'Actions'}
                {tab === 'actions' && currentSummary?.actionItems?.length ? (
                  <span className="ml-1.5 rounded-full bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] tabular-nums">
                    {currentSummary.actionItems.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div
            className="r-content"
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
          >
            {loading && !currentSummary ? (
              <PanelSkeleton />
            ) : activeTab === 'summary' ? (
              <>
                <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
                  <SparkleIcon size={15} className="text-[var(--accent)]" />
                  AI summary
                </h2>

                {currentSummary ? (
                  <div className="space-y-6">
                    <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3.5 text-[13.5px] leading-relaxed">
                      {currentSummary.tldr}
                    </p>

                    {currentSummary.topics?.length > 0 && (
                      <section>
                        <h3 className="sec-title">Topics discussed</h3>
                        <ul className="space-y-3">
                          {currentSummary.topics.map((topic, i) => (
                            <li key={i}>
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

                    {currentSummary.keyPoints?.length > 0 && (
                      <section>
                        <h3 className="sec-title">Key points</h3>
                        <ul className="space-y-2.5">
                          {currentSummary.keyPoints.map((point, i) => (
                            <li
                              key={i}
                              className="flex gap-2.5 text-[12.5px] leading-relaxed text-[var(--text-muted)]"
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
                  </div>
                ) : (
                  <EmptyPanel text="No summary has been generated for this meeting yet." />
                )}
              </>
            ) : (
              <>
                <h2 className="mb-3 text-[15px] font-bold">Action items</h2>
                {currentSummary?.actionItems?.length ? (
                  <ul className="space-y-2.5">
                    {currentSummary.actionItems.map((action, i) => {
                      const owner = action.ownerId
                        ? participantsById.get(action.ownerId)
                        : null;
                      return (
                        <li
                          key={action.id || i}
                          className="tap-surface rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[13px] font-semibold leading-snug">
                              {action.text}
                            </span>
                            <button
                              type="button"
                              onClick={() => pb.seek(action.citation.startMs)}
                              title="Jump to where this was agreed"
                              className="tap shrink-0 font-mono text-[11px] font-bold text-[var(--accent)]"
                            >
                              {formatTimestamp(action.citation.startMs)}
                            </button>
                          </div>

                          {(owner || action.dueDate) && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--text-muted)]">
                              {owner && (
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
                              )}
                              {!owner && (
                                <span className="inline-flex items-center gap-1.5 text-[var(--text-faint)]">
                                  <UserIcon size={12} />
                                  Unassigned
                                </span>
                              )}
                              {action.dueDate && (
                                <span className="inline-flex items-center gap-1.5">
                                  <CalendarIcon size={12} />
                                  {action.dueDate}
                                </span>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyPanel text="No action items were identified in this meeting." />
                )}
              </>
            )}
          </div>
        </aside>
      </div>
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

/** Shown while a meeting's detail request is in flight. */
function TranscriptSkeleton() {
  return (
    <div className="space-y-4 py-3" aria-hidden>
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex gap-3">
          <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-28" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-[82%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="skeleton h-4 w-32" />
      <div className="space-y-2">
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-3/4" />
      </div>
      <div className="skeleton h-3 w-24" />
      <div className="space-y-2">
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
      </div>
    </div>
  );
}
