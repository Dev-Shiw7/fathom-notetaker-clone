import type { MeetingPlatform } from './types';

/** Platform names as their vendors write them. */
export const PLATFORM_LABEL: Record<MeetingPlatform, string> = {
  meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
};
