# MCP server — design notes

Harper 5.1+ has a built-in MCP server in two parts, each turned on by the presence of its block in Harper's config:
`mcp.operations` (admin commands as tools, on the operations port) and `mcp.application` (exported tables and resources
as tools, on the application port). This page turns them on and off, edits the operations part's command list, and
shows how to connect (HarperFast/studio#2011). Each claim below was checked against Harper's source and against
throwaway 5.3.6 and 5.4.0-beta.4 instances.

## Below 5.4 a part Studio turns on cannot be turned off from Studio

`set_configuration` writes leaves only. It refuses `mcp`, `mcp_operations` and `mcp_operations_enabled` as
unrecognized parameters on 5.3.6, and `mcp_operations_allow: null` fails validation (`must be an array`). Nothing it
accepts removes a block, and a present block is on. `mcp.<part>.enabled` arrived in 5.4.0-alpha.2 (harper `199e53603`),
so the page offers turning a part off only when every member of the cluster has it, and warns before turning one on
where it doesn't. On 5.3 `enabled: false` written by hand is ignored, so `readMcpState` reads the flag by version.

## Writing any key under a part turns it on

Since presence enables a part, writing the command list of a part with no block creates the block and turns the part
on. From 5.4 the write carries `enabled: false` alongside; below it, the list is locked while the part is off.

## The command list keeps Harper's defaults, and their exclusions

An empty `allow` means Harper's read-only default set. An explicit `allow` replaces it, so adding a command writes the
default patterns along with it. Harper keeps secrets, OIDC trust policy and preview commands out of the default set
only (`DEFAULT_EXCLUDED` in `components/mcp/tools/operations.ts`); an explicit list is not filtered by it. Copying
`list_*` into one exposed `list_secrets` and `list_oidc_trust` on 5.3.6. So whenever Studio writes an explicit list, it
also denies every default-only exclusion a pattern would bring in, unless the customer added that command by name.
Reading the list back hides those denials again.

A list written elsewhere that lacks some of the defaults is kept as it is, with an offer to add them, rather than
widened on the next save.

"Changes data" comes from `isReadOperation`, not Harper's `destructiveHint`, which misses `drop_component` and
`deploy_component` (HarperFast/harper#3075). Since 5.2.0-alpha.6 the built-in agent takes its tools from this same list,
even while the operations part is off, and the page says so.

## The save restarts the whole instance

The rolling config save restarts only the HTTP workers by default (`restart_service` with `service: 'http'`). Harper
mounts the operations part on the operations server when it starts (`server/operationsServer.ts`), so after that
restart `/mcp` on the operations port still answered 404. This page asks the rolling save for a full `restart`.

The save's error toast now names Harper's own refusal (`Harper refused the change: …`), for every config save.

## Connecting

An AI tool connects straight to an instance, so the page shows each instance's own addresses: an MCP session lives in a
`system.mcp_session` row that does not replicate, and a client a load balancer moves to another member loses it.

The client settings match `harper mcp print-config` (`bin/mcp/printConfig.ts`), with a second key when both parts are
on. They hold no credential: `harper login <operations address>` saves a token the bridge looks up by target
(`bin/mcp/client.ts` `computeAuthHeader`, keyed by `bin/cliCredentials.ts` `normalizeTarget`). A target with no port is
keyed at 9925, so on Fabric, where the application target has no port, the same token signs in the application
connection too. The application part accepted that token (and refused a bogus one) on 5.4.0-beta.4. The bridge does not
refresh the token, so it lasts as long as `authentication.operationTokenTimeout` (a day by default).
