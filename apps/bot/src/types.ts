/**
 * Core type contract for the notetaker bot.
 *
 * Everything the bot knows how to be, do, and report lives here. The event
 * payload map in particular is the contract the rest of the system will consume
 * from `events.jsonl`, so changes to it are changes to a published interface.
 */

/** Lifecycle states. `ENDED` and `FAILED` are terminal. */
export type BotState =
  | 'IDLE'
  | 'LAUNCHING'
  | 'NAVIGATING'
  | 'PRE_JOIN'
  | 'REQUESTING'
  | 'WAITING_ROOM'
  | 'IN_CALL'
  | 'LEAVING'
  | 'ENDED'
  | 'FAILED';

/**
 * Process exit codes. Distinct per outcome so an orchestrator can react without
 * parsing logs — "never admitted" is retryable, "invalid code" is not.
 */
export const ExitCode = {
  OK: 0,
  FAILURE: 1,
  ADMISSION_TIMEOUT: 2,
  ADMISSION_DENIED: 3,
  CANNOT_JOIN: 4,
} as const;
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** Why the bot left the call. */
export type LeaveReason =
  | 'ALONE'
  | 'REMOVED'
  | 'MEETING_ENDED'
  | 'MAX_DURATION'
  | 'SIGNAL'
  | 'REQUESTED';

/** What we found after navigating to the meeting URL. */
export type LandingState =
  | 'PRE_JOIN'
  | 'INVALID_CODE'
  | 'SIGN_IN_REQUIRED'
  | 'NOT_STARTED'
  | 'DENIED_ENTRY'
  | 'UNKNOWN';

/** How a session finished, independent of the exit code. */
export type SessionOutcome =
  | 'COMPLETED'
  | 'NEVER_ADMITTED'
  | 'DENIED'
  | 'COULD_NOT_JOIN'
  | 'ERROR';

/** Resolution of an admission request. */
export type AdmissionResult =
  | { status: 'GRANTED'; waitedMs: number }
  | { status: 'DENIED'; waitedMs: number }
  | { status: 'TIMEOUT'; waitedMs: number };

/**
 * Typed event payloads. `logging/events.ts` adds the envelope
 * (`v`, `seq`, `ts`, `sessionId`) to each of these.
 */
export interface EventPayloads {
  'session.started': {
    meetingUrl: string;
    meetingCode: string | null;
    botName: string;
    options: Record<string, unknown>;
  };
  'browser.launched': { channel: string; version: string };
  'navigation.completed': {
    url: string;
    landingState: LandingState;
    elapsedMs: number;
  };
  'state.changed': { from: BotState; to: BotState };
  'prejoin.ready': Record<string, never>;
  'prejoin.media_muted': {
    camera: boolean;
    microphone: boolean;
    verified: boolean;
  };
  'prejoin.name_set': { name: string };
  'join.requested': Record<string, never>;
  /**
   * Whether the page actually reacted to the join click. `join.requested` only
   * records that a click was dispatched; this records what Meet did about it.
   */
  'join.confirmed': {
    confirmation: 'WAITING' | 'IN_CALL' | 'NOT_REGISTERED' | 'UNCONFIRMED';
    elapsedMs: number;
    screenshotPath: string | null;
  };
  'admission.granted': { waitedMs: number };
  'admission.denied': { waitedMs: number };
  'admission.timeout': { waitedMs: number };
  'consent.disclosed': { channel: 'chat'; message: string };
  'participants.changed': { count: number; previous: number | null };
  'leave.triggered': { reason: LeaveReason };
  'leave.completed': { durationInCallMs: number };
  'recording.started': { method: string; reason?: string };
  'recording.tick': { elapsedMs: number };
  'recording.completed': { durationMs: number };
  'transcript.generated': { turnCount: number; participantCount: number };
  'session.ended': {
    outcome: SessionOutcome;
    exitCode: ExitCode;
    durationMs: number;
  };
  'selector.miss': {
    key: string;
    candidates: string[];
    snapshotPath: string | null;
    screenshotPath: string | null;
  };
  error: {
    phase: BotState;
    message: string;
    stack: string | null;
    screenshotPath: string | null;
  };
  warn: { message: string; detail: string | null };
}

export type EventType = keyof EventPayloads;

/** Envelope wrapped around every payload before it is written to JSONL. */
export interface EventEnvelope {
  /** Schema version of the event stream. Bump on breaking payload changes. */
  v: 1;
  /** Monotonic per-session sequence number; makes ordering explicit. */
  seq: number;
  ts: string;
  sessionId: string;
  type: EventType;
}

export type BotEvent = EventEnvelope & { [key: string]: unknown };
