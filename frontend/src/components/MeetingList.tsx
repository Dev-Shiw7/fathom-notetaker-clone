'use client';

import React from 'react';
import type { Meeting } from '@/lib/types';

interface Props {
  meetings: Meeting[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSearchClick?: () => void;
}

export default function MeetingList({ meetings, selectedId, onSelect, onSearchClick }: Props) {
  return (
    <div style={{width:280}}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-name">Recap</div>
        </div>
        <div style={{padding: '0 16px 12px 16px'}}>
          <input
            id="globalSearchSmall"
            placeholder="Search all meetings… ⌘K"
            readOnly
            onClick={onSearchClick}
            style={{width: '100%', padding:8, borderRadius:8, border:'1px solid #e6e8f0', cursor: 'pointer'}}
          />
        </div>
        <div style={{padding: '0 16px 12px 16px'}}>
          <button className="new-btn" onClick={() => alert('Recording is stubbed in this demo')}>＋ Record a meeting</button>
        </div>
        <div className="section-label">MEETINGS</div>
        <div className="meeting-list" style={{padding: '0 10px 16px 10px'}}>
          {meetings.map((m) => (
            <div key={m.id} className={`m-card ${m.id === selectedId ? 'active' : ''}`} onClick={() => onSelect(m.id)}>
              <div className="m-thumb"><div className="play" /></div>
              <div className="m-info">
                <div className="m-title">{m.title}</div>
              <div className="m-sub">{new Date(m.startedAt).toLocaleDateString()} · {Math.round(m.durationMs/60000)} min · {m.participants.length}p</div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
