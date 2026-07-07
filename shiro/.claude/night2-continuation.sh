#!/usr/bin/env bash
# One-shot orchestration continuation, 2026-07-07 03:00 Asia/Singapore.
# Resumes the ~/shiro orchestration conversation to finish Waves 4-6 and the
# final review. Removes its own crontab entry on first start; runs only on
# the scheduled date.
set -u

PROJECT_DIR="/home/jiaowh/shiro"
PROMPT_FILE="$PROJECT_DIR/.claude/night2-prompt.txt"
LOG_FILE="$PROJECT_DIR/.claude/logs/nightly-orchestrator.log"
LOCK_FILE="$PROJECT_DIR/.claude/nightly-orchestrator.lock"
CLAUDE_BIN="/home/jiaowh/.local/bin/claude"

mkdir -p "$(dirname "$LOG_FILE")"
exec >>"$LOG_FILE" 2>&1

echo "=== night2 continuation begun $(date -Iseconds) ==="
cd "$PROJECT_DIR" || exit 1

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "another orchestrator run holds the lock; skipped $(date -Iseconds)"
  exit 0
fi

# One-time run: deregister before doing the work so it can never fire twice.
crontab -l 2>/dev/null | grep -vF "night2-continuation.sh" | crontab -
echo "removed own crontab entry; this was a one-time run"

if [ "$(date +%F)" != "2026-07-07" ]; then
  echo "fired on $(date +%F), not the scheduled night; exiting without running"
  exit 0
fi

# Never kill backgrounded work when the main turn ends (first-night lesson).
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0

"$CLAUDE_BIN" --continue \
  -p "$(cat "$PROMPT_FILE")" \
  --model claude-fable-5 \
  --dangerously-skip-permissions
status=$?
echo "=== night2 continuation finished $(date -Iseconds) exit=$status ==="
