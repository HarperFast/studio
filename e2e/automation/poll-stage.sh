#!/usr/bin/env bash
#
# Merge-to-stage trigger. Run this on a FREQUENT schedule (e.g. every 15 min); it
# invokes the suite only when the stage branch has advanced since the last run.
#
# Assumes the dev deployment tracks stage. There can be a deploy lag between the
# merge and dev serving the new build — see the deploy-lag note in README. The
# deployed app advertises its build as `dev_<shortsha>` (header version badge),
# which a later refinement could poll to confirm the deploy landed before running.
#
# State (last-tested SHA) lives OUTSIDE the repo so it survives and isn't committed.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_DIR="${STUDIO_E2E_STATE:-$HOME/.studio-e2e}"
STATE_FILE="$STATE_DIR/last-stage-sha"
mkdir -p "$STATE_DIR"

remote="$(gh api repos/HarperFast/studio/commits/stage --jq .sha 2>/dev/null)"
if [ -z "$remote" ]; then
	echo "[poll-stage] could not read stage SHA (gh auth/network?) — skipping"
	exit 0
fi

last="$(cat "$STATE_FILE" 2>/dev/null || true)"
if [ "$remote" = "$last" ]; then
	echo "[poll-stage] stage unchanged ($remote) — nothing to do"
	exit 0
fi

echo "[poll-stage] stage advanced ${last:-<none>} -> $remote — running suite"
"$DIR/on-schedule.sh"
# Record only after the run so a transient infra failure retries next poll.
echo "$remote" >"$STATE_FILE"
exit 0
