/**
 * Transcription service for the bot.
 * 
 * Captures chat messages and speaker activity from the meeting and builds
 * a transcript. In a real system, this would also capture audio and use
 * Whisper for speech-to-text, but for the demo we'll build from chat.
 */
import type { Page } from 'playwright-core';

export interface TranscriptTurn {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export interface MeetingSummary {
  text: string;
  keyPoints: string[];
  actionItems: Array<{ task: string; owner?: string; dueDate?: string }>;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export class TranscriptionService {
  private turns: TranscriptTurn[] = [];
  private meetingStartTime: number = Date.now();
  private participants: Map<string, string> = new Map(); // id -> name mapping

  constructor() {
    // Initialize with notetaker as a known participant
    this.participants.set('notetaker', 'Notetaker (bot)');
  }

  /**
   * Register a participant in the meeting
   */
  registerParticipant(id: string, name: string): void {
    this.participants.set(id, name);
  }

  /**
   * Add a turn to the transcript
   * This is typically called when parsing chat or detecting speech
   */
  addTurn(speaker: string, text: string, startMs?: number, endMs?: number): void {
    const id = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const speakerName = this.participants.get(speaker) || speaker;
    const elapsedMs = startMs ?? Date.now() - this.meetingStartTime;
    
    this.turns.push({
      id,
      speakerId: speaker,
      speakerName,
      text,
      startMs: elapsedMs,
      endMs: endMs ?? elapsedMs + 5000, // Assume 5s default per turn
      confidence: 0.95,
    });
  }

  /**
   * Get all turns recorded so far
   */
  getTurns(): TranscriptTurn[] {
    return [...this.turns];
  }

  /**
   * Generate a summary from the transcript
   * In a real system, this would call an LLM API
   */
  async generateSummary(): Promise<MeetingSummary> {
    if (this.turns.length === 0) {
      return {
        text: 'No content recorded during this meeting.',
        keyPoints: [],
        actionItems: [],
        sentiment: 'neutral',
      };
    }

    // Build a transcript string for analysis
    const transcript = this.turns
      .map(turn => `${turn.speakerName}: ${turn.text}`)
      .join('\n');

    // For demo: create a simple summary from the content
    // In production, call OpenAI GPT, Claude, etc.
    const keyPoints = this.extractKeyPoints(transcript);
    const actionItems = this.extractActionItems(transcript);
    const summary = this.createSummaryText(keyPoints);

    return {
      text: summary,
      keyPoints,
      actionItems,
      sentiment: this.detectSentiment(transcript),
    };
  }

  private extractKeyPoints(transcript: string): string[] {
    // Simple keyword extraction for demo
    const sentences = transcript
      .split('.')
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 200);
    
    // Return the longest/most important looking sentences
    return sentences
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);
  }

  private extractActionItems(transcript: string): Array<{ task: string; owner?: string }> {
    // Look for action indicators
    const actionPatterns = [
      /(?:need to|should|will|must|action item|todo|task).+?[\.\,]/gi,
      /(?:you|we|[A-Z]\w+)\s+(?:will|should|need to)\s+([^\.]+)/gi,
    ];

    const items: Array<{ task: string; owner?: string }> = [];
    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(transcript)) !== null) {
        items.push({
          task: match[0].replace(/action item|todo|task/gi, '').trim(),
        });
      }
    }

    return items.slice(0, 5); // Top 5 action items
  }

  private createSummaryText(keyPoints: string[]): string {
    if (keyPoints.length === 0) {
      return 'Meeting held with ' + this.participants.size + ' participants. No specific key points detected.';
    }

    const points = keyPoints
      .map((p, i) => `${i + 1}. ${p}`)
      .join('\n');

    return `Meeting Summary:\n\n${points}\n\nKey discussions occurred between ${this.participants.size} participants. The meeting covered various important topics and decisions.`;
  }

  private detectSentiment(transcript: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = /great|excellent|perfect|good|agree|success|complete/gi;
    const negativeWords = /problem|issue|fail|broken|disagree|difficult|challenge/gi;

    const posCount = (transcript.match(positiveWords) || []).length;
    const negCount = (transcript.match(negativeWords) || []).length;

    if (posCount > negCount * 1.5) return 'positive';
    if (negCount > posCount * 1.5) return 'negative';
    return 'neutral';
  }

  /**
   * Reset for a new meeting
   */
  reset(): void {
    this.turns = [];
    this.meetingStartTime = Date.now();
    this.participants.clear();
    this.participants.set('notetaker', 'Notetaker (bot)');
  }
}
