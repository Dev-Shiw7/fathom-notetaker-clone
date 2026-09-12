/**
 * Every Google Meet selector the bot uses, in one place.
 *
 * Meet's class names are generated and churn without notice, so nothing here
 * may depend on them. Each target is a *chain* of candidates tried in order,
 * preferring:
 *
 *   1. role + accessible name  — survives styling and markup changes
 *   2. stable ARIA attributes  — `aria-label`, `data-is-muted`
 *   3. tolerant text matching  — last resort
 *
 * When a whole chain fails to resolve, the caller emits `selector.miss` and
 * dumps the DOM, so the fix is a one-line edit here rather than an
 * investigation. Run `notetaker-bot doctor --url <meet>` to see the current
 * state of every chain against the live page.
 */
import type { Locator, Page } from 'playwright-core';

type Scope = Page | Locator;
type Role = Parameters<Page['getByRole']>[0];

export interface Candidate {
  describe: string;
  locate: (scope: Scope) => Locator;
}

export interface SelectorChain {
  key: string;
  description: string;
  candidates: Candidate[];
  /**
   * True when absence is a normal state rather than breakage — e.g. the
   * "removed from meeting" banner is absent almost all the time. `doctor`
   * reports these as informational rather than as failures.
   */
  optional: boolean;
}

/** role + accessible-name candidate — the most change-resistant form. */
const role = (r: Role, name: RegExp): Candidate => ({
  describe: `role=${r}[name=${name.source}]`,
  locate: (scope) => scope.getByRole(r, { name }),
});

/** Raw CSS candidate, for ARIA attributes with no clean role equivalent. */
const css = (selector: string): Candidate => ({
  describe: `css=${selector}`,
  locate: (scope) => scope.locator(selector),
});

/** Visible-text candidate — a last resort, and deliberately tolerant. */
const text = (pattern: RegExp): Candidate => ({
  describe: `text=${pattern.source}`,
  locate: (scope) => scope.locator('body').getByText(pattern).first(),
});

const chain = (
  key: string,
  description: string,
  candidates: Candidate[],
  optional = false,
): SelectorChain => ({ key, description, candidates, optional });

// ---------------------------------------------------------------------------
// Pre-join ("green room")
// ---------------------------------------------------------------------------

export const PREJOIN_NAME_INPUT = chain(
  'prejoin.nameInput',
  'Guest display-name field on the pre-join screen',
  [
    css('input[aria-label="Your name"]'),
    css('input[placeholder="Your name"]'),
    css('input[aria-label*="name" i][type="text"]'),
    css('input[type="text"]'),
  ],
);

export const PREJOIN_JOIN_BUTTON = chain(
  'prejoin.joinButton',
  'The "Ask to join" / "Join now" button',
  [
    role('button', /ask to join/i),
    role('button', /join now/i),
    role('button', /^join$/i),
    text(/ask to join|join now/i),
  ],
);

export const PREJOIN_MIC_TOGGLE = chain(
  'prejoin.micToggle',
  'Microphone on/off toggle',
  [
    css('[data-is-muted][aria-label*="microphone" i]'),
    css('[role="button"][aria-label*="microphone" i]'),
    css('button[aria-label*="microphone" i]'),
    role('button', /turn (off|on) microphone/i),
    css('[aria-label*="mic" i][role="button"]'),
  ],
);

export const PREJOIN_CAMERA_TOGGLE = chain(
  'prejoin.cameraToggle',
  'Camera on/off toggle',
  [
    css('[data-is-muted][aria-label*="camera" i]'),
    css('[role="button"][aria-label*="camera" i]'),
    css('button[aria-label*="camera" i]'),
    role('button', /turn (off|on) camera/i),
    css('[aria-label*="cam" i][role="button"]'),
  ],
);

export const PREJOIN_DISMISS_OVERLAY = chain(
  'prejoin.dismissOverlay',
  'Onboarding / permission overlays that block the join controls',
  [
    role('button', /^got it$/i),
    role('button', /continue without (microphone|camera)/i),
    role('button', /^dismiss$/i),
    role('button', /^(ok|okay)$/i),
    role('button', /^allow$/i),
    role('button', /^no thanks$/i),
  ],
  true,
);

// ---------------------------------------------------------------------------
// Landing-state classification
// ---------------------------------------------------------------------------

