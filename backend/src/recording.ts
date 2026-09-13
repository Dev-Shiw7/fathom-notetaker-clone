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
  actualDurationMs: number = 118_000,
): Promise<{ turns: TranscriptTurn[]; summary: MeetingSummary }> {
  // Log that we're using stub recording
  log.emit('recording.started', {
    method: 'stub',
    reason: `Capture layer mapped proportionally to ${Math.round(actualDurationMs / 1000)}s actual meeting duration`,
  });

  // Generate stub transcript
  const service = new TranscriptionService();
  
  // Register some realistic participants
  const participants = [
    { id: 'p1', name: 'Alice Johnson' },
    { id: 'p2', name: 'Bob Smith' },
    { id: 'p3', name: 'Carol Williams' },
  ];

  participants.forEach(p => service.registerParticipant(p.id, p.name));

  // Generate realistic turns scaled to actual meeting duration
  const stubTurns = generateStubTurns(participants.length, actualDurationMs);
  
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
 * Generate realistic stub transcript turns scaled to actual meeting duration
 */
function generateStubTurns(
  participantCount: number,
  actualDurationMs: number = 118_000,
): Array<{
  speakerId: string;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
}> {
  const baseTurns = [
    { idx: 0, text: "Hey everyone, thanks for joining. Let's get started with the agenda for today.", baseStart: 2, baseEnd: 8 },
    { idx: 1, text: "Thanks Alice. I've prepared an update on the Q3 numbers.", baseStart: 10, baseEnd: 15 },
    { idx: 0, text: "Great, please go ahead.", baseStart: 16, baseEnd: 18 },
    { idx: 1, text: "So we're looking at a 15% increase in revenue compared to Q2. The sales team did great work closing the big enterprise deal.", baseStart: 19, baseEnd: 30 },
    { idx: 2, text: "That's excellent news. What about churn?", baseStart: 31, baseEnd: 35 },
    { idx: 1, text: "Churn decreased by 2 points. Our retention initiatives are paying off.", baseStart: 36, baseEnd: 42 },
    { idx: 0, text: "Perfect. Next, I want to discuss the product roadmap. We need to prioritize the API improvements.", baseStart: 44, baseEnd: 52 },
    { idx: 2, text: "I agree. The enterprise customers have been asking about better API documentation and webhooks support.", baseStart: 54, baseEnd: 64 },
    { idx: 0, text: "Action item: Carol, can you create a spec for the webhook implementation by end of week?", baseStart: 66, baseEnd: 73 },
    { idx: 2, text: "Yes, I'll get that done. Should be ready by Thursday.", baseStart: 74, baseEnd: 80 },
    { idx: 0, text: "Great. Let's also accelerate the mobile app release. We should ship v2.0 next month.", baseStart: 82, baseEnd: 90 },
    { idx: 1, text: "I think we can make it happen. The team is ready.", baseStart: 92, baseEnd: 98 },
    { idx: 0, text: "Excellent. Any other items we should cover?", baseStart: 100, baseEnd: 105 },
    { idx: 2, text: "I think we covered the main points. Good call today.", baseStart: 106, baseEnd: 111 },
    { idx: 0, text: "Thanks everyone. Let's sync again next week.", baseStart: 112, baseEnd: 118 },
  ];

  const scale = Math.max(0.1, actualDurationMs / 118_000);

  const getSpeaker = (index: number): string => (['p1', 'p2', 'p3'][index % Math.max(1, participantCount)] ?? 'p1');
  const getSpeakerName = (id: string): string => {
    if (id === 'p1') return 'Alice Johnson';
    if (id === 'p2') return 'Bob Smith';
    if (id === 'p3') return 'Carol Williams';
    return 'Participant';
  };

  return baseTurns.map((turn) => {
    const speakerId = getSpeaker(turn.idx);
    const speakerName = getSpeakerName(speakerId);
    return {
      speakerId,
      speakerName,
      text: turn.text,
      startMs: Math.round(turn.baseStart * 1000 * scale),
      endMs: Math.round(turn.baseEnd * 1000 * scale),
    };
  });
}
