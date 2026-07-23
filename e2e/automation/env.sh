# Shared environment for launchd-invoked entry points. Source this near the top of any
# script launchd runs.
#
# launchd hands scripts a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) with no nvm, no
# Homebrew, and no ~/.local/bin — so make the tools these scripts need resolvable regardless
# of how they're invoked:
#   claude -> ~/.local/bin   |   gh -> Homebrew   |   node/pnpm -> nvm
#
# gh note: its token must be file-based (~/.config/gh/hosts.yml), not the macOS keychain —
# the keychain token is unreachable from inside launchd / Claude Code's Bash sandbox (401).
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
