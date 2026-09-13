/**
 * Cross-component browser events.
 *
 * Used where the sender and the receiver are on opposite sides of the route
 * tree and threading a callback between them would mean lifting state into a
 * provider that has no other reason to exist — the search dialog lives in the
 * root layout, the player lives inside a page.
 */

/** Ask the open call view to move its playhead. */
export const SEEK_EVENT = 'recap:seek';

export interface SeekEventDetail {
  meetingId: string;
  ms: number;
}

export function requestSeek(detail: SeekEventDetail) {
  window.dispatchEvent(new CustomEvent<SeekEventDetail>(SEEK_EVENT, { detail }));
}
