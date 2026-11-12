# MCP server — design notes

Harper 5.1+ has a built-in MCP server in two parts, each turned on by the presence of its block in Harper's config:
`mcp.operations` (admin commands as tools, on the operations port) and `mcp.application` (exported tables and resources
as tools, on the application port). This page turns them on and off, edits the operations part's command list, and
shows how to connect (HarperFast/studio#2011).

## A part can only be turned off where every member has `mcp.<part>.enabled`

`set_configuration` writes leaves only, so nothing it accepts removes a block, and a present block is on. The flag
arrived in 5.4.0-alpha.2; an older member refuses `mcp_<part>_enabled` by name, and ignores `enabled: false` written by
hand (`readMcpState` reads the flag by version). So `buildMcpConfigWrite` throws for any change that needs the flag
when `canDisable` is false, and the page sets `canDisable` only when every live member reports a version that has it.

## Every command-list write states the part

Writing any `mcp_operations_*` key creates the block on a member that has none, which turns the part on there. The page
reads one member's configuration, so it can't know which members lack the block. With the flag, every list write
carries `mcp_operations_enabled`; without it, the list is locked while the part is off.

## An explicit list keeps Harper's defaults, and their exclusions

An empty `allow` is Harper's read-only default set, and an explicit one replaces it, so adding a command writes the
default patterns along with it. Harper keeps secrets, OIDC trust policy and preview commands out of the default set
only (`DEFAULT_EXCLUDED` in harper `components/mcp/tools/operations.ts`), so `list_*` in an explicit list exposes
`list_secrets` and `list_oidc_trust`. `writeMcpCommandList` denies every such command a pattern brings in unless the
list names it, and `readMcpCommandList` hides those denials again. For the same reason a list without the defaults
that is emptied is written as `deny: ['*']`, not an empty `allow`, and read back as that empty list. A deny always
wins in Harper, so adding a command a removed pattern blocks lifts the pattern (`addMcpCommand`).

A saved list is compared with the draft by the commands each gives (`sameMcpCommandAccess`), not by text: a list
written elsewhere can match Studio's write in different words, or differ from it only in the exclusions. Their
patterns must match outright, because one sample name per pattern cannot prove two patterns equal.

"Changes data" comes from `isReadOperation`, not Harper's `destructiveHint`, which misses `drop_component` and
`deploy_component` (HarperFast/harper#3075).

## The save restarts the whole instance

Harper mounts the operations part on the operations server when it starts (harper `server/operationsServer.ts`), and
the rolling save's default `restart_service` restarts only the HTTP workers. The page passes `restartOperation:
'restart'`.

## Connecting

An MCP session lives in a `system.mcp_session` row that does not replicate, so `mcpHostForInstance` gives each instance
its own addresses. The client settings follow `harper mcp print-config` (harper `bin/mcp/printConfig.ts`) and hold no
credential: the bridge uses the token `harper login` saved under the target's `normalizeTarget` key
(`bin/mcp/client.ts` `computeAuthHeader`). A target with no port is keyed at 9925, so on Fabric, whose application
target has no port, one sign-in covers both parts (`signInCoversApplication`). The bridge does not refresh the token.
