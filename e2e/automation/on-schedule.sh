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

# launchd hands scripts a minimal PATH (no nvm, no Homebrew, no ~/.local/bin). Make the
# tools this script needs resolvable regardless of how it's invoked: claude (~/.local/bin),
# gh (Homebrew), node/pnpm (nvm — run-trusted.sh also sources it).
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

DIR="$(cd "$(dirname "$0")" && pwd)"

"$DIR/run-trusted.sh"
status=$?

if [ "$status" -eq 0 ]; then
	echo "[on-schedule] suite passed — nothing to triage"
	exit 0
fi

echo "[on-schedule] suite failed (exit $status) — invoking triage"

# Headless Claude Code, scoped to ONLY the tools triage needs. No permission-mode
# override: default mode + this allowlist means anything unlisted (edits, other repos,
# arbitrary Bash) is denied rather than auto-approved — the fail-safe posture for an
# unattended run. triage.md further constrains it to gh issue ops on this repo.
claude -p "$(cat "$DIR/triage.md")" \
	--add-dir "$DIR/.." \
	--allowedTools "Read,Bash(gh issue list:*),Bash(gh issue view:*),Bash(gh issue create:*),Bash(gh issue comment:*)"
triage_status=$?

if [ "$triage_status" -ne 0 ]; then
	# Don't let a broken triage (claude not logged in, gh token unreadable, network) look like a
	# successful run — surface it loudly and exit non-zero so the scheduler/monitoring notices.
	echo "[on-schedule] TRIAGE FAILED (claude exit $triage_status) — the test failure was NOT reported. Check 'claude' login and 'gh' auth." >&2
	exit 3
fi

echo "[on-schedule] triage complete — failure reported to GitHub"
exit 0
