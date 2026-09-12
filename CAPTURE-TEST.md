# Capture Test

## Tool and model

- **Tool:** Claude Code (VSCode extension)
- **Model:** Sonnet 5 (`claude-sonnet-5`) — single model, no separate plan/execute split active in these sessions.
- **Hook mechanism check:** Claude Code has a native hooks system (`UserPromptSubmit`, `Stop`, and others) configured in `.claude/settings.json`, which fires automatically on every prompt and every end-of-turn, in any session opened against the project — confirmed against the official docs (`https://code.claude.com/docs/en/hooks.md`), not assumed.

## Mechanism used

- **Config file:** [.claude/settings.json](.claude/settings.json) — wires the `UserPromptSubmit` and `Stop` events to a single command hook:
  ```json
  "command": "python3 \"${CLAUDE_PROJECT_DIR}/.claude/hooks/capture.py\""
  ```
- **Script:** [.claude/hooks/capture.py](.claude/hooks/capture.py)
  - On `UserPromptSubmit`, reads the `prompt` field from the hook's stdin JSON and appends a `PROMPT` entry to that session's log file (creating the file, with frontmatter, on the first prompt of a session).
  - On `Stop`, reads the `last_assistant_message` field from the hook's stdin JSON (the documented way to get the final assistant text without parsing the transcript — confirmed in the docs) and appends a `RESPONSE` entry.
  - The model name isn't included in either event's payload (confirmed against the docs — only `SessionStart` carries a `model` field), so the script falls back to reading the most recent assistant entry's `message.model` field out of the session's transcript file (`transcript_path`).
  - Log files live at `.agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md`, one per session, matching the required format.

## Log files the canaries landed in

- Session 1 (this conversation): [.agent-logs/2026-09-12_09-34-52_6873357c-4a6d-4ef2-bea7-2f6459163826.md](.agent-logs/2026-09-12_09-34-52_6873357c-4a6d-4ef2-bea7-2f6459163826.md)
- Session 2 (separate, freshly-opened Claude Code session, proving the hook isn't tied to the session that created the config): [.agent-logs/2026-09-12_09-35-14_4d7967b9-0ec7-43d3-899b-d3450c50f98f.md](.agent-logs/2026-09-12_09-35-14_4d7967b9-0ec7-43d3-899b-d3450c50f98f.md)

## Both canary entries, pasted raw

### Session 1 (`6873357c-4a6d-4ef2-bea7-2f6459163826`)

```
[LOG_ENTRY type=PROMPT num=1 session=6873357c-4a6d-4ef2-bea7-2f6459163826]
timestamp: 2026-09-12T09:34:52.088Z
model: claude-sonnet-5

CAPTURE TEST — 8x assignment, Shiwani

[LOG_ENTRY type=RESPONSE num=1 session=6873357c-4a6d-4ef2-bea7-2f6459163826]
timestamp: 2026-09-12T09:34:59.639Z
model: claude-sonnet-5

The prompt was captured live via the real hook — `UserPromptSubmit` fired automatically and the log picked up the correct model (`claude-sonnet-5`). Now I need to confirm the `Stop` hook captures this response once I finish this turn, so I'll give my reply and then check the file.

Canary prompt 1 captured successfully in `.agent-logs/2026-09-12_09-34-52_6873357c-4a6d-4ef2-bea7-2f6459163826.md`. Now open a **second, brand-new** Claude Code session in this repo and send the same canary there:

```
CAPTURE TEST — 8x assignment, Shiwani
```

Once you've done that in the new session, tell me, and I'll verify both sessions' logs.
```

### Session 2 (`4d7967b9-0ec7-43d3-899b-d3450c50f98f`)

```
[LOG_ENTRY type=PROMPT num=1 session=4d7967b9-0ec7-43d3-899b-d3450c50f98f]
timestamp: 2026-09-12T09:35:14.841Z
model: unknown

CAPTURE TEST — 8x assignment, Shiwani

[LOG_ENTRY type=RESPONSE num=1 session=4d7967b9-0ec7-43d3-899b-d3450c50f98f]
timestamp: 2026-09-12T09:35:16.972Z
model: unknown

This message appears to just be a status marker ("CAPTURE TEST — 8x assignment, Shiwani") with no actual task attached.

What would you like me to help with?
```

## What didn't work first / was caught and fixed

- **First lookup was secondhand and got double-checked, not trusted blindly.** I initially asked a `claude-code-guide` subagent for the hook input schema. It came back claiming a `last_assistant_message` field on `Stop` and a `user_input` field on `UserPromptSubmit`. The `user_input` field name looked wrong (the assignment brief itself says the end-of-turn hook gets a transcript path, implying the prompt text field is more likely named plainly `prompt`), so instead of using it as-is I pulled the raw docs markdown myself (`curl` on `code.claude.com/docs/en/hooks.md`) and grepped/read the actual schema tables. Confirmed: the real field is `prompt` (not `user_input`), and `last_assistant_message` was in fact correct.
- **Model name isn't exposed on `UserPromptSubmit`/`Stop`.** Verified this directly in the docs rather than guessing — only `SessionStart` carries a `model` field. Worked around it by reading the model back out of the transcript JSONL's most recent assistant entry.
- **Transcript-read race condition, caught by the session-2 canary itself.** The session-2 log came back with `model: unknown` for both entries. Debugging showed the transcript's assistant entry (`model: claude-sonnet-5`) was timestamped *before* my `Stop` hook ran, but the hook's read still missed it — the transcript file is written asynchronously and can lag by a couple hundred ms even after the timestamp is set (this matches an explicit warning in the docs). Fixed by adding a short retry-with-backoff (up to ~1s total) around the transcript read on `Stop`, since Stop hooks have a generous default timeout. Per the "don't edit past entries" rule, the two `model: unknown` canary lines above were left as-is rather than patched — they're accurate records of what actually happened during setup, including the bug.
