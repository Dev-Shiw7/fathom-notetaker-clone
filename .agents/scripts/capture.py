import sys
import json
import os
import datetime
from pathlib import Path

def get_git_author(repo_path):
    try:
        import subprocess
        result = subprocess.run(['git', 'config', 'user.name'], cwd=repo_path, capture_output=True, text=True, check=True)
        name = result.stdout.strip()
        if name: return name
    except Exception:
        pass
    try:
        return os.getlogin()
    except:
        return "unknown"

def process():
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        print(json.dumps({"decision": "stop", "reason": "invalid json input"}))
        return

    session_id = payload.get("conversationId", "unknown-session")
    transcript_path = payload.get("transcriptPath")
    workspaces = payload.get("workspacePaths", [])
    model_name = payload.get("modelName", "auto")

    if not transcript_path or not workspaces:
        print(json.dumps({"decision": "stop", "reason": "missing path or workspace"}))
        return

    workspace_path = workspaces[0]
    author = get_git_author(workspace_path)
    project = os.path.basename(workspace_path)
    
    transcript_full_path = transcript_path.replace("transcript.jsonl", "transcript_full.jsonl")
    
    exchanges = []
    current_exchange = None
    
    if os.path.exists(transcript_full_path):
        with open(transcript_full_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip(): continue
                try:
                    step = json.loads(line)
                except:
                    continue
                
                if step.get("type") == "USER_INPUT":
                    if current_exchange:
                        exchanges.append(current_exchange)
                    current_exchange = {
                        "prompt": step.get("content", ""),
                        "prompt_time": step.get("created_at", ""),
                        "response": "",
                        "response_time": "",
                        "model": model_name
                    }
                elif step.get("type") == "PLANNER_RESPONSE":
                    if current_exchange:
                        content = step.get("content")
                        if content:
                            current_exchange["response"] = content
                        current_exchange["response_time"] = step.get("created_at", "")
                        
        if current_exchange:
            exchanges.append(current_exchange)

    if not exchanges:
        print(json.dumps({"decision": "stop", "reason": "no exchanges"}))
        return

    first_prompt_time = exchanges[0]["prompt_time"]
    last_prompt_time = exchanges[-1]["prompt_time"]
    try:
        dt = datetime.datetime.strptime(first_prompt_time, "%Y-%m-%dT%H:%M:%SZ")
        date_str = dt.strftime("%Y-%m-%d")
        time_str = dt.strftime("%H-%M-%S")
    except:
        date_str = datetime.datetime.utcnow().strftime("%Y-%m-%d")
        time_str = datetime.datetime.utcnow().strftime("%H-%M-%S")
        
    short_session = session_id.split("-")[0]
    out_dir = os.path.join(workspace_path, ".agent-logs")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, f"{date_str}_{time_str}_{session_id}.md")
    
    lines = []
    lines.append("---")
    lines.append(f"session_id: {session_id}")
    lines.append(f"date: {date_str}")
    lines.append(f"author: {author}")
    lines.append(f"model: {model_name}")
    lines.append("tool: antigravity")
    lines.append(f"project: {project}")
    lines.append(f"total_exchanges: {len(exchanges)}")
    lines.append(f"first_prompt_time: {first_prompt_time}")
    lines.append(f"last_prompt_time: {last_prompt_time}")
    lines.append("---")
    lines.append("")
    lines.append(f"# Session Log - {date_str}")
    lines.append("")
    lines.append(f"Session: `{short_session}` | Project: `{project}` | Author: `{author}`")
    lines.append("")
    lines.append("---")
    lines.append("")
    
    for i, ex in enumerate(exchanges, 1):
        lines.append(f"[LOG_ENTRY type=PROMPT num={i} session={short_session}]")
        lines.append(f"timestamp: {ex['prompt_time']}")
        lines.append(f"model: {ex['model']}")
        lines.append("")
        lines.append(ex['prompt'])
        lines.append("")
        lines.append("")
        lines.append(f"[LOG_ENTRY type=RESPONSE num={i} session={short_session}]")
        lines.append(f"timestamp: {ex['response_time']}")
        lines.append(f"model: {ex['model']}")
        lines.append("")
        lines.append(ex['response'])
        lines.append("")
        lines.append("")

    with open(out_file, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
        
    print(json.dumps({"decision": "stop", "reason": "captured"}))

if __name__ == "__main__":
    process()
