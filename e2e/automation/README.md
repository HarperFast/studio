# Automation — trusted lane

Turns the hand-run suite into a scheduled, self-triaging monitor. This is the
**trusted lane**: it runs our own deployed code (dev) with no untrusted input, so the
security surface is minimal. The PR lane (untrusted PR code, sandboxed) comes later.

## Flow

```
launchd/cron ─▶ on-schedule.sh
                  │
                  ├─ run-trusted.sh        deterministic Playwright suite → results/results.json
                  │                         (NO LLM here — plain pass/fail)
                  │
                  └─ if failed: claude -p triage.md
                                            reads results + artifacts, classifies each failure
                                            (regression / flake / test-drift), files or updates
                                            a `e2e-failure` GitHub issue on HarperFast/studio
```

The LLM only runs on failure, so green days cost nothing. Triage never touches app
code and is constrained (in `triage.md` + `--allowedTools`) to `gh issue` ops on this
one repo.

## Setup on the laptop

1. `e2e/.env.e2e` populated (target, test account, Mailosaur) — see `../.env.e2e.example`.
2. `gh` authenticated as the **limited** account (repo read + issues write, nothing more).
3. `claude` CLI installed and logged in.
4. Load the daily schedule (example plist below), or add a cron entry.

### launchd (daily at 08:00)

Save as `~/Library/LaunchAgents/com.harper.studio-e2e.daily.plist`, then
`launchctl load` it. Adjust the path to your checkout.

<!-- dprint-ignore -->
```text
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>com.harper.studio-e2e.daily</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>/Users/YOU/Code/studio/e2e/automation/on-schedule.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
    <key>StandardOutPath</key><string>/tmp/studio-e2e.out.log</string>
    <key>StandardErrorPath</key><string>/tmp/studio-e2e.err.log</string>
  </dict>
</plist>
```

## Merge-to-`stage` trigger (next increment)

Same `on-schedule.sh`, gated on a new `stage` SHA: a small poller stores the last-seen
SHA and only runs when `gh api repos/HarperFast/studio/commits/stage` reports a new one.
Not yet wired — see the repo roadmap.

## Notes

- **Account churn.** `run-trusted.sh` runs the full functional suite, which includes the
  signup round-trip → one new dev account per run. For a daily cadence, consider gating
  the round-trip (`--grep-invert @roundtrip`) to a weekly run, or a backend purge.
- **Status.** `run-trusted.sh` + `results.json` are verified. `on-schedule.sh`'s
  `claude -p` invocation and the launchd schedule need the laptop (gh + claude CLI) to
  exercise end to end — tune `--allowedTools` to your Claude Code setup.
