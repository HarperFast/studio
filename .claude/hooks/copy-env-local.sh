#!/usr/bin/env bash
# SessionStart hook: when working in a linked git worktree, copy .env.local from the main
# worktree so the dev server (which loads it via `dotenv -e .env.local`) is configured without
# any manual setup.
#
# Safe by design: it only ever *creates* .env.local when it is missing, never overwrites an
# existing one, and never touches the main checkout. It always exits 0 so it can't fail a session.

# Operate from the project root regardless of where the hook was invoked.
cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || exit 0

# Only act inside a git working tree.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Already configured — nothing to do.
if [ -f .env.local ]; then
	exit 0
fi

# The main worktree is always the first entry of `git worktree list`.
main=$(git worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p')
if [ -z "$main" ] || [ "$main" = "$PWD" ]; then
	# No worktrees, or we *are* the main checkout — leave .env.local management to the user.
	exit 0
fi

src="$main/.env.local"
if [ -f "$src" ] && cp "$src" .env.local 2>/dev/null; then
	echo "[claude] Copied .env.local from the main worktree so the dev server is configured." >&2
fi

exit 0
