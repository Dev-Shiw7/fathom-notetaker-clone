'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMeetingDate } from '@/lib/analytics';
import type { BotJob, CalendarConnection, CalendarEvent } from '@/lib/types';
import { RECORD_TTL_MS } from '@/lib/retention';
import {
  AlertIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  LinkIcon,
  SendIcon,
  SparkleIcon,
  SpinnerIcon,
} from '@/components/ui/Icon';

interface CalendarResponse {
  available: boolean;
  connections: CalendarConnection[];
  events: CalendarEvent[];
  queued?: number;
  reason?: string;
}

/**
 * Status pills. These carried a colour and a border but no fill, so they read
 * as hollow outlines next to the filled badges everywhere else; the `-soft`
 * background tokens exist now, so they can match.
 */
const STATUS_STYLE: Record<string, string> = {
  queued: 'text-[var(--text-muted)] border-[var(--border-strong)] bg-[var(--bg)]',
  claimed: 'text-[var(--accent)] border-[var(--accent)] bg-[var(--accent-soft)]',
  joining: 'text-[var(--accent)] border-[var(--accent)] bg-[var(--accent-soft)]',
  recording:
    'text-[var(--warning)] border-[var(--warning)] bg-[var(--warning-soft)]',
  done: 'text-[var(--positive)] border-[var(--positive)] bg-[var(--positive-soft)]',
  failed: 'text-[var(--danger)] border-[var(--danger)] bg-[var(--danger-soft)]',
  cancelled: 'text-[var(--text-faint)] border-[var(--border)] bg-[var(--bg)]',
};

const MEET_CODE = /([a-z]{3}-[a-z]{4}-[a-z]{3})/i;
const ACTIVE = new Set(['queued', 'claimed', 'joining', 'recording']);

