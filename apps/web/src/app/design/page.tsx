import React from 'react';

export const metadata = { title: 'Design preview — Recap' };

export default function DesignPage() {
  return (
    <div style={{height: '100vh', width: '100%'}}>
      <iframe src="/design-index.html" title="Recap design preview" style={{border: 0, width: '100%', height: '100%'}} />
    </div>
  );
}
