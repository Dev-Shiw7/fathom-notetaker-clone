'use client';

import React, { useEffect, useState } from 'react';
import type { Meeting, Transcript, MeetingAnalytics } from '@/lib/types';
import { usePlayback } from '@/components/player/usePlayback';
import { TalkRibbon } from '@/components/player/TalkRibbon';
import { TranscriptList } from '@/components/transcript/TranscriptList';

interface Props {
  meeting: Meeting;
  transcript: Transcript | null;
  analytics: MeetingAnalytics | null;
}

export default function MainPlayer({ meeting, transcript, analytics }: Props) {
  const duration = meeting?.durationMs ?? 0;
  const audioUrl = meeting?.audioUrl ?? null;
  const pb = usePlayback(duration, audioUrl);
  const [botJoining, setBotJoining] = useState(false);
  const [botStatus, setBotStatus] = useState<string | null>(null);

  useEffect(() => {
    // reset on meeting change
    pb.seek(0);
    setBotStatus(null);
  }, [meeting?.id]);

  const handleAddBot = async () => {
    try {
      setBotJoining(true);
      setBotStatus('Starting bot...');
      
      const response = await fetch('/api/bot/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id,
          meetingUrl: `https://meet.google.com/${meeting.id}`,
          botName: 'Notetaker',
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        setBotStatus(`Error: ${data.error}`);
        return;
      }

      setBotStatus('✓ Bot is joining the meeting');
      setTimeout(() => setBotStatus(null), 3000);
    } catch (error) {
      setBotStatus(`Error: ${(error as Error).message}`);
    } finally {
      setBotJoining(false);
    }
  };

  if (!meeting) return <div style={{padding:20}}>No meeting selected</div>;

  return (
    <div className="main" style={{display:'flex', flexDirection:'column', height:'100vh'}}>
      <div className="topbar">
        <div>
          <h1 className="tb-title">{meeting.title}</h1>
          <div className="tb-meta">{new Date(meeting.startedAt).toLocaleDateString()} · {Math.round(meeting.durationMs/60000)} min · {meeting.participants.length}p</div>
        </div>
        <div className="tb-actions">
          <button 
            className="btn" 
            onClick={handleAddBot}
            disabled={botJoining}
            title="Start the Notetaker bot to join this meeting"
          >
            {botJoining ? '⟳' : '🤖'} Bot
          </button>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(window.location.href)}>↗ Share</button>
          <button className="btn primary" onClick={() => pb.toggle()}>{pb.playing ? '❚❚' : '▶'}</button>
        </div>
      </div>

      {botStatus && (
        <div style={{
          padding: '12px 28px',
          backgroundColor: botStatus.includes('Error') ? '#fee' : '#efe',
          color: botStatus.includes('Error') ? '#c33' : '#3c3',
          fontSize: '14px',
          borderBottom: '1px solid #ddd',
        }}>
          {botStatus}
        </div>
      )}

      <div className="workspace" style={{display:'grid', gridTemplateColumns:'1fr 380px', overflow:'hidden', flex:1}}>
        <div className="left-pane" style={{padding:'20px 28px 60px 28px'}}>
          <div className="player">
            <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
              <button className="center-play" onClick={() => pb.toggle()}>{pb.playing ? '❚❚' : '▶'}</button>
            </div>
            <div className="caption" style={{position:'absolute', bottom:14,left:16,right:16}}>{transcript?.turns?.[0]?.text ?? ''}</div>
          </div>

          <div style={{height:12}} />
          <TalkRibbon
            durationMs={duration}
            turns={transcript?.turns ?? []}
            participants={meeting.participants}
            highlights={[]}
            positionMs={pb.positionMs}
            onSeek={(ms) => pb.seek(ms)}
            onCreateClip={() => { alert('clip created (stub)'); }}
          />

          <div className="transcript-toolbar" style={{marginTop:12}}>
            <div className="t-search"><input placeholder="Search this transcript…" onInput={() => {}}/></div>
            <div style={{flex:1}} />
            <div className={`autoscroll-toggle ${true ? 'on' : ''}`}>Auto-scroll</div>
          </div>

          <div style={{height:12}} />
          <TranscriptList
            turns={transcript?.turns ?? []}
            participants={meeting.participants}
            positionMs={pb.positionMs}
            onSeek={(ms) => pb.seek(ms)}
            following={true}
            onFollowingChange={() => {}}
          />
        </div>

        <div className="right-pane">
          <div className="r-tabs"><div className="r-tab active">Summary</div><div className="r-tab">Actions</div></div>
          <div className="r-content" style={{padding:18}}>
            <div className="sec-title">AI summary</div>
            <div style={{marginTop:8}}>Summary rendering is stubbed for the demo — templates come from the seed data.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
