#!/usr/bin/env bash
#
# Scheduler entry point (launchd/cron calls this). Runs the deterministic suite;
# only if it FAILS does it spin up Claude Code headless to triage into a GitHub
# issue. Keeping the LLM off the pass-path means routine green runs cost nothing.
#
# Prereqs on the laptop:
#   - e2e/.env.e2e populated (target, test account, Mailosaur).
#   - `gh` authenticated as the limited account (repo read + issues write).
#   - `claude` CLI installed and logged in.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

# Make tools resolvable under launchd's minimal PATH (see env.sh).
. "$DIR/env.sh"

"$DIR/run-trusted.sh"
status=$?

if [ "$status" -eq 0 ]; then
	echo "[on-schedule] suite passed — nothing to triage"
	exit 0
fi

echo "[on-schedule] suite failed (exit $status) — invoking triage"

# Headless Claude Code, scoped to the tools triage needs (Read + gh issue ops on this repo,
# per triage.md). No permission-mode override: default mode + this allowlist means anything
# unlisted (edits, other repos, arbitrary Bash) is denied rather than auto-approved.
#
# We VERIFY the outcome via a marker, not the exit code: `claude -p` exits 0 when the agent
# finishes even if a gh call inside it failed (e.g. a 401), so exit code alone is not proof the
# issue was filed. triage.md must end with `TRIAGE_RESULT: filed|updated|noop|error …`; we
# require a success marker or treat the run as failed.
# Stream the triage to a dedicated log so a run is watchable live (`tail -f` the path below),
# and BOUND it with a timeout so a wedged agent fails the run instead of blocking the
# scheduler forever. --verbose surfaces the agent's steps as it works.
TRIAGE_LOG="${STUDIO_E2E_TRIAGE_LOG:-$HOME/Library/Logs/studio-e2e/triage.last.log}"
TRIAGE_TIMEOUT="${STUDIO_E2E_TRIAGE_TIMEOUT:-300}"
mkdir -p "$(dirname "$TRIAGE_LOG")"
echo "[on-schedule] triage running (timeout ${TRIAGE_TIMEOUT}s) — watch live: tail -f $TRIAGE_LOG"

# macOS has no timeout(1): run claude in the background (writing live to the log) with a
# watchdog that TERMs it if it overruns, then KILLs after a short grace.
claude -p "$(cat "$DIR/triage.md")" \
	--verbose \
	--add-dir "$DIR/.." \
	--allowedTools "Read,Bash(gh issue list:*),Bash(gh issue view:*),Bash(gh issue create:*),Bash(gh issue comment:*)" >"$TRIAGE_LOG" 2>&1 &
claude_pid=$!
( sleep "$TRIAGE_TIMEOUT"; kill -TERM "$claude_pid" 2>/dev/null; sleep 10; kill -KILL "$claude_pid" 2>/dev/null ) &
watchdog_pid=$!
wait "$claude_pid"
claude_status=$?
kill "$watchdog_pid" 2>/dev/null || true
wait "$watchdog_pid" 2>/dev/null || true

cat "$TRIAGE_LOG"
triage_output="$(cat "$TRIAGE_LOG")"
if [ "$claude_status" -ge 124 ]; then
	echo "[on-schedule] triage claude exited $claude_status — likely hit the ${TRIAGE_TIMEOUT}s timeout" >&2
fi

if printf '%s\n' "$triage_output" | grep -qE 'TRIAGE_RESULT: (filed|updated|noop)'; then
	marker="$(printf '%s\n' "$triage_output" | grep -E 'TRIAGE_RESULT:' | tail -1)"
	echo "[on-schedule] triage complete — ${marker#*TRIAGE_RESULT: }"
	exit 0
fi

# No success marker: claude errored, or gh failed inside it (auth/401), or the agent bailed.
echo "[on-schedule] TRIAGE FAILED (claude exit $claude_status; no success marker) — the test failure was NOT reported. Check 'claude' login and 'gh' auth (token must be file-based, not keychain)." >&2
exit 3
