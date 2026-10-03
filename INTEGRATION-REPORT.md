# Recall: frontend rebuild and real-backend report

Written for: the repo owner, to review what changed and decide what happens next.

The assessment now says **the backend has to be real and connected: a working database and API, not mock data or hardcoded responses.** This report covers the new frontend, the audit against that rule, and what was rebuilt to meet it.

## 1. Audit result (before this change)

Atlas was connected and held real documents, but a lot of what the product showed was canned:

| Area | Was | Verdict |
|---|---|---|
| Bot transcript | One scripted Alice/Bob/Carol dialogue for every call (6 identical fake recordings in Atlas) | Hardcoded |
| Bot summary | Regex over that script | Hardcoded |
| Ask | 3 pre-written Q&A threads matched by keyword overlap | Hardcoded |
| Upcoming meetings | 3 hand-written rows in an `upcoming` collection | Mock |
| Audio | None. The player said "Simulated playback" | Mock |
| Database outage | Silently served bundled seed data | Masked failures |
| Queue, calendar sync, highlights, shares, search, analytics | Real writes/reads | OK |

## 2. What the backend does now

```
landing / ─POST /api/bot/join─▶ botJobs ◀─poll─ backend `watch` ─▶ Chrome in Meet
                                                      │ tap remote WebRTC audio, sample speaker names from captions
                                                      ├─POST /api/bot/audio  (20 s slices, as the call happens)
                                                      └─POST /api/bot/finalize (when the call ends)
                                                                   │
        Atlas: audioChunks ─▶ assemble ─▶ Groq Whisper (text + timestamps)
                                          ├─ merge with speaker samples ─▶ turns
                                          ├─ Groq gpt-oss-120b: notes ─▶ 5 template summaries, every claim cited to turns
                                          └─ meetings / transcripts / summaries / analytics + audio in GridFS
        /calls/:id  ◀── streams /api/audio/:id (Range)        Ask ─▶ /api/ask: BM25 over real turns ─▶ gpt-oss-120b, validated citations
```

- **Audio** is real. The bot injects a hook before Meet loads, mixes every incoming audio track and records it. Only remote audio is tapped, so the bot never records itself.
- **Speakers.** Whisper has no speaker labels, so the bot turns on Meet's captions and samples whose name is showing. Segments with no sample stay "Speaker". Names are never guessed.
- **Summaries** are generated per template from the real transcript in two stages, so long calls fit Groq's free-tier limits. Claims without a valid citation are dropped.
- **Ask** retrieves transcript turns first and only then calls the model. If nothing matches it says so without calling the model. Citations are checked against the turns supplied, so a made-up reference can't pass.
- **Playback** uses the real recording, so "Simulated playback" no longer appears for bot-recorded calls.
- **Failures surface.** With `MONGODB_URI` set, a read that fails throws instead of showing seed data. Without it the app runs in an explicit local mode on the two seed meetings.

## 3. What changed

**Removed:** the scripted capture (`recording.ts`, `transcription.ts`), `/api/stub/meeting`, `/api/bot/transcript`, the stub scripts, the `askThreads` and `upcoming` collections and code, and the canned Ask threads. The 6 fake recordings and both collections were purged from Atlas with `scripts/purge-stubs.ts`.

**Added:** `lib/groq.ts`, `lib/audio.ts`, `lib/pipeline.ts`, `lib/summarize.ts`, `lib/ask.ts`; routes `/api/bot/audio`, `/api/bot/finalize`, `/api/audio/[id]`, `/api/ask`; backend `meet/capture.ts`.

**Changed:** the Ask panel calls the API; `saveRecording` replaces `saveBotTranscript` (unique ids, new palette, real start time, audio URL); bot status reporting and job → call linking from the previous round stay.

Earlier in the project: new landing page at `/`, app re-skinned to the Recall design system, library moved to `/calls`, and the landing form queues real jobs.

## 4. Verified vs not verified

**Verified:**
- Both packages typecheck.
- The audio hook, tested for real in Chrome with a loopback WebRTC call: it tapped the remote track, recorded it and uploaded an authenticated slice.
- Storage against Atlas: slices reassemble in order, GridFS stores the file, and `/api/audio/:id` returns correct `206` byte ranges. Test data was deleted afterwards.
- Segment → turn merging: hallucinated "Thank you." is filtered, adjacent same-speaker segments merge, and unlabelled speech stays "Speaker".

- **Groq, with your key**, on synthetic two-voice speech:
  - Whisper transcribed it correctly.
  - Segments were assigned to the right speakers and merged into turns.
  - All 5 template summaries generated in about 7 seconds, with cited key points, an action item owned by the right person ("Thursday" due date) and no failed templates.
  - Ask returned grounded answers with validated citations on your seeded meetings, and refused an off-topic question.
- **Model change:** `llama-3.3-70b-versatile` is not available on your key, so the default LLM is `openai/gpt-oss-120b` (override with `GROQ_LLM_MODEL`).

**Not verified:**
- **The bot in a real Meet call.** The speaker sampling reads Meet's captions region by its accessible name and the last avatar's label. That is a best guess at Meet's markup. If it doesn't match, the run logs a `selector.miss` for `captions.speakerName` and speakers come out as "Speaker".
- `/api/bot/finalize` end to end (it writes to Atlas, so I ran its stages separately instead).
- Queue happy path against Mongo, and the final look of `/calls` and `/calls/[id]` after the last edits.

## 5. What is left

1. Run a real call (the Groq key is in place): frontend dev server, `npm run backend -- watch --api http://localhost:3000 --token $BOT_TOKEN`, paste a Meet link on `/`, admit the bot, talk for a minute, end the call.
2. **Zoom.** The audio hook is platform-neutral, but the join flow, the in-call detection and speaker sampling are Meet-only. Zoom needs its own join module and speaker source.
3. **Recording length.** Groq's free tier caps a file at 25 MB. At 32 kbps that is about 100 minutes; longer calls are rejected with a clear error. Splitting by time would lift the cap.
4. **Deployment.** Needs `MONGODB_URI`, `BOT_TOKEN` and `GROQ_API_KEY` on the host, and a machine with Chrome for the runner.
5. Landing page demo content (Direction session, "Ask the room") is still the reference's marketing copy. It is not wired to real data.

## 6. Known rough edges

- Recordings are WebM without a duration header, so seeking can be slower than usual. A transcode step would fix it.
- `/api/bot/join` and `/api/bot/jobs` are public by design, with no rate limit.
- Summaries for all 5 templates are generated at the end of the call, which can take a minute or two on the free tier. The bot waits for that before posting its chat summary.
- The two seed meetings (Q4 planning, Meridian discovery) are hand-authored and have no audio. Their transcripts and summaries are real documents in Atlas, but not machine-generated.
- `scripts/seed.ts` rewrites the `meetings` collection, so re-running it deletes bot recordings.
- Two root layouts mean `/` ↔ `/calls` is a full page load. `/design` still iframes an old prototype.
