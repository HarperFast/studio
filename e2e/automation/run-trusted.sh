#!/usr/bin/env bash
#
# Trusted-lane runner: execute the deterministic Playwright suite against the
# configured target (dev by default) and emit machine-readable results.
#
# NO LLM is in this path — it's a plain suite run. The exit code is the suite's
# pass/fail; results/results.json carries the detail for the triage step.
#
# Usage: run-trusted.sh   (reads e2e/.env.e2e for target + creds)
set -uo pipefail

E2E_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$E2E_DIR" || exit 2

# Prefer the repo-pinned Node (.nvmrc = 24.18.0) if nvm is available; otherwise
# rely on whatever node is on PATH (Playwright needs >=18).
if [ -s "$HOME/.nvm/nvm.sh" ]; then
	# shellcheck disable=SC1091
	. "$HOME/.nvm/nvm.sh"
	nvm use >/dev/null 2>&1 || true
fi

echo "[run-trusted] node $(node -v 2>/dev/null) | target ${PLAYWRIGHT_BASE_URL:-https://dev.studio.harperfabric.com}"

# Ensure deps + browser are present (no-ops once warmed). --ignore-scripts is
# defense-in-depth: no e2e dep needs install scripts, and the browser is fetched
# by the explicit `playwright install` below, not a postinstall.
pnpm install --frozen-lockfile --ignore-scripts >/dev/null 2>&1 || pnpm install --ignore-scripts >/dev/null 2>&1
pnpm exec playwright install chromium >/dev/null 2>&1 || true

# Functional suite (excludes @visual, which needs committed baselines).
# CI=1 opts into the config's retries (2) + bounded workers, so a transient timeout on a
# slow deployment self-heals instead of filing a spurious failure issue. A test that fails
# ALL retries is a genuine failure and still reports non-zero.
CI=1 pnpm test
status=$?

echo "[run-trusted] suite exit=$status | results: $E2E_DIR/results/results.json"
exit $status
