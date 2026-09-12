'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMeetingDate } from '@/lib/analytics';
import type { BotJob, CalendarConnection, CalendarEvent } from '@/lib/types';
import { AlertIcon, BotIcon, CheckIcon, SpinnerIcon } from '@/components/ui/Icon';

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

  async function queueMeeting() {
    setBusy('queue');
    setMessage(null);
    try {
      const res = await fetch('/api/bot/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meetingUrl: meetUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMeetUrl('');
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

      {/* ---------------- Queue ---------------- */}
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-raised)] p-5">
        <h2 className="text-base font-semibold">Capture queue</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          This app has no browser, so it never launches the bot directly. It
          queues work here, and a notetaker runner — wherever Chrome actually
          lives — claims it on its next poll. Every connection is outbound, so
          the runner can sit on a laptop behind NAT.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={meetUrl}
            onChange={(e) => setMeetUrl(e.target.value)}
            placeholder="https://meet.google.com/abc-defg-hij"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm transition-colors outline-none placeholder:text-[var(--text-faint)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]"
          />
          <button
            type="button"
            onClick={queueMeeting}
            disabled={!meetUrl.trim() || busy === 'queue'}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-raised)] px-4 py-2 text-sm font-bold transition duration-150 hover:not-disabled:-translate-y-px hover:not-disabled:bg-[var(--bg-hover)] hover:not-disabled:shadow-[var(--shadow-md)] active:not-disabled:translate-y-0 active:not-disabled:scale-[0.98] disabled:opacity-40"
          >
            {busy === 'queue' ? <SpinnerIcon size={14} /> : <BotIcon size={14} />}
            {busy === 'queue' ? 'Queueing…' : 'Send notetaker'}
          </button>
        </div>

        {!queueAvailable && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--warning)]">
            <span className="mt-px shrink-0">
              <AlertIcon size={13} />
            </span>
            {/* The server says *why*. This used to assert MONGODB_URI was
                missing even when it was set and the cluster was simply down,
                which sends you to fix the wrong thing. */}
            <span>
              {queueReason ?? (
                <>
                  The queue needs <code>MONGODB_URI</code>. It is shared state
                  between this app and a bot process elsewhere, so in-memory
                  state cannot work.
                </>
              )}
            </span>
          </p>
        )}

        <div className="mt-4">
          {jobs.length === 0 ? (
            <p className="text-sm text-[var(--text-faint)]">Nothing queued.</p>
          ) : (
            <ul className="space-y-1.5">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate">
                      {job.title ?? job.meetingCode ?? job.meetingUrl}
                    </div>
                    <div className="truncate text-xs text-[var(--text-faint)]">
                      {job.source === 'calendar' ? 'from calendar' : 'manual'}
                      {job.lastMessage ? ` · ${job.lastMessage}` : ''}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                      STATUS_STYLE[job.status] ?? STATUS_STYLE.queued
                    }`}
                  >
                    {job.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="mt-5 text-sm">
          <summary className="tap cursor-pointer font-semibold text-[var(--text-muted)] marker:text-[var(--text-faint)]">
            Running a notetaker runner
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
{`BOT_TOKEN=<same as server> \\
npm run backend -- watch --api https://<your-app-url>`}
          </pre>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            The runner needs a real Chrome, so it runs on a machine you control
            rather than on the host serving this page.
          </p>
        </details>
      </section>
    </div>
  );
}
