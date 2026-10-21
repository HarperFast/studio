# Studio Design Notes

This file collects architecture and design notes for studio that aren't otherwise discoverable from code or commit history. Future agents (and humans) should read this before making non-trivial changes.

## Active design documents

- [`src/features/organizations/DESIGN.md`](src/features/organizations/DESIGN.md) — shared organization target policy, switch destinations, and account-menu behavior.

- [`src/features/clusters/DESIGN.md`](src/features/clusters/DESIGN.md) — cluster list lifecycle classification, optional metadata and notification scope, and when the cluster form may terminate a cluster.

- [`src/features/cluster/DESIGN.md`](src/features/cluster/DESIGN.md) — when the Starting-up and Scaling screens may report done, how clone progress is read, where the cluster card's sync chip gets its data, how custom-domain cert intent, certificate progress and the Bind selection work, why a domain change is built from a fresh read, why nothing connects to a cluster before its setup, how an interrupted setup finishes, which pages a terminated cluster still opens, and when its sign-ins are forgotten.

- [`src/features/instance/databases/DESIGN.md`](src/features/instance/databases/DESIGN.md) — when the browse grid may show its spinner, why a table without a primary key can't be listed, why a filtered list pages without a count, why Export CSV writes the file in the browser instead of asking Harper for `text/csv`, where columns for undeclared properties come from, why a filter no index can answer asks first, and why an import job Studio stopped following reads as outcome unknown.

- [`src/features/instance/applications/DESIGN.md`](src/features/instance/applications/DESIGN.md) — what happens to a path's unsaved edits, loaded contents and Monaco model when its file is deleted, replaced or moved; how an editor save settles after the page is gone, one file at a time; when a rolling deploy is done: following its restart job, and why a job Studio can't follow is never a success; and when a live deploy may be sent again; why type acquisition stops requesting declarations once its budget is spent.
- [`src/features/instance/config/roles/DESIGN.md`](src/features/instance/config/roles/DESIGN.md) — why the role editor's JSON text is the only source of truth, what forces the JSON view, and what Save changes on purpose.
- [`src/router/DESIGN.md`](src/router/DESIGN.md) — why a failed route load is reported and shown only by its route, and why a preload still toasts.

- [`docs/status-redesign.md`](docs/status-redesign.md) — port of analytics-viz visualizations + spec system into the instance Status tab. Covers: 8-tab IA, the data-path adapter (no SQL — `get_analytics` only), the Jobs tab's own poll and permission gate, bucket-by-window clamps, chart-surface CSS tokens, feature-flag rollback, testing strategy. Read before touching `src/features/instance/status/**`.

## API explorer (the instance/cluster "APIs" tab)

The `/apis` route is a **custom, in-house API explorer** ([`src/features/instance/apis/explorer/`](src/features/instance/apis/explorer/)) — it replaced the previous `swagger-ui-react` embed. Read before touching `src/features/instance/apis/**`.

