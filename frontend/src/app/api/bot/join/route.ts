import { spawn } from 'child_process';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

/**
 * In-memory store of active bot processes
 * In production, this would use a database
 */
const activeBots: Map<string, { pid: number; meetingId: string; startedAt: Date }> = new Map();

/**
 * Whether this instance can actually drive the capture bot.
 *
 * The bot is a separate Playwright process living in `../backend`. That sibling
 * directory, `tsx`, and a real Chrome all exist on a developer's machine and
 * none of them exist on the deployed host — so spawning there fails with an
 * opaque 500. Gating on an explicit opt-in lets the deployed app say what is
 * actually true instead.
 */
const CAPTURE_ENABLED = process.env.ENABLE_CAPTURE_BOT === '1';

export async function POST(request: Request) {
  try {
    if (!CAPTURE_ENABLED) {
      // Deliberate scope cut, stated plainly rather than failing obscurely.
      return Response.json(
        {
          error: 'Capture layer is stubbed in this deployment.',
          detail:
            'The Google Meet bot is real and lives in /backend — it launches Chrome, ' +
            'classifies the pre-join screen, mutes camera and mic, sets its name and ' +
            'requests admission. It is not wired into the hosted demo because it needs ' +
            'a browser process and a human to admit it. Run it locally with: ' +
            'npm run backend -- join --url <meet-url>',
          stubbed: true,
        },
        { status: 501 },
      );
    }

    const body = await request.json();
    const { meetingId, meetingUrl, botName = 'Notetaker' } = body;

    if (!meetingId || !meetingUrl) {
      return Response.json(
        { error: 'meetingId and meetingUrl are required' },
        { status: 400 }
      );
    }

    // Check if bot is already running for this meeting
    if (activeBots.has(meetingId)) {
      return Response.json(
        { error: 'Bot is already running for this meeting' },
        { status: 409 }
      );
    }

    // Spawn bot process
    // The bot is in /backend, so we need to go up from /frontend
    const botDir = resolve(process.cwd(), '../backend');
    
    const botProcess = spawn('npx', ['tsx', 'src/index.ts', 'join', '--url', meetingUrl, '--name', botName], {
      cwd: botDir,
      detached: true,
      stdio: 'ignore',
    });

    const pid = botProcess.pid;
    if (!pid) {
      return Response.json(
        { error: 'Failed to spawn bot process' },
        { status: 500 }
      );
    }

    // Store bot info
    activeBots.set(meetingId, {
      pid,
      meetingId,
      startedAt: new Date(),
    });

    // Allow process to continue in background
    botProcess.unref();

    return Response.json({
      success: true,
      message: 'Bot is joining the meeting',
      botInfo: {
        pid,
        meetingId,
        startedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error starting bot:', error);
    return Response.json(
      { error: 'Failed to start bot: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return status of all active bots
  const bots = Array.from(activeBots.values()).map(bot => ({
    ...bot,
    startedAt: bot.startedAt.toISOString(),
  }));

  return Response.json({ activeBots: bots });
}
