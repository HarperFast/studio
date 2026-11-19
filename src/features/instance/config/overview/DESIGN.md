# Config overview — design notes

The Overview page edits Harper's config file (`get_configuration` / `set_configuration`) with a form per
section and an Advanced JSON editor, both over one draft. Every claim about Harper or Fabric below was checked
against source: harper `main` at `d3090a5c7` and host-manager `origin/main` at `2ea9e25` (2026-11-18).

## What Fabric sets on every start

[`fabricManagedConfig.ts`](fabricManagedConfig.ts) lists them, and nothing reads host manager at runtime, so the
list must move with host-manager `src/templates/compose.yaml` and `src/helpers/{agentConfig,wafConfig}.js`. Two
mechanisms put a value back, both at every start:

- `HARPER_SET_CONFIG` overrides the file and wins over every other layer (harper `config/harperConfigEnvVars.ts`,
  the precedence ladder in its header).
- Individual environment variables (`HTTP_KEEPALIVETIMEOUT`, …) are written into the file on every run that isn't
  an install (harper `bin/run.ts`, `assignCMDENVVariables` → `updateConfigValue`).

Harper's `set_configuration` accepts a change to either and reports success; the next restart undoes it. So Studio
refuses those changes itself (`findRefusedChanges`) rather than letting the save succeed and then lie.

`HARPER_DEFAULT_CONFIG` is different: a file value that differs from what it supplied becomes the customer's own
(`detectConfigDrift`, `harperConfigEnvVars.ts`), so those settings stay editable and are only marked with Fabric's
starting value (`fabricDefaultFor`).

Host-manager also writes `threads.v8Flags` (constrained runtime) and `replication.{network,privateUrls,recordLocks,
shard,shards}` into `HARPER_SET_CONFIG` per instance. They are not listed because Studio already hides all of
`threads` and `replication` except `replication.databases` ([`configRestrictions.ts`](configRestrictions.ts)).

`agent.enabled` is locked on Fabric too, though host manager sets it only on a host that turns the built-in agent off
(`helpers/agentConfig.js`): the file value can't tell that host's `false` from a customer's, so Studio doesn't guess.

Off Fabric (Local Studio, a self-managed cluster) the list doesn't apply. While the cluster is still loading it is
treated as hosted, so nothing is briefly offered that Fabric would undo.

## The forms come from Harper's schema

[`configSchemaFields.ts`](configSchemaFields.ts) builds every field from the copied schema
(`harper-config/configRootSchema.json`, refreshed from the bundled `harper` package). A setting gets a field only
when one plain control can show every value it takes; the rest stay in Advanced JSON, which is why the editor is
kept.

The forms never offer a port. Fabric maps ports on the host, and Harper's schema names `mqtt.port` and
`mqtt.securePort` where Harper itself reads `mqtt.network.port` (`utility/hdbTerms.ts`, `MQTT_NETWORK_PORT`), so a
schema-driven port field would write a setting Harper rejects as unrecognized.

## Durations are said the way Harper reads them

[`configDurations.ts`](configDurations.ts) names each duration setting with its reader, because Harper has two
and they disagree on units. `convertToMS` (`utility/common_utils.ts`, audit retention and log rotation) reads the
last character case-sensitively, `M` a 30-day month and `m` a minute, and anything else as seconds. The token
timeouts go to jsonwebtoken (`security/tokenAuthentication.ts`), whose `ms` package reads `m` and `M` as minutes.
A generic "humanize `3d`" would mislabel one or the other, and reading the way Harper does is what lets the form
say that `3 days` means 3 seconds.

A token timeout jsonwebtoken can't read is refused (`unreadableDurationMessage`): Harper doesn't validate these and
hands them to `expiresIn`, which throws, so no token could be issued after the restart.

## What a save sends

One `set_configuration` field per changed leaf, its path joined with `_` (`toSetConfigurationParams`). That
operation can't remove a setting, and an empty object flattens to no field at all, so both are refused
(`findRefusedChanges`) rather than sent as a save that writes nothing and still restarts. The old editor dropped a
removal silently and reported success.

An object that replaced a value is sent setting by setting, so each of those settings is what gets checked. Harper looks settings up without regard to case (`CONFIG_PARAM_MAP`), and so do the checks. It
also splits a name on every `_`, so a key with `_` in it can't be addressed and is refused.

Harper stores what it is sent through `castConfigValue` (`config/configUtils.ts`): `"3600"` becomes the number 3600.
The editors send text as typed (a field that only takes a number sends one), and `rebaseDraft` counts an edit as landed when the refetch holds what Harper would
have stored for it (`storedByHarper`). Without that, the refetch reads as a change that never goes away. Casting in
the form instead would put values like `{}` or `null` into a text field that can no longer show them.

`studio.navigation` is sent whole (`WHOLE_SETTINGS` in `configDraft.ts`): Harper takes `studio_navigation` only as the
complete map, as the preset writer (`features/clusters/presets/runPresetSetup.ts`) does.

## A refetch can't confirm a cluster save

The config shown is one member's, whichever the load balancer picked, so an edit that reads back as saved proves only
that member has it. Until `useRollingConfigUpdate` reports every instance restarted (`onRestartedSuccessfully`), the
editor keeps what it sent as `unconfirmed` and offers to send it again. The editor is keyed on the entity
(`index.tsx`), so a draft never follows the page to another instance or cluster.

## The lockout warning follows the operations server

Harper's operations server registers CORS with `origin: true` for no list, an empty one, or one that starts with `null`
or `*` (`getCORSOpts`, `server/operationsServer.ts`), so clearing a list opens the API to every origin rather than
closing it. `describeStudioAccessWarnings` mirrors that, and warns about the opening instead of a lockout.