/** "11h 40m left" until a job drops out of the list. */
function timeLeft(createdAt: string, now: number): string {
  const ms = Date.parse(createdAt) + RECORD_TTL_MS - now;
  if (ms <= 0) return 'expiring';
  const minutes = Math.floor(ms / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : `${minutes}m left`;
}

export default function IntegrationsPanel() {
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [jobs, setJobs] = useState<BotJob[]>([]);
  const [queueAvailable, setQueueAvailable] = useState(true);
  // Why the queue is unavailable, as reported by the server. Missing config and
  // an unreachable cluster need different words — the fix for each differs.
  const [queueReason, setQueueReason] = useState<string | null>(null);
  const [icsUrl, setIcsUrl] = useState('');
  const [meetUrl, setMeetUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [sent, setSent] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  /**
   * Reads a JSON body without trusting that there is one.
   *
   * A 500 from a route handler that threw has an empty body, and `res.json()`
   * on that rejects with "Unexpected end of JSON input" — which, on a polled
   * endpoint, meant an unhandled rejection every five seconds and a Next.js
   * error overlay over the whole page. A failed fetch should degrade to a
   * rendered state, never take the page down.
   */
  const readJson = useCallback(async (url: string): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!text) return null;
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, []);

  const loadJobs = useCallback(async () => {
    const data = await readJson('/api/bot/jobs');
    setJobs((data?.jobs as BotJob[]) ?? []);
    setQueueAvailable(Boolean(data?.available));
    setQueueReason((data?.reason as string) ?? null);
  }, [readJson]);

  const loadCalendar = useCallback(async () => {
    const data = await readJson('/api/calendar');
    setCalendar(
      (data as CalendarResponse | null) ?? {
        available: false,
        connections: [],
        events: [],
        reason: 'Could not reach the server.',
      },
    );
  }, [readJson]);

  // The open/closed state of the list is a per-viewer convenience; the page
  // must work without it.
  useEffect(() => {
    try {
      if (localStorage.getItem('capture-list-open') === '0') setListOpen(false);
    } catch {
      /* storage can be blocked */
    }
  }, []);

  const toggleList = () => {
    setListOpen((open) => {
      try {
        localStorage.setItem('capture-list-open', open ? '0' : '1');
      } catch {
        /* storage can be blocked */
      }
      return !open;
    });
  };

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    void loadCalendar();
    void loadJobs();
    // Jobs move while you watch — a bot on another machine is claiming them.
    const timer = setInterval(loadJobs, 5_000);
    return () => clearInterval(timer);
  }, [loadCalendar, loadJobs]);

  async function connect() {
    setBusy('calendar');
    setMessage(null);
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ icsUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIcsUrl('');
      setMessage({ tone: 'ok', text: `Connected ${data.connection.label}.` });
      await loadCalendar();
      await loadJobs();
    } catch (err) {
      setMessage({ tone: 'bad', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    await fetch(`/api/calendar?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadCalendar();
  }

  const meetCode = meetUrl.match(MEET_CODE)?.[1]?.toLowerCase() ?? null;
  // A bare code ("abc-defg-hij") is as good as the full link.
  const meetLink = /meet\.google\.com/i.test(meetUrl) ? meetUrl.trim() : meetCode ? `https://meet.google.com/${meetCode}` : meetUrl.trim();

  async function pasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setMeetUrl(text.trim());
    } catch {
      /* clipboard access can be denied; typing still works */
    }
  }

  async function queueMeeting() {
    setBusy('queue');
    setMessage(null);
    try {
      const res = await fetch('/api/bot/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meetingUrl: meetLink }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMeetUrl('');
      setSent(true);
      setTimeout(() => setSent(false), 2200);
      setMessage({ tone: 'ok', text: 'Queued. A runner will claim it on its next poll.' });
      await loadJobs();
    } catch (err) {
      setMessage({ tone: 'bad', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      {message && (
        <div
          role="status"
          className={`flex items-start gap-2.5 rounded-[var(--radius)] border px-4 py-3 text-sm ${
            message.tone === 'ok'
              ? 'border-[var(--positive)] bg-[var(--positive-soft)] text-[var(--positive)]'
              : 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
          }`}
        >
          <span className="mt-px shrink-0">
            {message.tone === 'ok' ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
          </span>
          <span className="leading-snug">{message.text}</span>
        </div>
      )}

      {/* ---------------- Calendar ---------------- */}
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-raised)] p-5">
        <h2 className="text-base font-semibold">Calendar</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Paste your calendar&rsquo;s private iCal address. In Google Calendar:
          Settings → your calendar → <em>Secret address in iCal format</em>.
          Events with a Meet link get the notetaker queued automatically.
        </p>

        {calendar && !calendar.available ? (
          <p className="mt-4 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)]">
            {calendar.reason}
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm transition-colors outline-none placeholder:text-[var(--text-faint)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
              />
              <button
                type="button"
                onClick={connect}
                disabled={!icsUrl.trim() || busy === 'calendar'}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent-contrast)] transition duration-150 hover:not-disabled:-translate-y-px hover:not-disabled:bg-[var(--accent-hover)] hover:not-disabled:shadow-[var(--shadow-md)] active:not-disabled:translate-y-0 active:not-disabled:scale-[0.98] disabled:opacity-40"
              >
                {busy === 'calendar' && <SpinnerIcon size={14} />}
                {busy === 'calendar' ? 'Checking…' : 'Connect'}
              </button>
            </div>

            {calendar?.connections.map((connection) => (
              <div
                key={connection.id}
                className="mt-3 flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">{connection.label}</div>
                  <div className="truncate text-xs text-[var(--text-faint)]">
                    {connection.lastSyncError
                      ? `Sync failed: ${connection.lastSyncError}`
                      : `Auto-join ${connection.autoJoin ? 'on' : 'off'}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => disconnect(connection.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-muted)] transition duration-150 hover:scale-105 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] active:scale-95"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </>
        )}

        {calendar && calendar.events.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
              Upcoming
            </h3>
            <ul className="mt-2 space-y-1.5">
              {calendar.events.slice(0, 8).map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">{event.title}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-faint)]">
                    {formatMeetingDate(event.startsAt)}
                    <span aria-hidden>·</span>
                    {event.meetingUrl ? (
                      <span className="inline-flex items-center gap-1 font-medium text-[var(--accent)]">
                        <BotIcon size={12} />
                        bot will join
                      </span>
                    ) : (
                      'no link'
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------------- Send the bot ---------------- */}
      <section className="funky-card relative overflow-hidden rounded-[var(--radius-lg)] p-[1.5px]">
        <div className="relative rounded-[calc(var(--radius-lg)-1.5px)] bg-[var(--bg-raised)] p-6 sm:p-7">
          <div className="funky-blob" aria-hidden />
          <div className="relative flex items-start gap-4">
            <div className="funky-bot grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[var(--accent-contrast)] shadow-[var(--shadow-md)]">
              <BotIcon size={28} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold tracking-tight">
                Drop a link. <span className="funky-text">Send the bot.</span>
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                Paste a Google Meet link or just the code. A notetaker hops in, listens, and leaves you
                the notes.
              </p>
            </div>
          </div>

          <div className="relative mt-5">
            <div className="funky-input flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg)] py-1.5 pr-1.5 pl-4 transition focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_var(--accent-ring)]">
              <span className="text-[var(--text-faint)]">
                <LinkIcon size={18} />
              </span>
              <input
                value={meetUrl}
                onChange={(e) => setMeetUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && meetCode && busy !== 'queue') void queueMeeting();
                }}
                placeholder="meet.google.com/abc-defg-hij"
                aria-label="Google Meet link"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-faint)]"
              />
              {meetCode ? (
                <span className="funky-pop hidden shrink-0 items-center gap-1 rounded-full bg-[var(--positive-soft)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--positive)] sm:inline-flex">
                  <CheckIcon size={12} />
                  {meetCode}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={pasteLink}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                >
                  Paste
                </button>
              )}
              <button
                type="button"
                onClick={queueMeeting}
                disabled={!meetCode || busy === 'queue'}
                className={`funky-send inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold text-[var(--accent-contrast)] transition duration-150 hover:not-disabled:-translate-y-px hover:not-disabled:scale-[1.03] active:not-disabled:scale-95 disabled:opacity-40 ${
                  busy === 'queue' ? 'is-flying' : ''
                }`}
              >
                {busy === 'queue' ? (
                  <SpinnerIcon size={15} />
                ) : sent ? (
                  <CheckIcon size={15} />
                ) : (
                  <span className="funky-plane">
                    <SendIcon size={15} />
                  </span>
                )}
                {busy === 'queue' ? 'Sending…' : sent ? 'On its way!' : 'Send bot'}
              </button>
            </div>
            <p className="mt-2 pl-4 text-xs text-[var(--text-faint)]">
              {meetUrl.trim() && !meetCode
                ? "That doesn't look like a Meet link yet. It should end in three letters, four letters, three letters."
                : 'Press Enter to send. You admit the bot from the Meet lobby.'}
            </p>
          </div>

          {!queueAvailable && (
            <p className="relative mt-4 flex items-start gap-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--warning)]">
              <span className="mt-px shrink-0">
                <AlertIcon size={13} />
              </span>
              <span>
                {queueReason ?? (
                  <>
                    The queue needs <code>MONGODB_URI</code>. It is shared state between this app and a bot
                    process elsewhere, so in-memory state cannot work.
                  </>
                )}
              </span>
            </p>
          )}
        </div>
      </section>

      {/* ---------------- Bot activity (collapsible, 12h) ---------------- */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-raised)]">
        <button
          type="button"
          onClick={toggleList}
          aria-expanded={listOpen}
          aria-controls="bot-activity"
          className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] px-5 py-4 text-left transition hover:bg-[var(--bg-hover)]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <SparkleIcon size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-base font-bold">
              Bot activity
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-extrabold text-[var(--accent)]">
                {jobs.length}
              </span>
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
              <ClockIcon size={12} />
              Links and bot status clear after 12 hours
            </span>
          </span>
          <span className={`text-[var(--text-muted)] transition-transform duration-200 ${listOpen ? 'rotate-180' : ''}`}>
            <ChevronDownIcon size={20} />
          </span>
        </button>

        <div id="bot-activity" className="funky-collapse" data-open={listOpen}>
          <div className="overflow-hidden">
            <div className="px-5 pb-5">
              {jobs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-8 text-center">
                  <div className="funky-float mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <BotIcon size={22} />
                  </div>
                  <p className="mt-3 text-sm font-semibold">No bots out right now</p>
                  <p className="mt-0.5 text-xs text-[var(--text-faint)]">Send one above and it shows up here.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {jobs.map((job) => (
                    <li
                      key={job.id}
                      className="funky-row flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${ACTIVE.has(job.status) ? 'funky-dot' : ''} ${
                            job.status === 'done'
                              ? 'bg-[var(--positive)]'
                              : job.status === 'failed'
                                ? 'bg-[var(--danger)]'
                                : ACTIVE.has(job.status)
                                  ? 'bg-[var(--accent)]'
                                  : 'bg-[var(--text-faint)]'
                          }`}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">
                            {job.title ?? job.meetingCode ?? job.meetingUrl}
                          </div>
                          <div className="truncate text-xs text-[var(--text-faint)]">
                            {job.source === 'calendar' ? 'from calendar' : 'manual'}
                            {job.lastMessage ? ` · ${job.lastMessage}` : ''}
                            {` · ${timeLeft(job.createdAt, now)}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {job.resultMeetingId && (
                          <Link
                            href={`/calls/${encodeURIComponent(job.resultMeetingId)}`}
                            className="tap text-xs font-bold text-[var(--accent)] hover:underline"
                          >
                            Open call
                          </Link>
                        )}
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            STATUS_STYLE[job.status] ?? STATUS_STYLE.queued
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <details className="mt-4 text-sm">
                <summary className="tap cursor-pointer text-xs font-semibold text-[var(--text-muted)] marker:text-[var(--text-faint)]">
                  Running a notetaker runner
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
{`BOT_TOKEN=<same as server> \\
npm run backend -- watch --api https://<your-app-url>`}
                </pre>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  The runner needs a real Chrome, so it runs on a machine you control rather than on the host
                  serving this page.
                </p>
              </details>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