- **Spec source**: the target instance's own OpenAPI doc, fetched at runtime from `GET /api/openapi/rest` ([`getOpenAPI.ts`](src/integrations/api/instance/status/getOpenAPI.ts)). It's Harper-generated OpenAPI 3.0 — untagged, no `summary`/`operationId` — so the sidebar groups by **path/resource** (first segment → path → method), not by tag. Parsing/rendering treat every spec field as optional.
- **Pure logic vs. UI**: `spec.ts` (flatten/group/`$ref`-resolve/example-gen) and `request.ts` (URL/headers/body/auth + `fetch` execution + the code snippet) are pure and unit-tested; the components render them. Prefer extending the tested modules over adding logic in components.
- **Server URL is a selector, not a guess.** `useEntityRestURL()` derives the REST base by stripping `:9925` off the operations URL, which lands on the wrong port for instances that serve REST elsewhere (a local dev instance serves REST on `:9926`, not port 80). The explorer therefore offers **both** the Studio-computed URL and the spec-declared `servers[]`, defaulting to the computed one. Do not go back to overwriting `spec.servers[0].url`.
- **Try-it-out is credentialed cross-origin `fetch`** (`credentials: 'include'`), the same model Swagger used — which is why the **CORS warning + one-click enable** flow in [`APIDocs.tsx`](src/features/instance/apis/APIDocs.tsx) matters and must be preserved. Auth offers Cookie (session, default) / Basic / Bearer; Basic/Bearer add an `Authorization` header.
- **Persistence**: the server + auth selections persist per tab in `sessionStorage` under `ApiExplorerSettings`, **keyed by entity id**, so a credential set for one instance never applies to another ([`settings.ts`](src/features/instance/apis/explorer/settings.ts)).
- **A sign-out never resets the explorer's sign-out generation.** Each stored credential is stamped with its entity's generation, which lives in `localStorage` as `Studio:ExplorerAuthEpoch` so every tab shares it. A tab drops a credential whose stamp no longer matches, both on the live `storage` event and when it loads (`installExplorerCrossTabCleanup`); a tab that was reloading or frozen during the sign-out gets only the second. A reset would make every credential stamped 0 current again, so the full sign-out's storage wipe keeps that key. Its global bump is the sign-out's only write of the record: the collapse covers the per-entity bumps, which are skipped. It runs even when an earlier teardown step throws, is written again after the wipe when a full store refused it, and collapses the record to one `'*'` slot above every entity's count, so no instance id outlives the sign-out (`signOutHandlers.test.ts`, HarperFast/studio#1946). All of this needs storage to accept one write: if it refuses the retry too, the record stays as it was until this tab's next entity sign-out, which writes the collapse instead; a reload forgets that it is owed. Two tabs bumping at the same moment can still lose one of the writes.

## Operations console (the instance/cluster "Operations" tab)

[`src/features/instance/operations/`](src/features/instance/operations/) sends one freeform operations-API body through the entity's own `getInstanceClient` client (direct, basic, or proxied — whatever every other page uses). The rules, each pinned by a test there:

- **The typed text is the request body.** It is parsed only to validate it and read `operation`; re-serializing the parse would round integers past 2^53 (a primary key) before Harper saw them. Axios sends a string body that parses as JSON as-is, only trimmed.
- **At most one send.** It sets `skipGatewayRetry`, because the shared client replays a 502/503/504 for any body whose `operation` reads by name, and a component's `get_…` operation is no proof that it only reads. Only a request Studio refused before sending counts as unsent. Anything that reached Harper marks data stale, an error answer included, because an arbitrary operation can change something before it fails; and a request abandoned mid-flight (the page unmounted) is reported as possibly applied.
- **Only Harper's own reads skip the confirmation.** [`isBuiltInRead`](src/features/instance/operations/operationKinds.ts) is the restart gate's naming rule ([`isReadOperation`](src/integrations/api/isReadOperation.ts)) _and_ membership in the role editor's catalog of Harper's operations, because a component can register a mutating `get_…`. Everything else — unknown names, every `sql` — confirms, showing the exact body. It guards against a mistyped paste; Harper's `verifyPerms` is what authorizes each operation.
- **Operations Studio has to know about are not sent blind.** A `restart` is tracked with `markRestarting` exactly like the Restart button's (released at once on a 4xx; a 5xx can be a gateway losing the answer to a restart that ran), so the page's reads are held (an instance) or their connectivity errors muted (a cluster, which restarts one member) until `waitUntilAnsweringAfterRestart` sees the target again. `logout` is refused: it would end the session the rest of Studio is still using. Any other operation with such a side effect needs the same treatment rather than a raw send.
- **Nothing leaves the page.** Failures render inline and never pass through `console.error` or the global React Query handlers (RUM reports the former, and bodies carry passwords and secrets). The editor buffer is not persisted, and the console remounts per entity so a confirmation written for one instance can never be sent to another. After a possible write, entity queries are marked stale with `refetchType: 'none'`, never refetched into whatever the operation just did. The download is abandoned once progress passes 5 MB (XHR reports progress about every 50 ms, so this bounds, not caps, what arrives), and display truncates like the API explorer.

## Admin API tokens (the Admin "API Tokens" page)

[`src/features/admin/apiToken/`](src/features/admin/apiToken/) mints, lists and revokes staff API tokens against central manager's `Admin/ApiToken` (HarperFast/central-manager#973).

