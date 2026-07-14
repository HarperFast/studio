#!/usr/bin/env bash
# Launch helper for the "studio (worktree)" preview config.
#
# Problem: `preview_start` reads .claude/launch.json from the *main* checkout (the session
# cwd) and takes no arguments, so it always serves the main checkout. When you're working in
# a linked worktree you want the preview to serve THAT worktree's code — and on the same port
# (5173) so the backend's auth/origin carries over.
#
# Solution: this script reads the target directory from `.claude/preview-cwd` (a path relative
# to the repo root, gitignored — write it before starting the server), falls back to the main
# checkout when that file is absent, and starts the dev server there. To keep a fresh worktree
# zero-setup it symlinks node_modules and .env.local from the main checkout when missing.
#
# Usage: echo .claude/worktrees/<name> > .claude/preview-cwd  # then preview_start "studio (worktree)"
set -e

root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root"

# The main checkout is the source of the shared node_modules / .env.local. CLAUDE_PROJECT_DIR is
# the *current* checkout, which is the worktree itself when we're launched from one — so derive
# the main checkout from git rather than assuming $root is it. (Assuming $root pointed the
# symlinks below at a worktree's own node_modules → a self-referential link → ELOOP on start.)
main_checkout="$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)"

# Read the target worktree from .claude/preview-cwd (repo-relative). `read` trims surrounding
# whitespace and tolerates a missing trailing newline; fall back to the main checkout when the
# file is absent or empty.
target=""
if [ -f .claude/preview-cwd ]; then
	read -r target < .claude/preview-cwd || :
fi
target="${target:-.}"

if ! cd "$target" 2>/dev/null; then
	echo "[preview] Error: target directory '$target' (from .claude/preview-cwd) is missing or inaccessible." >&2
	exit 1
fi

# Zero-setup provisioning (only ever creates what's missing; never touches the main checkout).
# Guard with both -e and -L so an existing real dir/file AND a dangling symlink are left alone
# (a broken symlink passes -e but `ln -s` over it would fail with "File exists").
if [ ! -e node_modules ] && [ ! -L node_modules ]; then
	ln -s "$main_checkout/node_modules" node_modules
	echo "[preview] Symlinked node_modules from the main checkout." >&2
fi
if [ ! -e .env.local ] && [ ! -L .env.local ] && [ -f "$main_checkout/.env.local" ]; then
	ln -s "$main_checkout/.env.local" .env.local
	echo "[preview] Symlinked .env.local from the main checkout." >&2
fi

# The preview launcher may inherit an older default Node than pnpm 11 needs (>=22.13). Prefer the
# repo's pinned .nvmrc version; otherwise fall back to the newest installed nvm node >=22.
current_major="$(node -v 2>/dev/null | sed 's/^v//; s/\..*//')"
if [ -z "$current_major" ] || [ "$current_major" -lt 22 ]; then
	want=""
	[ -f "$root/.nvmrc" ] && want="$(tr -d '[:space:]' < "$root/.nvmrc")"
	want="${want#v}" # .nvmrc may write the version with or without a leading `v`.
	adjusted=""
	if [ -n "$want" ] && [ -d "$HOME/.nvm/versions/node/v${want}/bin" ]; then
		PATH="$HOME/.nvm/versions/node/v${want}/bin:$PATH"
		adjusted=1
	elif [ -d "$HOME/.nvm/versions/node" ]; then
		# Newest installed >=22. Portable numeric sort (descending) instead of `sort -V`, which is a
		# GNU/newer-BSD extension missing from older `sort` (e.g. stock macOS).
		for v in $(ls -1 "$HOME/.nvm/versions/node" | sed 's/^v//' | sort -t. -k1,1rn -k2,2rn -k3,3rn); do
			if [ "${v%%.*}" -ge 22 ]; then
				PATH="$HOME/.nvm/versions/node/v$v/bin:$PATH"
				adjusted=1
				break
			fi
		done
	fi
	# Only claim an adjustment when PATH actually changed; otherwise warn (pnpm will likely fail).
	if [ -n "$adjusted" ]; then
		export PATH
		echo "[preview] Adjusted PATH to Node $(node -v 2>/dev/null) for pnpm." >&2
	else
		echo "[preview] Warning: Node $(node -v 2>/dev/null) is older than pnpm 11 needs (>=22.13) and no nvm Node >=22 was found — pnpm may fail." >&2
	fi
fi

echo "[preview] Serving $(pwd) on port 5173" >&2
# node_modules is symlinked from the main checkout; skip pnpm's pre-run deps check so it can't
# try to reinstall/purge it (the workspace state won't match, and a purge would mutate the
# shared checkout). We just want to run the dev script against the already-installed modules.
exec pnpm --config.verify-deps-before-run=false run dev