export const LANDING_INVALID_CODE = chain(
  'landing.invalidCode',
  'Invalid or unknown meeting code message',
  [
    text(/check your meeting code/i),
    text(/couldn't find (your|the) meeting/i),
    text(/invalid video call name/i),
  ],
  true,
);

export const LANDING_SIGN_IN_REQUIRED = chain(
  'landing.signInRequired',
  'Meeting restricted to signed-in / in-organisation users',
  [
    text(/you can't join this video call/i),
    text(/sign in to join this (video call|meeting)/i),
    text(/ask to join.*sign in|you need to sign in/i),
  ],
  // NOTE: deliberately no `role=button[name="Sign in"]` candidate. Meet renders
  // a "Sign in" link in the header of *every* page, including joinable guest
  // pre-join screens — matching it made the bot refuse meetings it could join.
  true,
);

export const LANDING_NOT_STARTED = chain(
  'landing.notStarted',
  'Scheduled meeting that has not begun',
  [text(/the (meeting|call) hasn't started/i), text(/not started yet/i)],
  true,
);

export const LANDING_DENIED_ENTRY = chain(
  'landing.deniedEntry',
  'Admission request was rejected, or nobody responded',
  [
    text(/denied your request to join/i),
    text(/no one responded to your request/i),
    text(/you can't join this call/i),
  ],
  true,
);

// ---------------------------------------------------------------------------
// Waiting room
// ---------------------------------------------------------------------------

export const WAITING_INDICATOR = chain(
  'waiting.indicator',
  '"Asking to be let in" waiting-room state',
  [
    text(/asking to be let in/i),
    text(/waiting for someone to let you in/i),
    text(/you'll join (the call )?when someone/i),
  ],
  true,
);

// ---------------------------------------------------------------------------
// In-call
// ---------------------------------------------------------------------------

export const INCALL_LEAVE_BUTTON = chain(
  'incall.leaveButton',
  'Leave call button — also the primary "are we in the call?" signal',
  [
    css('[role="button"][aria-label*="Leave call" i]'),
    role('button', /leave call/i),
    css('[aria-label*="hang up" i]'),
  ],
);

export const INCALL_PEOPLE_BUTTON = chain(
  'incall.peopleButton',
  'People panel button; its label carries the participant count',
  [
    css('[role="button"][aria-label*="People" i]'),
    role('button', /people|participants/i),
    css('[aria-label*="participant" i]'),
  ],
);

export const INCALL_CHAT_BUTTON = chain(
  'incall.chatButton',
  'Chat panel toggle',
  [
    css('[role="button"][aria-label*="Chat with everyone" i]'),
    role('button', /chat with everyone/i),
    css('[role="button"][aria-label*="chat" i]'),
  ],
);

export const INCALL_CHAT_INPUT = chain(
  'incall.chatInput',
  'Chat message composer',
  [
    css('textarea[aria-label*="Send a message" i]'),
    css('textarea[placeholder*="Send a message" i]'),
    css('[role="dialog"] textarea'),
    css('textarea'),
  ],
  true,
);

export const INCALL_CHAT_SEND = chain(
  'incall.chatSend',
  'Chat send button (Enter is the fallback)',
  [
    css('[role="button"][aria-label*="Send a message" i]'),
    role('button', /^send( a message)?$/i),
  ],
  true,
);

export const INCALL_REMOVED_BANNER = chain(
  'incall.removedBanner',
  'Host removed the bot from the meeting',
  [
    text(/you('ve| have) been removed/i),
    text(/removed from the meeting/i),
  ],
  true,
);

export const INCALL_ENDED_SCREEN = chain(
  'incall.endedScreen',
  'Post-call screen — the meeting ended or we left',
  [
    text(/you left the meeting/i),
    text(/the (meeting|call) (has )?ended/i),
    text(/thanks for joining/i),
    role('button', /^rejoin$/i),
  ],
  // NOTE: deliberately no "Return to home screen" candidate. That is an
  // `<a aria-label="Return to home screen">` in Meet's header, present on every
  // page — it matched on the pre-join screen and would have made the bot think
  // the call had already ended before it ever joined.
  true,
);

/** Every chain, for `doctor` and for exhaustiveness when auditing changes. */
export const ALL_CHAINS: SelectorChain[] = [
  PREJOIN_NAME_INPUT,
  PREJOIN_JOIN_BUTTON,
  PREJOIN_DISMISS_OVERLAY,
  PREJOIN_MIC_TOGGLE,
  PREJOIN_CAMERA_TOGGLE,
  LANDING_INVALID_CODE,
  LANDING_SIGN_IN_REQUIRED,
  LANDING_NOT_STARTED,
  LANDING_DENIED_ENTRY,
  WAITING_INDICATOR,
  INCALL_LEAVE_BUTTON,
  INCALL_PEOPLE_BUTTON,
  INCALL_CHAT_BUTTON,
  INCALL_CHAT_INPUT,
  INCALL_CHAT_SEND,
  INCALL_REMOVED_BANNER,
  INCALL_ENDED_SCREEN,
];

export interface Resolved {
  locator: Locator;
  candidate: Candidate;
}

/**
 * Tries each candidate in order, returning the first that becomes visible.
 *
 * `timeoutMs` is the budget *per candidate*, not for the chain — a chain of
 * four candidates at 2s can take 8s to fail. Callers polling in a loop should
 * pass something short (250–500ms).
 */
export async function resolveFirst(
  scope: Scope,
  selector: SelectorChain,
  timeoutMs = 2000,
): Promise<Resolved | null> {
  for (const candidate of selector.candidates) {
    try {
      const locator = candidate.locate(scope).first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      return { locator, candidate };
    } catch {
      // Try the next candidate in the chain.
    }
  }
  return null;
}

/** Cheap presence check with no wait — for polling hot paths. */
export async function isPresent(
  scope: Scope,
  selector: SelectorChain,
): Promise<boolean> {
  for (const candidate of selector.candidates) {
    try {
      if (await candidate.locate(scope).first().isVisible()) return true;
    } catch {
      // Ignore and continue.
    }
  }
  return false;
}
