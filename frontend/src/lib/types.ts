/**
 * The domain model for the notetaker.
 *
 * One rule shapes most of this file: **every AI-generated claim carries a
 * citation back into the recording.** Key points, action items and topics all
 * hold a `{ startMs, endMs }` range, so the UI can always answer "where did
 * this come from?" with a click. Summaries you cannot audit are summaries you
 * cannot trust, and retrofitting provenance later is far harder than requiring
 * it from the start.
 *
 * Times are milliseconds from the start of the recording — never wall-clock —
 * so transcript, audio and analytics all index off the same origin.
 */

/** A time range within a recording. The unit of provenance. */
export interface Citation {
  startMs: number;
  endMs: number;
}

export interface Participant {
  id: string;
  name: string;
  /** e.g. "VP Engineering" — shown next to the name, never inferred at render. */
  role: string | null;
  org: string | null;
  isHost: boolean;
  /** Someone outside the workspace's own organisation. */
  isExternal: boolean;
  /** Stable per-meeting colour, used by the talk-time ribbon and avatars. */
  color: string;
  initials: string;
}

export interface TranscriptTurn {
  id: string;
  speakerId: string;
  startMs: number;
  endMs: number;
  text: string;
  /**
   * Per-turn audio file, when audio was generated as separate clips. Null when
   * the meeting uses a single stitched track (the normal case) or has no audio
   * at all — the player handles all three.
   */
  audioUrl: string | null;
}

export interface Transcript {
  meetingId: string;
  turns: TranscriptTurn[];
  language: string;
}

export interface ActionItem {
  id: string;
  text: string;
  /** Participant id, or null when the transcript never named an owner. */
  ownerId: string | null;
  dueDate: string | null;
  citation: Citation;
}

export interface KeyPoint {
  text: string;
  citation: Citation;
}

export interface Topic {
  title: string;
  summary: string;
  startMs: number;
  endMs: number;
}

/**
 * Summary templates are data, not code — a new one is a new row, not a
 * deploy. Real Fathom lets users define their own, and designing for that
 * from the start costs nothing.
 */
export interface SummaryTemplate {
  id: string;
  name: string;
  description: string;
  /** Rendered on the template switcher. */
  icon: string;
}

export interface Summary {
  meetingId: string;
  templateId: string;
  tldr: string;
  keyPoints: KeyPoint[];
  actionItems: ActionItem[];
  topics: Topic[];
}

/**
 * Per-speaker statistics.
 *
 * `interruptions` is the one metric that genuinely needs overlapping-speech
 * detection from audio; with a caption-derived transcript it is approximated
 * from turns that begin before the previous speaker's turn ends.
 */
export interface SpeakerStats {
  speakerId: string;
  talkMs: number;
  /** 0..1 share of total speaking time. */
  talkShare: number;
  turnCount: number;
  wordCount: number;
  wordsPerMinute: number;
  longestMonologueMs: number;
  questionsAsked: number;
  interruptions: number;
}

export interface MeetingAnalytics {
  meetingId: string;
  speakers: SpeakerStats[];
  totalTalkMs: number;
  silenceMs: number;
  /** Speaker changes per minute — high means a conversation, low means a lecture. */
  turnsPerMinute: number;
  /** Participant ids who never spoke. The most under-reported meeting fact. */
  silentParticipantIds: string[];
}

export type MeetingPlatform = 'meet' | 'zoom' | 'teams';
export type MeetingStatus = 'recorded' | 'upcoming' | 'processing';

export interface Meeting {
  id: string;
  title: string;
  /** ISO 8601. */
  startedAt: string;
  durationMs: number;
  platform: MeetingPlatform;
  status: MeetingStatus;
  participants: Participant[];
  tags: string[];
  /** Single stitched track. Null means transcript-only, scrub without sound. */
  audioUrl: string | null;
  /** Which summary templates exist for this meeting. */
  templateIds: string[];
  /** One-line preview for the library list. */
  blurb: string;
}

export interface Highlight {
  id: string;
  meetingId: string;
  startMs: number;
  endMs: number;
  label: string;
  createdAt: string;
  /** Seeded highlights are pre-existing; visitor-created ones are not. */
  seeded: boolean;
}

export interface Share {
  token: string;
  meetingId: string;
  startMs: number;
  endMs: number;
  label: string;
  createdAt: string;
}

/** Pre-seeded cross-meeting Q&A. The runtime makes no LLM calls. */
export interface AskThread {
  id: string;
  question: string;
  answer: string;
  /** Meetings the answer draws on, so every claim stays auditable. */
  sources: { meetingId: string; citation: Citation; quote: string }[];
}

/** A calendar event that hasn't happened yet, for the connected-calendar UI. */
export interface UpcomingMeeting {
  id: string;
  title: string;
  startsAt: string;
  durationMs: number;
  platform: MeetingPlatform;
  attendeeNames: string[];
  /** Whether the notetaker is set to join this one. */
  botWillJoin: boolean;
}

/**
 * A unit of work for the capture bot.
 *
 * The deployed app cannot start a browser, and cannot reach a machine that can
 * — so it never pushes. It writes a job here and a bot running somewhere with
 * Chrome claims it on its next poll. That inversion is what lets the bot sit
 * behind NAT on a laptop with no inbound connectivity.
 */
export type BotJobStatus =
  | 'queued'
  | 'claimed'
  | 'joining'
  | 'recording'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface BotJob {
  id: string;
  meetingUrl: string;
  meetingCode: string | null;
  botName: string;
  status: BotJobStatus;
  /** Where the job came from, for the UI to explain itself. */
  source: 'manual' | 'calendar';
  /** Set for calendar-sourced jobs so re-syncs don't duplicate them. */
  calendarEventId: string | null;
  title: string | null;
  /** Do not claim before this instant — lets calendar jobs be queued ahead. */
  notBefore: string;
  createdAt: string;
  claimedAt: string | null;
  finishedAt: string | null;
  /** Identifies which bot took it, for debugging concurrent runners. */
  claimedBy: string | null;
  lastMessage: string | null;
  /** Meeting produced by this job, once the bot posts results back. */
  resultMeetingId: string | null;
}

/**
 * A subscribed calendar.
 *
 * Stores an iCal URL rather than OAuth tokens. Google, Outlook and Apple all
 * expose a private .ics address, which means no cloud project, no consent
 * screen, and no sensitive-scope verification before a stranger can use it.
 */
export interface CalendarConnection {
  id: string;
  label: string;
  icsUrl: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  /** Auto-queue the bot for events that carry a meeting link. */
  autoJoin: boolean;
}

/** An event parsed out of a subscribed calendar. */
export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  meetingUrl: string | null;
  attendeeNames: string[];
  organizer: string | null;
}

export interface SearchHit {
  meetingId: string;
  meetingTitle: string;
  startedAt: string;
  turnId: string;
  startMs: number;
  speakerName: string;
  /** Text around the match, with the match itself delimited for highlighting. */
  snippet: string;
}
