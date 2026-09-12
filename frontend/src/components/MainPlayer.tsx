'use client';

import React, { useEffect, useState } from 'react';
import type { Meeting, Transcript, MeetingAnalytics, Summary } from '@/lib/types';
import { usePlayback } from '@/components/player/usePlayback';
import { TalkRibbon } from '@/components/player/TalkRibbon';
import { TranscriptList } from '@/components/transcript/TranscriptList';
import { formatTimestamp } from '@/lib/analytics';

interface Props {
  meeting: Meeting;
  transcript: Transcript | null;
  analytics: MeetingAnalytics | null;
  summaries: Summary[];
  seekTarget?: number | null;
  onSeekConsumed?: () => void;
}

export default function MainPlayer({ meeting, transcript, analytics, summaries, seekTarget, onSeekConsumed }: Props) {
  const duration = meeting?.durationMs ?? 0;
  const audioUrl = meeting?.audioUrl ?? null;
  const pb = usePlayback(duration, audioUrl);
  const [botJoining, setBotJoining] = useState(false);
  const [botStatus, setBotStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'actions'>('summary');

  useEffect(() => {
    // reset on meeting change
    pb.seek(0);
    setBotStatus(null);
    setActiveTab('summary');
  }, [meeting?.id]);

  // Handle external seek requests (e.g. from global search)
  useEffect(() => {
    if (seekTarget != null) {
      pb.seek(seekTarget);
      onSeekConsumed?.();
    }
  }, [seekTarget]);

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
        // A stubbed capture layer is a deliberate decision, not a failure —
        // say what it is and how to run the real bot, rather than "Error:".
        setBotStatus(
          data.stubbed
            ? `${data.error} ${data.detail ?? ''}`
            : `Error: ${data.error}`,
        );
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

  const currentSummary = summaries[0] ?? null;

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

        <div className="right-pane relative flex flex-col min-h-0 border-l border-[var(--border)] bg-[var(--bg-panel)] overflow-y-auto">
          <div className="r-tabs sticky top-0 z-10 bg-[var(--bg-panel)] border-b border-[var(--border)]">
            <div 
              className={`r-tab cursor-pointer ${activeTab === 'summary' ? 'active font-bold text-[var(--accent)] border-b-2 border-[var(--accent)]' : ''}`}
              onClick={() => setActiveTab('summary')}
            >
              Summary
            </div>
            <div 
              className={`r-tab cursor-pointer ${activeTab === 'actions' ? 'active font-bold text-[var(--accent)] border-b-2 border-[var(--accent)]' : ''}`}
              onClick={() => setActiveTab('actions')}
            >
              Actions
            </div>
          </div>
          
          <div className="r-content p-5">
            {activeTab === 'summary' && (
              <>
                <div className="text-lg font-semibold mb-4 text-[var(--text)]">AI Summary</div>
                {currentSummary ? (
                  <div className="space-y-6">
                    <div className="text-[var(--text)] leading-relaxed">
                      {currentSummary.tldr}
                    </div>
                    
                    {currentSummary.topics && currentSummary.topics.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2 text-[var(--text)]">Topics Discussed</h3>
                        <ul className="space-y-3">
                          {currentSummary.topics.map((topic, i) => (
                            <li key={i} className="text-sm">
                              <button 
                                onClick={() => pb.seek(topic.startMs)}
                                className="font-medium text-[var(--accent)] hover:underline text-left block mb-1"
                              >
                                {topic.title} ({formatTimestamp(topic.startMs)})
                              </button>
                              <span className="text-[var(--text-muted)] block leading-relaxed">{topic.summary}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {currentSummary.keyPoints && currentSummary.keyPoints.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2 text-[var(--text)]">Key Points</h3>
                        <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--text-muted)]">
                          {currentSummary.keyPoints.map((kp, i) => (
                            <li key={i}>
                              {kp.text}{' '}
                              <button 
                                onClick={() => pb.seek(kp.citation.startMs)}
                                className="text-[var(--accent)] text-xs hover:underline"
                              >
                                [{formatTimestamp(kp.citation.startMs)}]
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--text-muted)] italic">No summary available for this meeting yet.</div>
                )}
              </>
            )}

            {activeTab === 'actions' && (
              <>
                <div className="text-lg font-semibold mb-4 text-[var(--text)]">Action Items</div>
                {currentSummary?.actionItems && currentSummary.actionItems.length > 0 ? (
                  <ul className="space-y-3">
                    {currentSummary.actionItems.map((action, i) => {
                      const owner = action.ownerId ? meeting.participants.find(p => p.id === action.ownerId) : null;
                      return (
                        <li key={action.id || i} className="p-3 bg-[var(--bg-hover)] rounded-md border border-[var(--border)]">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-[var(--text)] text-sm">{action.text}</span>
                            <button 
                              onClick={() => pb.seek(action.citation.startMs)}
                              className="text-[var(--accent)] text-xs hover:underline shrink-0 ml-2 mt-0.5"
                            >
                              {formatTimestamp(action.citation.startMs)}
                            </button>
                          </div>
                          {(owner || action.dueDate) && (
                            <div className="text-xs text-[var(--text-muted)] mt-2 flex gap-3">
                              {owner && <span>👤 {owner.name}</span>}
                              {action.dueDate && <span>📅 {action.dueDate}</span>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-sm text-[var(--text-muted)] italic">No action items identified.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
