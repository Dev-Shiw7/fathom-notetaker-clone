/**
 * End-of-meeting summary delivery.
 *
 * The bot posts its summary into the meeting chat rather than emailing it.
 * That is a deliberate constraint, not a shortcut: a guest join never learns
 * anyone's email address, so email would mean inventing recipients. Chat
 * reaches exactly the people who were actually in the room, and it reaches
 * all of them at once.
 *
 * The consequence is that delivery must happen *before* the bot leaves —
 * chat is unreachable from outside the call. So "a few minutes after the
 * meeting ends" is implemented as: wait until the call is winding down, hold
 * for `summaryDelayMs`, post, then leave. The bot is the last one out.
 *
 * The summary itself is written by the app (see frontend/src/lib/summarize.ts)
 * from the real transcript; this module only decides how it reads in chat.
 */
export interface MeetingSummary {
  text: string;
  keyPoints: string[];
  actionItems: Array<{ task: string; owner?: string; dueDate?: string }>;
}

/** Meet silently truncates very long chat messages; stay well under. */
const MAX_LINE = 900;

function clamp(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_LINE
    ? `${collapsed.slice(0, MAX_LINE - 1)}…`
    : collapsed;
}

/**
 * Renders a summary as chat lines, one message each.
 *
 * Sections with no content are dropped rather than posted as empty headings —
 * a meeting with no action items should say nothing about action items.
 */
export function formatSummaryForChat(
  summary: MeetingSummary,
  options: { botName: string; appUrl?: string | undefined },
): string[] {
  const lines: string[] = [
    `📝 ${options.botName} — meeting summary`,
  ];

  if (summary.text.trim()) {
    lines.push(clamp(summary.text));
  }

  if (summary.keyPoints.length > 0) {
    lines.push(
      clamp(
        `Key points: ${summary.keyPoints
          .map((point, i) => `${i + 1}. ${point}`)
          .join('  ')}`,
      ),
    );
  }

  if (summary.actionItems.length > 0) {
    lines.push(
      clamp(
        `Action items: ${summary.actionItems
          .map((item) => {
            const owner = item.owner ? `${item.owner}: ` : '';
            const due = item.dueDate ? ` (due ${item.dueDate})` : '';
            return `${owner}${item.task}${due}`;
          })
          .join('  •  ')}`,
      ),
    );
  }

  if (options.appUrl) {
    lines.push(`Full transcript and notes: ${options.appUrl}`);
  }

  return lines;
}
