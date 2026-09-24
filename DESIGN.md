# Studio Design Notes

This file collects architecture and design notes for studio that aren't otherwise discoverable from code or commit history. Future agents (and humans) should read this before making non-trivial changes.

## Active design documents

- [`src/features/organizations/DESIGN.md`](src/features/organizations/DESIGN.md) — shared organization target policy, switch destinations, and account-menu behavior.

- [`src/features/clusters/DESIGN.md`](src/features/clusters/DESIGN.md) — cluster list lifecycle classification, optional metadata and notification scope.

- [`docs/status-redesign.md`](docs/status-redesign.md) — port of analytics-viz visualizations + spec system into the instance Status tab. Covers: 7-tab IA, the data-path adapter (no SQL — `get_analytics` only), bucket-by-window clamps, chart-surface CSS tokens, feature-flag rollback, testing strategy. Read before touching `src/features/instance/status/**`.

## API explorer (the instance/cluster "APIs" tab)

The `/apis` route is a **custom, in-house API explorer** ([`src/features/instance/apis/explorer/`](src/features/instance/apis/explorer/)) — it replaced the previous `swagger-ui-react` embed. Read before touching `src/features/instance/apis/**`.

- **Spec source**: the target instance's own OpenAPI doc, fetched at runtime from `GET /api/openapi/rest` ([`getOpenAPI.ts`](src/integrations/api/instance/status/getOpenAPI.ts)). It's Harper-generated OpenAPI 3.0 — untagged, no `summary`/`operationId` — so the sidebar groups by **path/resource** (first segment → path → method), not by tag. Parsing/rendering treat every spec field as optional.
- **Pure logic vs. UI**: `spec.ts` (flatten/group/`$ref`-resolve/example-gen) and `request.ts` (URL/headers/body/auth + `fetch` execution + the code snippet) are pure and unit-tested; the components render them. Prefer extending the tested modules over adding logic in components.
- **Server URL is a selector, not a guess.** `useEntityRestURL()` derives the REST base by stripping `:9925` off the operations URL, which lands on the wrong port for instances that serve REST elsewhere (a local dev instance serves REST on `:9926`, not port 80). The explorer therefore offers **both** the Studio-computed URL and the spec-declared `servers[]`, defaulting to the computed one. Do not go back to overwriting `spec.servers[0].url`.
- **Try-it-out is credentialed cross-origin `fetch`** (`credentials: 'include'`), the same model Swagger used — which is why the **CORS warning + one-click enable** flow in [`APIDocs.tsx`](src/features/instance/apis/APIDocs.tsx) matters and must be preserved. Auth offers Cookie (session, default) / Basic / Bearer; Basic/Bearer add an `Authorization` header.
- **Persistence**: the server + auth selections persist to `localStorage` under `LocalStorageKeys.ApiExplorerSettings`, **keyed by entity id**, so a credential set for one instance never applies to another.

## Cloud authentication presentation

All cloud authentication routes use `AuthLayout`; keep form submission, validation, OAuth targets, and error handling in the existing route components/hooks. `AuthInput` keeps `FormControl` directly around the input so label/error associations and React Hook Form refs reach the DOM. React 19 passes `ref` through props; browser tests verify first-invalid-field focus. Password selectors must use an exact label match because the reveal button also has “password” in its accessible name.

The wide hero artwork spans both columns beneath the form card in three independent layers: a globe-only background, SVG energy lines/particles, and a transparent platform cutout. There is only one globe surface per theme, so resizing it cannot create a seam against the platform. Keep its max-width unrestricted; the footer’s bottom margin reserves its overflow without moving the form or platform. Each platform cutout has its own scale/offset to align with the original 2054 × 766 coordinates. Keep the headline and feature copy as HTML. `HeroParticles` draws static lines and animates particles from the same theme-specific paths; resizing or replacing the globe does not require retracing them. Reduced-motion mode hides only particles, retaining the static lines, and disables decorative animation. Linux visual baselines use reduced motion so animated decoration does not introduce pixel-diff noise.

## Restarts — the restart tracker and request gate

[`restartTracker.ts`](src/lib/restart/restartTracker.ts) is the one record of which clusters and instances are restarting, so a planned outage doesn't read as a failure. Read it before adding anything that takes an instance down.

- **Two sources.** Studio's own Harper `restart` runs mark and release their targets (`markRestarting`, released in `finally`) — central manager never hears about these. Container ops are central manager's: every `getClusterInfo` fetch mirrors its `RESTARTING`/`STARTING` statuses into the tracker — including a one-node cluster whose only member is restarting under an instance-only op, which leaves the cluster's own status `RUNNING`/`PARTIAL`. A new flow that takes an instance down must use one of the two, or its failures toast like before.
- **Reads are held; everything else is refused.** Every `getInstanceClient` client holds a read (`get_`/`search_`/`describe_`/`list_`/`read_`…) while its entity is `down` and sends it on recovery, but refuses a write at once with `ERR_TARGET_RESTARTING` — a write queued for minutes could land after the user gave up on it, or retried it ([`restartGate.ts`](src/lib/restart/restartGate.ts)). Token minting counts as a write on purpose, so a route guard's Fabric Connect attempt falls through to sign-in instead of stalling. Requests that drive or watch a restart must pass `skipRestartGate: true`, or they wait on themselves. A held read is cancelled if the entity's connection generation changes before release: credentials are read at send time, so it would otherwise go out as whoever connected meanwhile.
- **Central manager's operations proxy refuses a transitional target outright** — `400 "Cluster is not active"` / `"Instance is not active"` for any `INACTIVE_STATES` status, which includes a _rolling_ restart's `RESTARTING` cluster — and relays the host manager's connection errors as a `500` carrying the raw error text. That is why a proxied client holds for marks with `proxyRefuses`, and why `isConnectivityFailure` counts those two shapes.
- **Only query errors are muted, and only connectivity-class ones.** Mutations still toast; a 403 or a Harper 500 during a restart still toasts.
- **Detection is per tab.** A page learns of a container op started elsewhere only from a cluster-record fetch, and the in-cluster studio pages don't poll the cluster, so they don't notice one started in another tab.

## Repo conventions worth knowing

- **Data path to a Harper instance**: always via `instanceClient.post('/', { operation: ... })`. Never SQL, never new endpoints, never a separate transport.
- **Styling stack**: Tailwind 4 + Radix UI + design tokens in `src/index.css`. `cn()` from `src/lib/cn` is the canonical class-merge helper.
- **Routing**: TanStack Router, file-based, lazy-loaded. Build a link to another org/cluster/instance
  with `buildAbsoluteLinkToPage`. A relative `../…` is only safe from a component that unmounts with
  its own route: TanStack resolves it against the _current_ location, so a row that outlives a pending
  navigation re-resolves its href one level too deep (HarperFast/studio#1710).
- **Data fetching**: TanStack React Query 5. Query keys must be instance-scoped when the request targets a specific instance.
- **Cloud permission gates** ([`usePermissions.ts`](src/hooks/usePermissions.ts)) must mirror the check the central manager endpoint runs, not the nearest role flag. An org admin appears in `/User/current` as `roles[orgId].role === 'admin'`; central manager builds every org role with `permission.super_user: false`, so the member helpers' `super_user` short-circuits never identify one — an admin gets full access there from its all-true flags. Container lifecycle ops are where the two diverge: their endpoints admit only org admins and staff holding `instance:update`, so gate them on `useContainerOpsPermission`, never on cluster `update`.

- [`src/features/search/DESIGN.md`](src/features/search/DESIGN.md) — global search loading, shared-query ownership, session isolation, and shortcut behavior.
