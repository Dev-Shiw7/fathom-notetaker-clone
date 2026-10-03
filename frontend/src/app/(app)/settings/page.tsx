import IntegrationsPanel from '@/components/settings/IntegrationsPanel';

export const metadata = { title: 'Calendar & bot — Recap' };

// Always rendered fresh: it shows live queue and calendar state.
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 pb-16 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Calendar &amp; bot</h1>
      <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-[var(--text-muted)]">
        Connect a calendar so the notetaker joins your meetings automatically,
        and watch what the capture queue is doing.
      </p>
      <IntegrationsPanel />
    </div>
  );
}