- **The secret leaves the shared caches as soon as the form has it.** The query cache only ever holds `GET /Admin/ApiToken/` rows, which carry no secret. The mint's result does pass through the MutationCache, which is readable through `queryClient.getMutationCache()` and the devtools, so the form copies it into page state and `reset()`s in the same success callback, and the mutation runs with `gcTime: 0` so the discarded result is collected once its observer unmounts (`useGenerateApiToken.test.ts`). Sign-out clears the MutationCache as well (`clearAuthStateLocally`).
- **The role caps are a mirror, not the rule.** [`staffTokenRoles.ts`](src/features/admin/apiToken/staffTokenRoles.ts) repeats central manager's `STAFF_API_TOKEN_LIFETIMES` so the form can bound the lifetime field and pick a default; the server refuses anything longer. Change both together (`staffTokenRoles.test.ts` pins the numbers).
- **The role picker cannot see the owner's role.** Nothing central manager exposes says which staff role another account holds (a `fabricRole` on `Admin/User` is a central manager follow-up), so the form offers every staff role and leaves "no wider than the owner's" to the server's 403. That refusal names the owner's role, so `roleRefusalMessage` puts it under the role field; the mint mutation opts out of the global toast and the form toasts every other failure itself.
- **Visibility is a permission, not a role name.** The rail shows the page to `apiToken:self` (every staff role holds it, so an owner who cannot mint still sees and revokes their own tokens); the mint form is gated on `apiToken:create`. The role-name fallback for an API without `staffPermissions` never reaches the page, since such a central manager predates the token API it drives. `super_user` stays carved out: it may password-login, and a token is a staff credential it cannot mint.

## Cloud authentication presentation

All cloud authentication routes use `AuthLayout`; keep form submission, validation, OAuth targets, and error handling in the existing route components/hooks. `AuthInput` keeps `FormControl` directly around the input so label/error associations and React Hook Form refs reach the DOM. React 19 passes `ref` through props; browser tests verify first-invalid-field focus. Password selectors must use an exact label match because the reveal button also has “password” in its accessible name.

The wide hero artwork spans both columns beneath the form card in three independent layers: a globe-only background, SVG energy lines/particles, and a transparent platform cutout. There is only one globe surface per theme, so resizing it cannot create a seam against the platform. Keep its max-width unrestricted; the footer’s bottom margin reserves its overflow without moving the form or platform. Each platform cutout has its own scale/offset to align with the original 2054 × 766 coordinates. Keep the headline and feature copy as HTML. `HeroParticles` draws static lines and animates particles from the same theme-specific paths; resizing or replacing the globe does not require retracing them. Reduced-motion mode hides only particles, retaining the static lines, and disables decorative animation. Linux visual baselines use reduced motion so animated decoration does not introduce pixel-diff noise.

## Restarts — the restart tracker and request gate

[`restartTracker.ts`](src/lib/restart/restartTracker.ts) is the one record of which clusters and instances are restarting, so a planned outage doesn't read as a failure. Read it before adding anything that takes an instance down.

