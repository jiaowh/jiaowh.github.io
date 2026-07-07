#!/usr/bin/env bash
# One-shot 06:15 follow-up to the 01:00 orchestrator run (2026-07-06).
# Fires after the 5-hour usage window from the 1 AM session has reset,
# checks whether that session left work unfinished, and carries on if so.
# Removes its own crontab entry on first start so it runs exactly once.
set -u

PROJECT_DIR="/home/jiaowh/shiro"
ORIG_PROMPT="$PROJECT_DIR/.claude/nightly-prompt.txt"
CONT_PROMPT="$PROJECT_DIR/.claude/morning-continuation-prompt.txt"
LOG_FILE="$PROJECT_DIR/.claude/logs/nightly-orchestrator.log"
LOCK_FILE="$PROJECT_DIR/.claude/nightly-orchestrator.lock"
CLAUDE_BIN="/home/jiaowh/.local/bin/claude"

mkdir -p "$(dirname "$LOG_FILE")"
exec >>"$LOG_FILE" 2>&1

echo "=== morning follow-up begun $(date -Iseconds) ==="
cd "$PROJECT_DIR" || exit 1

# Shares the 1 AM job's lock: if that session is somehow still running,
# wait for it to finish (up to 3 hours) rather than stacking a second one.
exec 9>"$LOCK_FILE"
if ! flock -w 10800 9; then
  echo "1am session still running after 3h wait; giving up $(date -Iseconds)"
  exit 0
fi

# One-time run: deregister before doing the work so it can never fire twice.
crontab -l 2>/dev/null | grep -vF "morning-continuation.sh" | crontab -
echo "removed own crontab entry; this was a one-time run"

# Strictly the morning of 2026-07-06 only.
if [ "$(date +%F)" != "2026-07-06" ]; then
  echo "fired on $(date +%F), not the scheduled morning; exiting without running"
  exit 0
fi

if grep -q "=== run started 2026-07-06" "$LOG_FILE"; then
  echo "1am run detected; resuming that session to finish remaining tasks"
  "$CLAUDE_BIN" --continue \
    -p "$(cat "$CONT_PROMPT")" \
    --model claude-fable-5 \
    --dangerously-skip-permissions
else
  echo "no 1am run found in log; running the original brief fresh"
  "$CLAUDE_BIN" \
    -p "$(cat "$ORIG_PROMPT")" \
    --model claude-fable-5 \
    --dangerously-skip-permissions
fi
status=$?
echo "=== morning follow-up finished $(date -Iseconds) exit=$status ==="
