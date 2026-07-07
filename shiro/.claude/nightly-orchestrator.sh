#!/usr/bin/env bash
# One-shot Awwwards orchestrator for ~/shiro.
# Invoked by cron at 01:00 Asia/Singapore; runs Claude Fable 5 as creative
# director with the prompt in nightly-prompt.txt. Removes its own crontab
# entry on first start so it runs exactly once.
set -u

PROJECT_DIR="/home/jiaowh/shiro"
PROMPT_FILE="$PROJECT_DIR/.claude/nightly-prompt.txt"
LOG_FILE="$PROJECT_DIR/.claude/logs/nightly-orchestrator.log"
LOCK_FILE="$PROJECT_DIR/.claude/nightly-orchestrator.lock"
CLAUDE_BIN="/home/jiaowh/.local/bin/claude"

mkdir -p "$(dirname "$LOG_FILE")"
exec >>"$LOG_FILE" 2>&1

echo "=== run started $(date -Iseconds) ==="
cd "$PROJECT_DIR" || exit 1

# Skip tonight's run instead of stacking a second session if the previous
# one is still going.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "previous run still in progress; skipped $(date -Iseconds)"
  exit 0
fi

# One-time run: deregister before doing the work so it can never fire twice.
crontab -l 2>/dev/null | grep -vF "nightly-orchestrator.sh" | crontab -
echo "removed own crontab entry; this was a one-time run"

# Strictly tonight (2026-07-06 01:00) only: if cron fired on a later night
# because the machine was off at the scheduled time, do not run at all.
if [ "$(date +%F)" != "2026-07-06" ]; then
  echo "fired on $(date +%F), not the scheduled night; exiting without running"
  exit 0
fi

"$CLAUDE_BIN" \
  -p "$(cat "$PROMPT_FILE")" \
  --model claude-fable-5 \
  --dangerously-skip-permissions
status=$?
echo "=== run finished $(date -Iseconds) exit=$status ==="
