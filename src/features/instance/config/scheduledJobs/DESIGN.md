# Scheduled jobs — design notes

## What the page reads

Harper's scheduler (harper `resources/scheduler`, harper#951) has no operation that lists jobs, runs one or pauses one.
So the page reads three things Studio could already read:

- each app's config file, through `get_component_file`, for the jobs themselves
- `get_components`, for the apps, their files, whether a deploy owns them, and whether their scheduler failed to load
- `read_log`, filtered on `scheduler`, for what the jobs did

Harper reads an app's config from `harper-config.yaml`, then `harperdb-config.yaml`, then `config.yaml`
(`components/componentLoader.ts`), so the page does too. The version floor is `5.2.0-beta.2`, the first tag with the
scheduler. `5.2.0-beta.1` predates it.

## Last runs come from the log, because Harper won't let Studio read `hdb_scheduler_state`

The issue planned to read each job's last run from `system.hdb_scheduler_state`. No released Harper allows that, and
neither does harper `main`. A super user's read grants on system tables are built from the static `json/systemSchema.json`
(`security/user.ts`), and this table is defined at runtime by `table()` in `resources/scheduler/engine.ts`, so it isn't
listed. `verifyPerms` then reports the table as missing. On 5.3.5 `search_by_value`, `search_by_id`, `sql` and
`describe_table` all answered 403 `Table 'system.hdb_scheduler_state' does not exist`, even after a restart, while
`describe_database` listed the table with four rows. Each refusal also writes an error to the customer's log.

So Studio doesn't send that read. `SCHEDULER_STATE_READABLE_FROM` is `undefined`. Once a Harper version grants the read,
set it to that version: the reader, the leader's heartbeat and the "Last run" column are already built for it.

Until then the page shows what Harper logs. These lines are worded the same from 5.2.0-beta.2 through 5.3.5:

- every failed run, at `warn`: `Job job:<app>:<name> failed after <n>ms: <error>`
- every takeover, at `info`: `Scheduler leader started on <node>`
- an app whose jobs stop it loading, at `error`: `… for application '<app>' due to: <reason>`

A successful run is logged only at `trace`, so the column is "Last failure", never "Last run", and the page says so. A
leader that keeps leading logs nothing, so the leader line is the last takeover, which can be old. On a cluster the read
is replicated, because the leader can be any node.

## Harper's own load error, and where it goes missing

When a job stops an app loading, `get_components` only says `<app>.scheduler` failed, with the message
`Could not load component '<app>.scheduler'`. Harper's reason is in its log, from every worker after the first: the first
worker prints it to the console instead (`getWorkerIndex() === 0 ? console : harperLogger`). A Fabric node runs several
workers, so the reason is there. A one-thread instance never logs it, and the page says so and points at the problems
Studio found itself.

## Studio checks a job the way Harper does

`schedule.ts` ports Harper's cron parser and its interval and timezone checks, with Harper's messages. `jobsConfig.ts`
runs Harper's checks on each entry in Harper's order, and then flags duplicate names. `schedule.test.ts` holds Harper's
own verdicts on a set of cron expressions and intervals, captured from harper 5.3.5's code, so the port can't drift
without a test failing.

Studio can't check that a handler's export exists the way Harper does, by importing it. It lists the exports it can see
in the file's text and warns about a name it can't find, and it flags a handler file that isn't in the app.

## Edits keep the file

The `yaml` Document API edits the file in place, so comments, other keys and a value's own inline comment survive. New
keys go in the documented order. A cron expression is written in single quotes, since a bare `*` or `@daily` is YAML
syntax. A `jobs:` list written flush with its key stays that way.

An app with no config file gets a new `config.yaml` that starts from Harper's defaults (`components/DEFAULT_CONFIG.ts`).
Without them the app would stop loading its REST, schema, resources and static files.

Before writing, the save re-reads the components tree and the file, and refuses if either changed since the page read
them. Nothing else stops two people's edits overwriting each other. It writes with `set_component_file`, replicated on a
cluster, as the editor does.

Saving sets `restartRequired`, and Harper keeps running the old jobs until a restart (checked on 5.3.5). So the page
offers the same restart as the editor's menu.

## What Studio won't edit

An app deployed from a package, a pull request preview, or a platform-managed component shows its jobs read-only, since
the next deploy replaces its config. So does an app whose config isn't valid YAML, or whose `scheduler.jobs` isn't a
list: Studio won't rewrite a file it can't read.
