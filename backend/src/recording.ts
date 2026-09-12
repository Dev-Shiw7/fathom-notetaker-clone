/**
 * Stub recording service for the bot.
 * 
 * Simulates the capture layer by generating a realistic transcript from
 * the meeting. This is a legitimate stub per the brief: "You do not have
 * to make the recording bot work. Faking or stubbing the capture layer
 * is a legitimate call."
 */
import type { Page } from 'playwright-core';
import type { SessionLogger } from './logging/events.js';
import { TranscriptionService, type MeetingSummary, type TranscriptTurn } from './transcription.js';

/**
 * Stub meeting recording: simulates sitting in a meeting for a bit,
 * then generates a realistic transcript and summary.
 */
export async function recordStubTranscript(
  page: Page,
  meetingCode: string,
  log: SessionLogger,
): Promise<{ turns: TranscriptTurn[]; summary: MeetingSummary }> {
  // Log that we're using stub recording
  log.emit('recording.started', {
    method: 'stub',
    reason: 'Capture layer is stubbed for demo; realistic data generated',
  });

  // Simulate sitting in the call for 30-60 seconds
  const recordingDuration = 30_000 + Math.random() * 30_000;
  let elapsedMs = 0;
  const tickInterval = 5_000;

  while (elapsedMs < recordingDuration) {
    await page.waitForTimeout(Math.min(tickInterval, recordingDuration - elapsedMs)).catch(() => {});
    elapsedMs += tickInterval;
    
    // Periodic events to make it feel real
    if (Math.random() > 0.7) {
      log.emit('recording.tick', { elapsedMs });
    }
  }

  log.emit('recording.completed', { durationMs: recordingDuration });

  // Generate stub transcript
  const service = new TranscriptionService();
  
  // Register some realistic participants
  const participants = [
    { id: 'p1', name: 'Alice Johnson' },
    { id: 'p2', name: 'Bob Smith' },
    { id: 'p3', name: 'Carol Williams' },
  ];

  participants.forEach(p => service.registerParticipant(p.id, p.name));

  // Generate realistic turns based on common meeting patterns
  const stubTurns = generateStubTurns(participants.length);
  
  // Add turns to service
  stubTurns.forEach(turn => {
    service.registerParticipant(turn.speakerId, turn.speakerName);
    service.addTurn(turn.speakerId, turn.text, turn.startMs, turn.endMs);
  });

  // Generate summary
  const summary = await service.generateSummary();

  log.emit('transcript.generated', {
    turnCount: stubTurns.length,
    participantCount: participants.length,
  });

  return {
    turns: service.getTurns(),
    summary,
  };
}

/**
 * Generate realistic stub transcript turns for a typical meeting
 */
function generateStubTurns(
  participantCount: number,
): Array<{
  speakerId: string;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
}> {
  const speakers = ['p1', 'p2', 'p3'].slice(0, Math.max(1, participantCount));
  
  const getSpeaker = (index: number): string => {
    const speaker = speakers[Math.min(index, speakers.length - 1)];
    return speaker || 'p1';
  };
  
  const getSpeakerName = (id: string): string => {
    if (id === 'p1') return 'Alice Johnson';
    if (id === 'p2') return 'Bob Smith';
    if (id === 'p3') return 'Carol Williams';
    return 'Participant';
  };

  const turns = [
    // Opening
    {
      speakerId: getSpeaker(0),
      speakerName: getSpeakerName(getSpeaker(0)),
      text: 'Hey everyone, thanks for joining. Let\'s get started with the agenda for today.',
      startMs: 2000,
      endMs: 8000,
    },
    {
      speakerId: getSpeaker(1),
      speakerName: getSpeakerName(getSpeaker(1)),
      text: 'Thanks Alice. I\'ve prepared an update on the Q3 numbers.',
      startMs: 10000,
      endMs: 15000,
    },
    {
      speakerId: getSpeaker(0),
      speakerName: getSpeakerName(getSpeaker(0)),
      text: 'Great, please go ahead.',
      startMs: 16000,
      endMs: 18000,
    },
    {
      speakerId: getSpeaker(1),
      speakerName: getSpeakerName(getSpeaker(1)),
      text: 'So we\'re looking at a 15% increase in revenue compared to Q2. The sales team did great work closing the big enterprise deal.',
      startMs: 19000,
      endMs: 30000,
    },
    {
      speakerId: getSpeaker(2),
      speakerName: getSpeakerName(getSpeaker(2)),
      text: 'That\'s excellent news. What about churn?',
      startMs: 31000,
      endMs: 35000,
    },
    {
      speakerId: getSpeaker(1),
      speakerName: getSpeakerName(getSpeaker(1)),
      text: 'Churn decreased by 2 points. Our retention initiatives are paying off.',
      startMs: 36000,
      endMs: 42000,
    },
    {
      speakerId: getSpeaker(0),
      speakerName: getSpeakerName(getSpeaker(0)),
      text: 'Perfect. Next, I want to discuss the product roadmap. We need to prioritize the API improvements.',
      startMs: 44000,
      endMs: 52000,
    },
    {
      speakerId: getSpeaker(2),
      speakerName: getSpeakerName(getSpeaker(2)),
      text: 'I agree. The enterprise customers have been asking about better API documentation and webhooks support.',
      startMs: 54000,
      endMs: 64000,
    },
    {
      speakerId: getSpeaker(0),
      speakerName: getSpeakerName(getSpeaker(0)),
      text: 'Action item: Carol, can you create a spec for the webhook implementation by end of week?',
      startMs: 66000,
      endMs: 73000,
    },
    {
      speakerId: getSpeaker(2),
      speakerName: getSpeakerName(getSpeaker(2)),
      text: 'Yes, I\'ll get that done. Should be ready by Thursday.',
      startMs: 74000,
      endMs: 80000,
    },
    {
      speakerId: getSpeaker(0),
      speakerName: getSpeakerName(getSpeaker(0)),
      text: 'Great. Let\'s also accelerate the mobile app release. We should ship v2.0 next month.',
      startMs: 82000,
      endMs: 90000,
    },
    {
      speakerId: getSpeaker(1),
      speakerName: getSpeakerName(getSpeaker(1)),
      text: 'I think we can make it happen. The team is ready.',
      startMs: 92000,
      endMs: 98000,
    },
    {
      speakerId: getSpeaker(0),
      speakerName: getSpeakerName(getSpeaker(0)),
      text: 'Excellent. Any other items we should cover?',
      startMs: 100000,
      endMs: 105000,
    },
    {
      speakerId: getSpeaker(2),
      speakerName: getSpeakerName(getSpeaker(2)),
      text: 'I think we covered the main points. Good call today.',
      startMs: 106000,
      endMs: 111000,
    },
    {
      speakerId: getSpeaker(0),
      speakerName: getSpeakerName(getSpeaker(0)),
      text: 'Thanks everyone. Let\'s sync again next week.',
      startMs: 112000,
      endMs: 118000,
    },
  ];

  return turns;
}
