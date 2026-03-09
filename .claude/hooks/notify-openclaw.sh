#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-}"
TARGET_CHAT="${OPENCLAW_TG_TARGET:-5074597793}"
CHANNEL="${OPENCLAW_CHANNEL:-telegram}"
ACCOUNT_ID="${OPENCLAW_ACCOUNT_ID:-dev}"

payload="$(cat || true)"
if [[ -z "${payload:-}" ]]; then
  payload='{}'
fi

# Parse selected fields (prefer python to avoid jq dependency)
parsed_line="$({ /usr/bin/python3 - <<'PY' "$payload"; } 2>/dev/null
import json, sys
raw = sys.argv[1] if len(sys.argv) > 1 else '{}'
try:
    d = json.loads(raw)
except Exception:
    d = {}

def get(path, default=''):
    cur = d
    for p in path:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return default
    return cur if cur is not None else default

vals = [
    get(['hook_event_name'], 'unknown'),
    get(['cwd'], ''),
    get(['session_id'], ''),
    get(['permission_mode'], ''),
    get(['message'], '') or get(['notification'], '') or get(['reason'], ''),
    get(['tool_name'], ''),
    get(['tool_input', 'command'], ''),
    get(['last_assistant_message'], ''),
]
# single-line, unit-separator delimited (non-whitespace so read does not merge empty fields)
print('\x1f'.join(str(v).replace('\x1f', ' ').replace('\n', ' ') for v in vals))
PY
)"

IFS=$'\x1f' read -r event cwd session_id permission_mode reason tool_name tool_cmd last_assistant_message <<EOF
${parsed_line}
EOF

event="${event:-unknown}"
cwd="${cwd:-}"
session_id="${session_id:-}"
permission_mode="${permission_mode:-}"
reason="${reason:-}"
tool_name="${tool_name:-}"
tool_cmd="${tool_cmd:-}"
last_assistant_message="${last_assistant_message:-}"

if [[ -z "$PROJECT_DIR" ]]; then
  PROJECT_DIR="${cwd:-$(pwd)}"
fi
LOG_FILE="$PROJECT_DIR/todos/temp/cc-events.log"
mkdir -p "$(dirname "$LOG_FILE")"

project_name="$(basename "$PROJECT_DIR")"
branch="$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null | tr -d '\r\n' || true)"
branch="${branch:--}"
short_cwd="${PROJECT_DIR/#$HOME/\~}"
now="$(date '+%Y-%m-%d %H:%M:%S %z')"

# compact reason
reason_one_line="$(printf '%s' "$reason" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g' | cut -c1-160)"

# Truncate last_assistant_message for notification
latest_reply="$(printf '%s' "$last_assistant_message" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g' | cut -c1-500)"

# Build notification message
header="[CC] ${project_name} · ${branch}"
dir_line="📂 ${short_cwd}"

case "$event" in
  TaskCompleted)
    text="📦 *${header}*"$'\n'"${dir_line}"$'\n'"任务已完成"
    ;;
  Stop)
    text="✅ *${header}*"$'\n'"${dir_line}"
    if [[ -n "$latest_reply" ]]; then
      text+=$'\n'"\`\`\`"$'\n'"$latest_reply"$'\n'"\`\`\`"
    fi
    ;;
  Notification)
    if echo "$reason_one_line" | grep -qi "permission"; then
      text="🚨 *${header}*"$'\n'"${dir_line}"$'\n'"⚠️ 权限审批等待中"
    else
      text="🔔 *${header}*"$'\n'"${dir_line}"
    fi
    if [[ -n "$reason_one_line" ]]; then
      text+=$'\n'"$reason_one_line"
    fi
    ;;
  SubagentStop)
    text="🔧 *${header}*"$'\n'"${dir_line}"$'\n'"子任务完成"
    if [[ -n "$latest_reply" ]]; then
      text+=$'\n'"\`\`\`"$'\n'"$latest_reply"$'\n'"\`\`\`"
    fi
    ;;
  PostToolUseFailure)
    text="❌ *${header}*"$'\n'"${dir_line}"$'\n'"\`tool=${tool_name:-?}\`"
    if [[ -n "$tool_cmd" ]]; then
      text+=" cmd=\`$(printf '%s' "$tool_cmd" | tr '\n' ' ' | cut -c1-120)\`"
    fi
    ;;
  *)
    text="ℹ️ *${header}*"$'\n'"${dir_line}"$'\n'"${event}"
    ;;
esac

# Append session ID for resume capability
if [[ -n "$session_id" ]]; then
  text+=$'\n'"🔑 \`${session_id}\`"
fi

# Always append local log for traceability
printf '%s\t%s\tsession=%s\tperm=%s\t%s\n' "$now" "$event" "$session_id" "$permission_mode" "$text" >> "$LOG_FILE"

# Write structured result JSON as fallback (AGI can read this if message pipe delays)
RESULT_FILE="$PROJECT_DIR/todos/temp/cc-latest.json"
/usr/bin/python3 - "$event" "$session_id" "$project_name" "$branch" "$now" "$text" <<'PY' > "$RESULT_FILE" 2>/dev/null || true
import json, sys
a = sys.argv[1:]
print(json.dumps({
    "event": a[0], "session_id": a[1], "project": a[2],
    "branch": a[3], "timestamp": a[4], "message": a[5][:2000]
}, ensure_ascii=False))
PY

# Send Telegram/OpenClaw message (non-blocking, only when OPENCLAW_NOTIFY=1)
if [[ "${OPENCLAW_NOTIFY:-}" == "1" ]]; then
  openclaw message send --channel "$CHANNEL" --account "$ACCOUNT_ID" --target "$TARGET_CHAT" --message "$text" >/dev/null 2>&1 || true
fi

exit 0
