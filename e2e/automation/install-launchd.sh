#!/usr/bin/env bash
#
# Install (or reinstall) the launchd LaunchAgents that drive the trusted lane on this machine:
#   - com.harper.studio-e2e.daily  → on-schedule.sh, once a day (08:00)
#   - com.harper.studio-e2e.poll   → poll-stage.sh, every 15 min (runs only if stage advanced)
#
# Idempotent: safe to re-run (bootout + rebootstrap). Paths are DERIVED from this script's
# location and $HOME — nothing hardcoded — so it's reproducible on any machine/user.
#
# Usage:   bash install-launchd.sh            # install/reinstall both
#          bash install-launchd.sh --uninstall # remove both
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
UID_NUM="$(id -u)"
LA="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/studio-e2e"
DAILY="com.harper.studio-e2e.daily"
POLL="com.harper.studio-e2e.poll"

uninstall() {
	for label in "$DAILY" "$POLL"; do
		launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
		rm -f "$LA/$label.plist"
		echo "removed: $label"
	done
}

if [ "${1:-}" = "--uninstall" ]; then
	uninstall
	exit 0
fi

mkdir -p "$LA" "$LOGS"

install_agent() { # <label> <script> <schedule-xml>
	local label="$1" script="$2" schedule="$3"
	local plist="$LA/$label.plist"
	cat >"$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DIR/$script</string>
  </array>
  $schedule
  <key>StandardOutPath</key><string>$LOGS/$label.out.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$label.err.log</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLIST
	launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
	launchctl bootstrap "gui/$UID_NUM" "$plist"
	echo "installed: $label -> $DIR/$script"
}

install_agent "$DAILY" "on-schedule.sh" \
	'<key>StartCalendarInterval</key><dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>'
install_agent "$POLL" "poll-stage.sh" \
	'<key>StartInterval</key><integer>900</integer>'

echo
echo "loaded:"
launchctl list | grep 'com.harper.studio-e2e' || echo "  (none found — check errors above)"
echo
echo "logs:       $LOGS/"
echo "test daily: launchctl kickstart -k gui/$UID_NUM/$DAILY   # then: tail -f $LOGS/$DAILY.out.log"
echo "uninstall:  bash $DIR/install-launchd.sh --uninstall"
