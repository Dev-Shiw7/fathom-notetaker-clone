/**
 * CLI parsing, defaults and validation.
 *
 * Uses Node's built-in `util.parseArgs` rather than a CLI library — the surface
 * is small enough that a dependency would cost more than it saves, and the bot
 * runs in a container where fewer deps means a smaller image.
 */
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';

/** Thrown for bad user input; the CLI prints these without a stack trace. */
export class ConfigError extends Error {}

export interface JoinOptions {
  meetingUrl: string;
  meetingCode: string | null;
  botName: string;
  outDir: string;
  admissionTimeoutMs: number;
  aloneTimeoutMs: number;
  maxDurationMs: number;
  chatAnnounce: boolean;
  consentMessage: string;
  headless: boolean;
  keepOpen: boolean;
  /** Abort instead of warning when the UI mute can't be verified. */
  requireMuted: boolean;
  /** Signed-in Chrome profile directory; absent means join as a guest. */
  profileDir: string | undefined;
}

export interface DoctorOptions {
  meetingUrl: string;
  meetingCode: string | null;
  outDir: string;
  headless: boolean;
  keepOpen: boolean;
  profileDir: string | undefined;
}

export type Command =
  | { kind: 'join'; options: JoinOptions }
  | { kind: 'doctor'; options: DoctorOptions }
  | { kind: 'help' };

export const DEFAULTS = {
  botName: 'Notetaker',
  outDir: 'out',
  admissionTimeoutSec: 300,
  aloneTimeoutSec: 120,
  maxDurationSec: 10800,
  consentMessage:
    "Hi! I'm Notetaker, an AI assistant that takes notes for this meeting. " +
    'This meeting is being transcribed. Ask the host to remove me if you prefer not to be recorded.',
} as const;

const MEET_CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/**
 * Normalises a user-supplied meeting URL and extracts the meeting code.
 *
 * Accepts a bare `abc-defg-hij` code, a scheme-less host, or a full URL with
 * query params. The code is used only for naming session directories, so a
 * `null` code (e.g. a `/lookup/` nickname URL) is not an error.
 */
export function parseMeetingUrl(input: string): {
  url: string;
  code: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed) throw new ConfigError('--url is required');

  if (MEET_CODE_PATTERN.test(trimmed)) {
    return { url: `https://meet.google.com/${trimmed}`, code: trimmed };
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new ConfigError(`Not a valid meeting URL: ${input}`);
  }

  if (!/(^|\.)meet\.google\.com$/i.test(parsed.hostname)) {
    throw new ConfigError(
      `Only Google Meet URLs are supported, got host: ${parsed.hostname}`,
    );
  }

  const segment = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
  const code = MEET_CODE_PATTERN.test(segment) ? segment : null;
  return { url: parsed.toString(), code };
}

/** Parses a numeric flag given in seconds, returning milliseconds. */
function seconds(value: string | undefined, fallback: number, flag: string): number {
  if (value === undefined) return fallback * 1000;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigError(`${flag} must be a positive number of seconds`);
  }
  return Math.round(parsed * 1000);
}

export function parseCommand(argv: string[]): Command {
  const [sub, ...rest] = argv;

  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    return { kind: 'help' };
  }
  if (sub !== 'join' && sub !== 'doctor') {
    throw new ConfigError(`Unknown command: ${sub}`);
  }

  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        url: { type: 'string' },
        name: { type: 'string' },
        out: { type: 'string' },
        'admission-timeout': { type: 'string' },
        'alone-timeout': { type: 'string' },
        'max-duration': { type: 'string' },
        'consent-message': { type: 'string' },
        'no-chat-announce': { type: 'boolean', default: false },
        'require-muted': { type: 'boolean', default: false },
        profile: { type: 'string' },
        headless: { type: 'boolean', default: false },
        'keep-open': { type: 'boolean', default: false },
      },
      strict: true,
    }));
  } catch (err) {
    throw new ConfigError((err as Error).message);
  }

  const rawUrl = typeof values.url === 'string' ? values.url : '';
  const { url, code } = parseMeetingUrl(rawUrl);
  const outDir = resolve(
    typeof values.out === 'string' ? values.out : DEFAULTS.outDir,
  );
  const headless = values.headless === true;
  const keepOpen = values['keep-open'] === true;
  const profileDir =
    typeof values.profile === 'string' && values.profile.trim()
      ? resolve(values.profile.trim())
      : undefined;

  if (sub === 'doctor') {
    return {
      kind: 'doctor',
      options: {
        meetingUrl: url,
        meetingCode: code,
        outDir,
        headless,
        keepOpen,
        profileDir,
      },
    };
  }

  const botName =
    typeof values.name === 'string' && values.name.trim()
      ? values.name.trim()
      : DEFAULTS.botName;

  return {
    kind: 'join',
    options: {
      meetingUrl: url,
      meetingCode: code,
      botName,
      outDir,
      admissionTimeoutMs: seconds(
        values['admission-timeout'] as string | undefined,
        DEFAULTS.admissionTimeoutSec,
        '--admission-timeout',
      ),
      aloneTimeoutMs: seconds(
        values['alone-timeout'] as string | undefined,
        DEFAULTS.aloneTimeoutSec,
        '--alone-timeout',
      ),
      maxDurationMs: seconds(
        values['max-duration'] as string | undefined,
        DEFAULTS.maxDurationSec,
        '--max-duration',
      ),
      chatAnnounce: values['no-chat-announce'] !== true,
      consentMessage:
        typeof values['consent-message'] === 'string' &&
        values['consent-message'].trim()
          ? values['consent-message'].trim()
          : DEFAULTS.consentMessage,
      headless,
      keepOpen,
      requireMuted: values['require-muted'] === true,
      profileDir,
    },
  };
}

export const USAGE = `
notetaker-bot — Google Meet notetaker bot

USAGE
  notetaker-bot join   --url <meetUrl> [options]
  notetaker-bot doctor --url <meetUrl> [options]

COMMANDS
  join      Join a meeting, announce, monitor, and leave cleanly
  doctor    Report which Meet DOM selectors currently resolve

OPTIONS
  --url <url>                  Meet URL or bare abc-defg-hij code   (required)
  --name <name>                Display name in the meeting          (default: ${DEFAULTS.botName})
  --out <dir>                  Session artifact directory           (default: ${DEFAULTS.outDir})
  --admission-timeout <sec>    Wait this long to be let in          (default: ${DEFAULTS.admissionTimeoutSec})
  --alone-timeout <sec>        Leave after this long alone          (default: ${DEFAULTS.aloneTimeoutSec})
  --max-duration <sec>         Hard cap on call length              (default: ${DEFAULTS.maxDurationSec})
  --consent-message <text>     Override the chat disclosure message
  --no-chat-announce           Skip the consent chat message
  --require-muted              Abort if the UI mute cannot be verified
  --profile <dir>              Signed-in Chrome profile dir (default: guest join)
  --headless                   Experimental; headful is supported
  --keep-open                  Leave the browser open on exit, for debugging

EXIT CODES
  0  joined and left cleanly      3  admission denied
  1  unexpected failure           4  could not join (bad code / sign-in / not started)
  2  never admitted (timeout)
`.trimStart();
