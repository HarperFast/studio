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

target="$(cat .claude/preview-cwd 2>/dev/null || echo .)"
cd "$target"

# Zero-setup provisioning (only ever creates what's missing; never touches the main checkout).
if [ ! -e node_modules ]; then
	ln -s "$root/node_modules" node_modules
	echo "[preview] Symlinked node_modules from the main checkout." >&2
fi
if [ ! -e .env.local ] && [ -f "$root/.env.local" ]; then
	ln -s "$root/.env.local" .env.local
	echo "[preview] Symlinked .env.local from the main checkout." >&2
fi

echo "[preview] Serving $(pwd) on port 5173" >&2
exec pnpm run dev
