import React from 'react';

export const metadata = { title: 'Design preview — Cadence' };

export default function DesignPage() {
  return (
    // h-full, not 100vh: this sits below a 56px header inside a clipped body,
    // so a full-viewport frame pushed its own last 56px out of reach.
    <div className="h-full w-full">
      <iframe
        src="/design-index.html"
        title="Cadence design preview"
        className="h-full w-full border-0"
      />
    </div>
  );
}
