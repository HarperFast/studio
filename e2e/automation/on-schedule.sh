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
triage_output="$(
	claude -p "$(cat "$DIR/triage.md")" \
		--add-dir "$DIR/.." \
		--allowedTools "Read,Bash(gh issue list:*),Bash(gh issue view:*),Bash(gh issue create:*),Bash(gh issue comment:*)" 2>&1
)"
claude_status=$?
printf '%s\n' "$triage_output"

if printf '%s\n' "$triage_output" | grep -qE 'TRIAGE_RESULT: (filed|updated|noop)'; then
	marker="$(printf '%s\n' "$triage_output" | grep -E 'TRIAGE_RESULT:' | tail -1)"
	echo "[on-schedule] triage complete — ${marker#*TRIAGE_RESULT: }"
	exit 0
fi

# No success marker: claude errored, or gh failed inside it (auth/401), or the agent bailed.
echo "[on-schedule] TRIAGE FAILED (claude exit $claude_status; no success marker) — the test failure was NOT reported. Check 'claude' login and 'gh' auth (token must be file-based, not keychain)." >&2
exit 3
