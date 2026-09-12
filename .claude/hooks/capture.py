#!/usr/bin/env python3
"""Claude Code hook: append verbatim prompt/response turns to .agent-logs/.

Fired by UserPromptSubmit (logs the prompt) and Stop (logs the final
response) as configured in .claude/settings.json. Never edit past entries;
this script only ever appends and updates the frontmatter counters.
"""
import glob
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone


def utc_now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def repo_root():
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def git_author():
    for cmd in (["git", "config", "user.name"],):
        try:
            out = subprocess.run(cmd, cwd=repo_root(), capture_output=True,
                                  text=True, timeout=5)
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout.strip()
        except Exception:
            pass
    return os.environ.get("USER", "unknown")


def _read_model_once(transcript_path):
    try:
        with open(transcript_path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            chunk = 200_000
            f.seek(max(0, size - chunk))
            data = f.read().decode("utf-8", errors="ignore")
        for line in reversed(data.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            model = obj.get("message", {}).get("model")
            if model:
                return model
    except OSError:
        pass
    return None


def guess_model(transcript_path, retry=False):
    """Best-effort: read the model off the most recent assistant entry in
    the transcript. Neither UserPromptSubmit nor Stop carries a model field
    directly, so this is the most reliable source short of PostModelSwitch.

    The transcript is written asynchronously and can lag the in-memory
    conversation by a couple hundred ms (observed directly: an assistant
    entry timestamped before this hook still wasn't on disk yet), so at
    Stop time we retry briefly rather than accept a spurious "unknown".
    """
    attempts = [0, 0.15, 0.3, 0.6] if retry else [0]
    for delay in attempts:
        if delay:
            time.sleep(delay)
        model = _read_model_once(transcript_path)
        if model:
            return model
    return os.environ.get("ANTHROPIC_MODEL", "unknown")


def logs_dir():
    d = os.path.join(repo_root(), ".agent-logs")
    os.makedirs(d, exist_ok=True)
    return d


def find_session_file(session_id):
    matches = glob.glob(os.path.join(logs_dir(), f"*_{session_id}.md"))
    return matches[0] if matches else None


def project_name():
    return os.path.basename(repo_root().rstrip("/"))


def new_session_file(session_id, now_iso):
    ts_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    path = os.path.join(logs_dir(), f"{ts_prefix}_{session_id}.md")
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    author = git_author()
    proj = project_name()
    frontmatter = (
        "---\n"
        f"session_id: {session_id}\n"
        f"date: {date}\n"
        f"author: {author}\n"
        f"model: unknown\n"
        f"tool: claude-code\n"
        f"project: {proj}\n"
        f"total_exchanges: 0\n"
        f"first_prompt_time: {now_iso}\n"
        f"last_prompt_time: {now_iso}\n"
        "---\n\n"
        f"# Session Log - {date}\n\n"
        f"Session: `{session_id}` | Project: `{proj}` | Author: `{author}`\n\n"
        "---\n"
    )
    with open(path, "w") as f:
        f.write(frontmatter)
    return path


def read_frontmatter(path):
    with open(path) as f:
        content = f.read()
    m = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    fm = {}
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip()
    return fm, content


def write_frontmatter_field(content, field, value):
    pattern = re.compile(rf"^({re.escape(field)}: ).*$", re.MULTILINE)
    if pattern.search(content):
        return pattern.sub(rf"\g<1>{value}", content, count=1)
    return content


def count_entries(content, entry_type):
    return len(re.findall(rf"\[LOG_ENTRY type={entry_type}\b", content))


def append_entry(path, entry_type, num, session_id, model, timestamp, text):
    block = (
        f"\n[LOG_ENTRY type={entry_type} num={num} session={session_id}]\n"
        f"timestamp: {timestamp}\n"
        f"model: {model}\n\n"
        f"{text}\n"
    )
    with open(path, "a") as f:
        f.write(block)


def main():
    data = json.load(sys.stdin)
    event = data.get("hook_event_name")
    session_id = data.get("session_id", "unknown-session")
    transcript_path = data.get("transcript_path", "")
    now_iso = utc_now_iso()
    model = guess_model(transcript_path, retry=(event == "Stop")) if transcript_path else \
        os.environ.get("ANTHROPIC_MODEL", "unknown")

    path = find_session_file(session_id)

    if event == "UserPromptSubmit":
        prompt = data.get("prompt", "")
        if not prompt:
            return
        if path is None:
            path = new_session_file(session_id, now_iso)
        fm, content = read_frontmatter(path)
        num = count_entries(content, "PROMPT") + 1
        content = write_frontmatter_field(content, "last_prompt_time", now_iso)
        content = write_frontmatter_field(content, "total_exchanges", num)
        content = write_frontmatter_field(content, "model", model)
        with open(path, "w") as f:
            f.write(content)
        append_entry(path, "PROMPT", num, session_id, model, now_iso, prompt)

    elif event == "Stop":
        response = data.get("last_assistant_message", "")
        if path is None or not response:
            return
        num = count_entries(open(path).read(), "RESPONSE") + 1
        fm, content = read_frontmatter(path)
        content = write_frontmatter_field(content, "model", model)
        with open(path, "w") as f:
            f.write(content)
        append_entry(path, "RESPONSE", num, session_id, model, now_iso, response)


if __name__ == "__main__":
    main()
