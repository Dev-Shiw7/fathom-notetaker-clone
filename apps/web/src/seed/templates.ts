/**
 * Summary templates.
 *
 * Deliberately data rather than code: adding a template is a new entry here and
 * a matching summary row, not a deploy. Real Fathom lets teams define their
 * own, and the switcher in the summary panel renders straight off this list.
 */
import type { SummaryTemplate } from '@/lib/types';

export const TEMPLATES: SummaryTemplate[] = [
  {
    id: 'general',
    name: 'General',
    description: 'Balanced recap of what was discussed and decided.',
    icon: '📋',
  },
  {
    id: 'sales-discovery',
    name: 'Sales discovery',
    description: 'Pain, budget, timeline, decision process, objections.',
    icon: '🎯',
  },
  {
    id: 'action-items',
    name: 'Just the actions',
    description: 'Only what someone committed to do, and by when.',
    icon: '✅',
  },
  {
    id: 'one-on-one',
    name: '1:1',
    description: 'Wins, blockers, growth, and how the person is doing.',
    icon: '🤝',
  },
  {
    id: 'engineering',
    name: 'Engineering',
    description: 'Decisions, trade-offs, risks and technical follow-ups.',
    icon: '⚙️',
  },
];

export const TEMPLATES_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