- **Two sources.** Studio's own Harper `restart` runs mark and release their targets (`markRestarting`, released in `finally`) — central manager never hears about these. Container ops are central manager's: every `getClusterInfo` fetch mirrors its `RESTARTING`/`STARTING` statuses into the tracker — including a one-node cluster whose only member is restarting under an instance-only op, which leaves the cluster's own status `RUNNING`/`PARTIAL`. A new flow that takes an instance down must use one of the two, or its failures toast like before.
- **Reads are held; everything else is refused.** Every `getInstanceClient` client holds a read (`get_`/`search_`/`describe_`/`list_`/`read_`…) while its entity is `down` and sends it on recovery, but refuses a write at once with `ERR_TARGET_RESTARTING` — a write queued for minutes could land after the user gave up on it, or retried it ([`restartGate.ts`](src/lib/restart/restartGate.ts); the read rule is [`isReadOperation`](src/integrations/api/isReadOperation.ts), shared with the operations console). Token minting counts as a write on purpose, so a route guard's Fabric Connect attempt falls through to sign-in instead of stalling. Requests that drive or watch a restart must pass `skipRestartGate: true`, or they wait on themselves. A held read is cancelled if the entity's connection generation changes before release: credentials are read at send time, so it would otherwise go out as whoever connected meanwhile.
- **Central manager's operations proxy refuses a transitional target outright** — `400 "Cluster is not active"` / `"Instance is not active"` for any `INACTIVE_STATES` status, which includes a _rolling_ restart's `RESTARTING` cluster — and relays the host manager's connection errors as a `500` carrying the raw error text. That is why a proxied client holds for marks with `proxyRefuses`, and why `isConnectivityFailure` counts those two shapes. The set also covers ERROR, FAILED and the terminal states, which no restart releases: a poll through the proxy must be gated on [`isOperationsProxyRefused`](src/components/ui/utils/badgeStatus.tsx), not `isStoppedOrTransitioning`, or it 400s every tick for as long as the page is open (HarperFast/studio#1569).
- **Only query errors are muted, and only connectivity-class ones.** Mutations still toast; a 403 or a Harper 500 during a restart still toasts.
- **Detection is per tab.** A page learns of a container op started elsewhere only from a cluster-record fetch, and the in-cluster studio pages don't poll the cluster, so they don't notice one started in another tab.

## Cluster config updates — when an instance may skip its own `set_configuration`

[`useRollingConfigUpdate`](src/hooks/useRollingConfigUpdate.tsx) saves the config editor's change by restarting a cluster's RUNNING instances one at a time, and every instance it restarts must already have the new config on disk: `set_configuration` only writes the file, and nothing applies it until a restart.

- **Pre-5.2, mixed-version, or unknown-version clusters write each instance before restarting it.** `replicated: true` on `set_configuration` exists from Harper 5.2.0 ([`shouldFanOutSetConfiguration`](src/integrations/api/instance/status/setConfiguration.ts)); 5.0 and 5.1 apply the change locally and report no peers.
- **On 5.2+ the first instance is still written and restarted alone.** Only once it is back up on the new config is the write fanned out with `replicated: true` from that instance — even when it was the last instance to restart, because the fan-out also reaches live members Studio does not restart (not RUNNING, or failed earlier), which the per-instance path leaves on the old config. Fanning out first would leave an unproven config pending on every node, which a Cancel could no longer contain.
- **A later instance skips its write only when the fan-out acknowledged that exact node** — its CM `replicationFqdn` (lower-cased) appears among the successful `replicated[]` entries. Fabric names each Harper node after that FQDN (host-manager sets `NODE_HOSTNAME` and `REPLICATION_HOSTNAME` to it). A count of acknowledgements is not proof: the origin's replication peers are not CM's restart targets, so a stale peer can stand in for a missing one. A target with no `replicationFqdn`, a rejected fan-out (the instance client rejects any response with a failed peer), or a response with no usable `replicated[]` all keep the per-instance write.

## Instance clients replay only reads

Every `getInstanceClient` client replays a 502/503/504 up to three times (5s/10s/20s), but only for a request [`isReadRequest`](src/integrations/api/isReadOperation.ts) accepts: a GET, or a POST whose body's `operation` is a read by Harper's naming — the restart gate's rule, one predicate for both ([`retryGatewayErrors.ts`](src/integrations/api/retryGatewayErrors.ts)). A write is sent once and its first 5xx is final, because no gateway status proves the write was not applied: Harper itself answers 503 after handing an operation to a worker that exits or overruns. Do not add an exemption for a "usually safe" status or a write that looks idempotent; a caller whose write is safe to repeat retries it itself, where it can say why.

## A write with no verdict never reads as failed

The same rule decides what a failure says. [`isUnansweredWrite`](src/integrations/api/unansweredWrite.ts) is a request `isReadRequest` rejects, answered 502/503/504 or not at all (`ERR_NETWORK`, a timeout). [`describeError`](src/react-query/queryClient.ts) checks it before reading any body and returns "Outcome unknown … check whether it took effect before you try again", so the global mutation toast and every `describeError` caller say so with no copy of their own. Gate on status, never body (a gateway's body describes the gateway), and keep it to display: rewriting `error.message` would defeat `shouldKeepEvent`, which recognises timeouts and `Network Error` by message.

- **A caller that adds its own failure toast to a mutation** asks [`shouldToastOwnFailure`](src/react-query/queryClient.ts) first, so "Failed to …" never sits beside the global warning. A caller with no mutation behind it (rename, the chat tools), or one whose mutation opts out of the global toast (the deploy mutation behind import, redeploy and staged-release activation), shows `describeError`'s text itself, under a title from [`deployFailureTitle`](src/features/instance/applications/modals/reportDeployHealth.ts) for a deploy ("Couldn't confirm … was redeployed", never "Failed to …"), and a loop that tallies one write per target (cluster restart, rolling config, licenses) counts these apart from failures.
- **Every error that means an unknown outcome is listed once**, in `describeUnknownOutcome` ([`queryClient.ts`](src/react-query/queryClient.ts)): this one, an unconfirmed restart (below), and an import job Studio stopped following ([databases DESIGN.md](src/features/instance/databases/DESIGN.md)). `describeError`, `shouldToastOwnFailure` and the toast's never-collapse rule (below) all read it, so a kind added there gets all three.
- **Do not re-wrap an AxiosError into a plain `Error`** for a write: the predicate needs its `config`. `secrets.ts` passes an unanswered one through as is.
- **A restart with no verdict stays marked until its target answers again or the watch gives up**, as an accepted one does, because a gateway can lose the answer to a restart that ran. The Restart button holds the mark while it watches, and the cluster loop waits on that member before restarting the next.
- **These toasts are never collapsed** onto a shared id: each warns about a different write, and a read timing out alongside one must not replace it through `request-timeout`.
- **A read that is costly to repeat** stays a read here and opts out of the replay instead (`package_component`, `skipGatewayRetry`).

## A restart Harper accepted never reads as failed

Harper's answer to the restart request is its only verdict on the restart: `restart` answers before it tears down (harper `bin/restart.ts` schedules the teardown 50ms out so the reply can go first) and `restart_service` once its job has started (`executeJob`). So [`restartInstance`](src/integrations/api/instance/status/restartInstance.ts) rejects with the request's own error only when that request failed; after a 2xx, a target Studio never sees answer the `user_info` watch successfully rejects with [`RestartUnconfirmedError`](src/integrations/api/instance/status/restartUnconfirmed.ts), which reads "Not back yet", never "Failed", and is never a reason to send the restart again.

- **The watch outlasts the usual recovery time** (one settle, then two probe schedules), and `onSlowToReturn` fires once between them so a caller can say it is still waiting. Every restart mark uses `RESTART_MARK_TTL_MS`, derived from the same constants, so no mark lapses while its watch still runs; the probes skip the gateway replay for the same reason.
- **Only a successful probe counts as back, never a 401/403.** Through central manager's operations proxy a 403 is CM refusing the caller before it contacts the instance (`notAllowed()` in its `HDBInstance.js`), so it says nothing about the target; reading it as "back" would report a restart Studio never saw finish. That is also why the copy says Studio "couldn't confirm it came back", not that the target never answered.
- **A one-at-a-time loop stops at a member that is not back** (cluster restart, rolling config update): restarting the next one could leave no member serving. Both loops also wait on a member whose restart got no verdict, and stop if that follow-up watch gives up too: it may have restarted and still be down, or, in a config update, restarted onto a configuration that broke it. Either report names the members it left alone, and it, like the no-verdict warning, outranks Cancel, which would otherwise hide the warning not to restart again; the report then says which members Cancel left. A Cancel clicked during a member's configuration write stops before its restart, and the report says the configuration may be pending there. On a 5.2+ cluster the config update never fans out from a canary that is not back, since it never proved it can run the configuration; a stop after the fan-out keeps the note that the members it left may already have the new configuration saved.
- **The chat tools return `success: true`** for it: their action was carried out, and `false` invites the agent to repeat it.

## Cluster upgrade picker — which versions an existing cluster is offered

[`buildUpgradeVersionOptions`](src/features/clusters/upsert/lib/buildUpgradeVersionOptions.ts) is the one place that decides, and its test file is the spec. Two rules, and they differ on purpose:

- A **global** entry is offered only above the cluster's `current` version and only if no instance already runs it — no downgrades, so a `next` v5 cluster is never handed `stable` v4.
- An entry central manager marked **`scoped`** (released to this organization by name, HarperFast/central-manager#862) is offered whatever its order, and hidden only when it _is_ `current`. Staff scope a build to pin a customer to it, and it is usually older than the fleet default; a mixed-version cluster with the pinned build on some instances still needs it selectable to converge. `dedupeHarperVersionsByTag` carries `scoped` across a tag collision because the flag belongs to the version string, not the tag.

Both rules read only the cluster's live instances (`liveReportedVersions`, shared with `detectPartialUpgrade`): a terminated instance still reporting a higher version must not become `current`, or the version every live instance runs would be offered back as a change.

Offering a lower pinned version changes what a mixed-version cluster means. Before, the highest reported version was always the intended target and the form let the user re-run it for the lagging instances. With a pin among the lagging versions that is no longer knowable — an upgrade off the pin that failed on one instance looks exactly like a downgrade to the pin that succeeded on one, and central manager records no target on the cluster. `detectPartialUpgrade` reports that case as `ambiguous`; the form then pre-selects nothing and withholds the re-run affordance, so the user names the target and either choice dirties the form.

Central manager only ever sends the boolean, never the other organizations' ids; a missing flag reads as global, so an older central manager leaves the picker exactly as it was.

## Repo conventions worth knowing

- **Data path to a Harper instance**: always via `instanceClient.post('/', { operation: ... })`. Never SQL, never new endpoints, never a separate transport.
- **Styling stack**: Tailwind 4 + Radix UI + design tokens in `src/index.css`. `cn()` from `src/lib/cn` is the canonical class-merge helper.
- **Routing**: TanStack Router, file-based, lazy-loaded. Build a link to another org/cluster/instance
  with `buildAbsoluteLinkToPage`, and give a `<Link>` or `<Navigate>` an absolute target too. A
  relative `../…` resolves against the location current when it renders, and a route's own page stays
  mounted while a navigation away from it loads. A row re-resolved its href too deep
  (HarperFast/studio#1710, #1711); Finish Setup's `<Navigate to="../sign-in">` rendered after its own
  `navigate('../')` had moved the location and sent the user to `/<org>/sign-in`, which reads
  `sign-in` as a cluster id. A page that changes the state its redirect guard reads must also hold
  that guard until its own navigation finishes (`FinishSetup`'s `isPending`/`isSuccess`).
  `EntityMenuItem.to` accepts only the helper's `AbsolutePath`, so a relative menu target fails `tsc`.
- **Remembered instance/cluster sign-ins are checked on demand**: the sign-in markers span every organization ever
  visited, so the root auth subscription checks only the app sign-in; an entity is checked by
  `useInstanceAuth`/`listenToEntity` or the instance-layout guard (`entityAuthCheckScope.test.ts`, HarperFast/studio#1329).
- **Each sign-in marker has its own key, `Studio:PotentiallyAuthenticated:<entityId>`, holding the URL signed into**
  (`signInMarkers.ts`, HarperFast/studio#1968). A tab writes only the entity it signs in or out, so tabs can't erase or
  restore each other's markers; app and full sign-outs act on every stored marker, at each URL an entity is marked at
  here or in storage. A check never undoes another tab's change: a passing one of a sign-in this tab already marked
  writes nothing, and a failing one removes only the marker it checked. So a marker removed elsewhere stays removed
  while this tab still holds that sign-in, until this tab signs into the entity again, which always writes; for the
  app sign-in, which every `/User/current` answer re-signs, those answers count as checks. A check's answer, or a
  `/User/current` answer, is dropped when this tab signed in again while it was out (`crossTabMarkers.test.ts`,
  `getCurrentUser.test.ts`). A sign-in storage refuses to record still signs in, and its next sign-in or check writes
  it; a marker storage won't remove is retried at every marker write, unless another tab has rewritten it since
  (`localSignOutStorageFailure.test.ts`).
- **The previous release's one shared record is kept in step for one more release.** Its tabs read
  `Studio:PotentiallyAuthenticated` once at load and write their whole copy back, and know nothing of the per-entity
  keys. So this release copies that record into the keys once per storage (a marker already stored per entity wins),
  mirrors every marker change into it, and reads it in every sign-out sweep. A previous-release tab, or a rollback,
  therefore still sees this release's sign-ins and sign-outs, and an app sign-out here reaches a sign-in only that tab
  recorded. Its sign-in reaches this release's keys only at that first copy, and its sign-out of an entity doesn't
  remove the entity's key, which matters only if its logout also failed; its full sign-out wipes both. The copy is
  never repeated, because that tab's whole-copy writes would bring back what this release signed out, so the sign-out
  wipe keeps the flag that records it. Until the copy lands, as when a full quota refuses it, the record also seeds
  this tab's markers (`legacySignInMarkers.test.ts`, `account-menu.anon.spec.ts`). Every load also removes a record
  that isn't one, which the previous release can't start on, and drops entries that aren't markers; a sign-in leaves
  one it can't read alone. The release after this one stops the mirror and removes the record (HarperFast/studio#1970).
- **`Dashboard` renders nothing under it without a signed-in user.** Route data loads in parallel with the page load's
  `/User/current` check (waiting for it costs +262/680 ms p75 on live org/cluster cold loads), and central manager
  answers a request with no session with 403, so a deep link on an expired session has its route data fail before the
  check says the session is gone. Rendering the outlet then would show that route's error page — "no access" for what is
  an expired session — and let still-mounted pages rebuild their queries after the sign-out's cache clear and fetch
  again on the dead session. The guard redirects every signed-out dashboard load, so the spinner only covers the moment
  before it does (`endedSessionRouteFailures.test.tsx`, HarperFast/studio#1546).
- **App sign-out and cluster removal post `logout` only to an instance that holds a credential of the user's.**
  `buildLogoutClient`, shared by the app sign-out sweep and by removing a self-hosted cluster (`signOutEntities`),
  returns no client for a sign-in that `connectsThroughProxy` (the Disconnect button and `signOutOfInstance` still
  post one, HarperFast/studio#1974): the central manager hands a proxied operation to the host manager, which calls the
  instance over its socket with no cookie or token, so Harper's `logout` has no session of the user's to end and
  answers 500 (RUM: 16 of 24 proxied logouts at app sign-out in the 30 days to 2026-10-15, each a round trip
  `/Logout/` waited on). The Fabric Connect flag outlives the tab while the direct token does not, so a second tab sees
  another tab's direct sign-in as proxied and would post the same doomed logout. On app sign-out the central-manager
  `/Logout/` ends the only session that path has; on cluster removal there was never one to end. Direct, basic-auth
  and cookie sign-ins still get their `logout` on both paths (`signOutFromPotentiallyAuthenticatedInstances.test.ts`,
  `signOutEntities.test.ts`).
- **Signing out in one tab signs out every tab.** `signOutAllLocally` rewrites `Studio:AppSignOut`, and each other tab
  holding the app sign-in runs `clearAuthStateAfterSignOutElsewhere` on that `storage` event (`installCrossTabSignOut`).
  Without it, a tab learns the session ended only from its next central-manager request, whose 403 toasts as a
  permission refusal. `signOutAllLocally` runs once the shared session has ended: after `/Logout/` succeeds, on a 401,
  after a password change. When a full store refuses the announcement, it is written once the sign-out's wipe has made
  room, then removed. If storage refuses that too, it is never sent: later, it could end a session the user has signed
  back into in another tab. The sign-out sweep does not announce, because it runs before `/Logout/`: a failed logout
  would sign the other tabs out of a live session, and one signed back in meanwhile would be ended by that `/Logout/`.
  The value names the user whose session ended: the tab's last app user, since the sweep and a sign-in check both blank
  the user first. A page load whose own check 401s never knew its user and announces nothing; the other tabs find out
  from their next request. A tab follows only when the name is its own app user: a late 401 or event from user U's session must not sign out a
  tab that has since signed in as V. A tab whose check is still out remembers the user, and if the check comes back as
  them, asks again: central manager may have confirmed them just before the session ended.
  Tabs follow that key, not the app sign-in's marker, because a tab also drops that marker when its own check merely
  fails (a timeout, a 5xx). A tab that follows writes no `localStorage`: the other tab already wiped it, and a write
  could undo that tab's next sign-in (`crossTabSignOut.test.tsx`).
- **Data fetching**: TanStack React Query 5. Query keys must be instance-scoped when the request targets a specific instance.
- **Polling**: every `refetchInterval` on a query that can reject against an instance or a cluster goes through [`pollUnlessForbidden`](src/react-query/pollUnlessForbidden.ts), which stops the timer on a 403 and backs off a sustained 400 or 5xx; a raw number polls a failing endpoint at full rate for as long as the page is open. When the interval depends on the data, compute it and hand it over per tick: `(query) => pollUnlessForbidden(base(query))(query)` (the back-off state is per query, not per wrapper).
- **Forms**: react-hook-form with a zod `zodResolver`. A form whose submit button waits on `formState.isValid` must not use the default `onSubmit` mode, which keeps `isValid` current but shows errors only after a submit the disabled button never allows, so the user is blocked with no reason given (HarperFast/studio#1550). Use `mode: 'onTouched'`: a field's error appears once it is first left and then follows each change, while `isValid` still tracks every keystroke (`onBlur` recomputes `isValid` only on blur, so the button lags the text). Enter neither submits past a disabled button nor leaves the field, so give the `<form>` `onKeyDown={revealFieldErrorOnEnter(form)}`, which treats Enter in a text input as leaving it. A refine that compares two fields reports on one of them; re-check that field from the other's `onChange` once it has been touched (`getFieldState(name).isTouched`, then `trigger(name)`), because `rules={{ deps }}` fires on the other field's first blur, before the user reaches it. react-hook-form only updates the `formState` fields a render has read, and `disabled={!isDirty || !isValid}` skips `isValid` while the form is pristine, so where one change can complete the form (a single field, a paste, a checkbox) the button stays disabled on a valid form. Read the fields before the JSX (`const { isDirty, isValid } = form.formState;`) and pin it with a test that makes one change and checks the button.
- **Cloud permission gates** ([`usePermissions.ts`](src/hooks/usePermissions.ts)) must mirror the check the central manager endpoint runs, not the nearest role flag. An org admin appears in `/User/current` as `roles[orgId].role === 'admin'`; central manager builds every org role with `permission.super_user: false`, so the member helpers' `super_user` short-circuits never identify one — an admin gets full access there from its all-true flags. Container lifecycle ops are where the two diverge: their endpoints admit only org admins and staff holding `instance:update`, so gate them on `useContainerOpsPermission`, never on cluster `update`.
- **Resizable sidebars** (applications file tray, databases, API explorer) all run on [`useResizableSidebar`](src/hooks/useResizableSidebar.ts); a new one should too. The hook is the only writer of the width's CSS variable — attach `sidebarRef` to every element that reads it rather than passing it through `style` — and it moves that variable during a drag without rendering. Each surface's `storageKey` holds users' saved widths, so renaming one resets them.
- **Unit tests never read `.env` files and never open a real WebSocket.** `vitest.config.ts` sets
  `envDir: false`, so a developer's `.env.local` (which points `VITE_CENTRAL_MANAGER_API_URL` at
  live stage) never reaches `import.meta.env` — only `VITE_*` exported in the shell does, as in CI,
  which exports none; and [`failOnRealWebSocket.ts`](src/testSetup/failOnRealWebSocket.ts)
  replaces `WebSocket` with an inert stand-in that fails any test constructing one. A test that
  needs a socket stubs it with `vi.stubGlobal('WebSocket', …)`. Under jsdom a real socket cannot
  work anyway — its `open` event throws an uncaught realm-mismatch `TypeError` that fails a run of
  green tests (HarperFast/studio#1689).

- [`src/features/search/DESIGN.md`](src/features/search/DESIGN.md) — global search loading, shared-query ownership, session isolation, and shortcut behavior.
