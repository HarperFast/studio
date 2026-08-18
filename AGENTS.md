# studio — engineering notes for coding agents

Hard-won, project-specific gotchas. Skim the relevant section before touching related
code — each of these has cost a debugging session.

## Commits — Conventional Commits are enforced in CI

Every commit message needs a Conventional Commits prefix: `type(scope): subject`
(`@commitlint/config-conventional` types — `feat`, `fix`, `docs`, `chore`, `test`,
`refactor`, `perf`, `ci`, `build`, `style`, `revert`; scope optional; subject case is
unrestricted, per `commitlint.config.cjs`). The **Verify Commits** workflow
(`.github/workflows/verify-commits.yaml`) runs commitlint on every PR and on pushes to
`dev`/`stage`/`prod` — a single unprefixed commit fails the check, and history that already
landed on a deploy branch has to be rewritten and force-pushed to fix it.

Don't count on the local hook to catch this first. `.husky/commit-msg` only runs after
`pnpm install` has run the `prepare: husky` script, which is what points `core.hooksPath`
at `.husky`. In a fresh clone or worktree that skipped install, `core.hooksPath` is unset,
the hook never fires, and a non-conforming message commits silently — CI is the first thing
that objects.

## Routing — keep `getParentRoute` and `addChildren` in lockstep

In the TanStack Router setup (`src/router/rootRouteTree.ts`), every route's declared
`getParentRoute: () => X` MUST be mounted under that same `X` via `addChildren`. If a
route is placed a level above/below its declared parent (so its declared parent becomes
a sibling in the children array), **TanStack Router 1.170 silently corrupts route
matching** — static segments get parsed as params (`config` → param `onfig`, `ssh-keys`
→ `sh-keys`) and the real params (`organizationId`, `clusterId`) are dropped.

This caused the `/Organization/undefined` bug (Jun 2026): the cluster instance/edit
routes declared `getParentRoute: () => clusterLayoutRoute` but were mounted under
`clustersLayoutRoute`, so deep-linking to `/org/clu/logs` lost `organizationId` and
`orgLayoutRoute.beforeLoad`'s prefetch hit `/Organization/undefined`. Router 1.133
tolerated the mismatch; the 1.133→1.170 bump exposed it.

`addChildren` and `getParentRoute` are two sources of truth that must agree. Regression
coverage lives in `src/router/__tests__/orgUndefinedRepro.test.ts`, which uses
`router.matchRoutes()` (no loaders/network) to assert deep links parse params correctly.

## Routing — the router must be created exactly once (never per render)

`useNewRouter` memoizes `createRouter()`/`createHashHistory()` with a `useState` initializer
— keep it that way. Every `createHashHistory()` call monkey-patches
`window.history.pushState/replaceState` (wrappers chain and are never removed) and leaks
`popstate`/scroll listeners. Worse, when the current history entry lacks `__TSR_key` (true
after any raw `location.hash =` navigation), history creation synchronously calls
`replaceState` — the patched chain then notifies the live router's subscriber mid-render,
which React logs as **"Cannot update a component (`Transitioner`) while rendering a
different component (`AppRouted`)"** (hit Jul 2026: `AppRouted` re-rendered on every
authStore tick and rebuilt the router each time).

Auth updates reach the memoized router via the `RouterProvider` `context` prop plus the
`router.invalidate()` effect in `src/AppRouted.tsx` — that invalidate is what re-runs
`beforeLoad` guards (e.g. the sign-out redirect in `dashboardRoute.ts`), so don't remove it.

## Routing — `@tanstack/router-core`'s preload-eviction `_nonReactive` TypeError is now fixed upstream

Studio #1387 / upstream TanStack/router#7759: when a hover-intent preload's cached match
was evicted mid-flight (user navigates, `router.invalidate()`, cache GC), `router-core`
re-read the match after an `await` and threw `TypeError: Cannot read properties of
undefined (reading '_nonReactive')`, which `preloadRoute` then `console.error`'d —
polluting Datadog RUM on every hover-then-navigate race. We carried the fix from
TanStack/router#7003 as a local pnpm patch
(`patches/@tanstack__router-core@1.171.15.patch`, wired via `patchedDependencies` in
`pnpm-workspace.yaml`) through several router-core bumps.

TanStack/router#7805 — a router-core rewrite of the whole match-loading pipeline
(`load-matches.js` split into `load-client.js`/`load-server.js`, a transaction/lane
model) — folded in the same fix and shipped in `router-core@1.171.16`. Once the bump to
that version landed (studio#1595), the local patch was redundant, so it and the
`patchedDependencies` entry were removed. Regression tests remain at
`src/router/__tests__/preloadEvictionRepro.test.ts`, now run unpatched against whatever
router-core version is current; they were the way we _proved_ the upstream fix covers
this before deleting the patch, so keep them green rather than deleting them.

## Tables — every TanStack Table feature is registered in `src/lib/table.ts`

`@tanstack/react-table` v9 dropped the v8 "every table gets every feature" model. A feature
only exists on a table if it was registered with `tableFeatures()`, and the resulting feature
set is the first generic parameter of every table type (`ColumnDef<TFeatures, TData, TValue>`,
`Row<TFeatures, TData>`, ...). Studio registers **one** feature set in `src/lib/table.ts` and
re-exports `Cell`/`CellContext`/`ColumnDef`/`Header`/`HeaderGroup`/`Row`/`Table` and
`createColumnHelper` already bound to it — so import table types from `@/lib/table`, and
`@tanstack/react-table` only for feature-independent things (`flexRender`, `useTable`,
`SortingState`, `ColumnSizingState`, `ColumnVisibilityState`, `RowData`, ...).

Two consequences worth knowing before you touch a table:

- **A missing API is a missing feature, not a removed API.** `column.toggleSorting`,
  `header.getSize()`, `columnDef.enableColumnFilter` etc. only typecheck once their feature is
  in `studioTableFeatures`. Add the feature there rather than casting.
- **Row models are shared, so opt out per table.** The sorted row model is registered globally;
  the browse table (`src/features/instance/databases/components/TableView.tsx`) sorts and pages
  on the server and therefore sets `manualSorting: true`. Without it the client would re-sort
  the page behind the query — `TableView.test.tsx` guards this.

Also: TanStack builds initial state as `{ sorting: [], ...initialState }`, so passing an
explicit `sorting: undefined` _replaces_ the default and the first header click throws inside
`toggleSorting`. Default optional sorting props before handing them over (see
`SimpleBrowseDataTable`).

## pnpm — dependency overrides go in `pnpm-workspace.yaml`, not `package.json`

This repo uses pnpm 11. `overrides` (and other settings like `minimumReleaseAge`,
`allowBuilds`, `onlyBuiltDependencies`) live in `pnpm-workspace.yaml`, NOT in a `pnpm`
field in `package.json` — pnpm 11 no longer reads that field. It only logs
`[WARN] The "pnpm" field in package.json is no longer read` and the install otherwise
"succeeds", so the override is silently ignored.

Add a top-level `overrides:` block to `pnpm-workspace.yaml`. Scoped keys work too (e.g.
`'undici@>=7.0.0': '^7.28.0'`). After editing, run `pnpm install --lockfile-only` and
grep the lockfile to confirm the stale versions are gone.

## vitest/jsdom requires undici 7

`undici` is a transitive dev/CI-only dep (jsdom for vitest; semantic-release /
`@actions/http-client` for CI). jsdom imports the internal
`undici/lib/handler/wrap-handler.js`, which **undici 8 removed**. So a broad
`undici@>=7.0.0: ^8.0.0` override force-upgrades jsdom to undici 8 and every vitest
worker crashes at import with `Cannot find module 'undici/lib/handler/wrap-handler.js'`
(other test files "pass" only because the crashing ones never run).

Keep a scoped override so jsdom stays on 7 while everything else moves to 8 (landed in
PR #1358):

```yaml
'undici@>=7.0.0': '^8.0.0'
'jsdom>undici': '^7.28.0' # newest 7.x (the `seven` dist-tag)
```

The `parent>child` scoped override wins over the broad `pkg@range` selector. Renovate
may reopen this on the next undici bump — keep the `jsdom>undici` line. Revisit when a
jsdom release supports undici 8 (none as of 2026-06).

## Google sign-in button has no `display`

`src/features/auth/components/GoogleAuthenticationButton.css` (`.gsi-material-button`)
declares `width: 100%` but **no `display`**, so the `<a>` defaults to `display: inline`
and ignores width. It only renders full-width because on the sign-in/sign-up pages it is
a direct child of a `flex` container (which blockifies flex items).

Wrap that button in a plain `<div>` (e.g. for an overlay/badge) and it reverts to inline
and collapses. Fix: make the wrapper `flex flex-col` (or add `block`/`w-full` to the
anchor). The GitHub button (`.github-signin-btn`) sets `display: flex` explicitly and is
not affected. (Hit while building the "Last used" sign-in badge, #1316.)

## Testing Radix menus in jsdom

This repo has NO `@testing-library/user-event` — only `@testing-library/react` +
`fireEvent`. Vitest's default env is `node`, so component tests must start with
`/** @vitest-environment jsdom */`.

To drive a Radix dropdown/menu (e.g. `src/components/ui/dropdownMenu.tsx`) in jsdom:

- In `beforeAll`, polyfill the DOM APIs Radix needs: `Element.prototype.hasPointerCapture`,
  `setPointerCapture`, `releasePointerCapture`, `scrollIntoView`, and define
  `window.PointerEvent = class extends MouseEvent {}` (jsdom lacks `PointerEvent`;
  `MouseEvent` carries the `button` field Radix checks).
- OPEN the menu with `fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })` — a
  plain `fireEvent.click` does NOT open it (Radix opens on pointerdown).
- SELECT a menu item with `fireEvent.click(item)` — Radix `MenuItem.onSelect` fires from
  the click handler.
- Items expose roles `menuitem` / `menuitemcheckbox` (with `aria-checked`); the container
  is `menu`. Disabled items have `aria-disabled="true"` and/or `data-disabled`.

Working example: `src/features/instance/databases/components/PickColumnsDropdown.test.tsx`.

## An always-rendered modal keeps its state; only its _contents_ unmount

Several modals are rendered unconditionally and toggled with `open` (e.g. `EditTableRowModal`
in `DatabaseTableView`). Radix's `DialogContent` is not force-mounted, so closing the dialog
unmounts everything inside it — inputs, editors, their DOM — while the modal **component's own
`useState` survives**, because that component never unmounted.

The two halves then disagree: the re-mounted contents render from props (fresh), and the
surviving state still describes the session the user abandoned. In #1600 that combination
disabled `Save Changes` forever — a `isValidJSON=false` from a malformed draft outlived the
editor that held it, so re-opening the row showed valid JSON above a dead button.

Reach for whichever fits:

- Reset the state when the modal **opens**, not only when its data changes. Tracking the
  data snapshot as `null` while closed gets both in one comparison (see
  `EditTableRowModal`'s render-time reset).
- Or give the modal a `key` that changes per target and render it only while open, which
  unmounts the component with the dialog (`AddTableRowModal` in `DatabaseActionModals`).

Related `@monaco-editor/react` behaviour, which is what makes this invisible rather than
merely wrong: it applies a changed `value` prop through `executeEdits` behind an internal
`preventTriggerChangeEvent` flag, so **programmatic value updates do not fire `onChange`**.
An editor re-mounted (or re-valued) from props therefore never tells the component that the
buffer it is validating has been replaced.

## Live central-manager data — WebSocket works, the load balancer never flushes SSE

Concretely, "the edge" in front of central-manager is a **Linode NodeBalancer**:
`stage.studio.harperfabric.com` is a CNAME to `studio.harperfabricnlfstage.akadns.net` — Akamai
**GTM**, which only steers DNS and never touches the bytes — and that resolves to `172.232.30.8`
(`172-232-30-8.ip.linodeusercontent.com`). The NodeBalancer is the only proxy in the data path, so
it's the layer to suspect when a long-lived response never arrives.

Harper serves every table for subscription over SSE _and_ WebSocket, but through that path a
`GET /SystemStatus/` carrying `Accept: text/event-stream` produces **no response at all** — 0 bytes
and not even a status line after 75s (`time_starttransfer` never leaves 0), so an `EventSource` never
fires an event and the feature looks broken with nothing in the console. Chunked encoding isn't the
problem: the same URL without that header returns `Transfer-Encoding: chunked` normally. What breaks
is a response that stays _open_, which the proxy holds waiting for an end it never gets. The
WebSocket upgrade to `wss://<cm-host>/<Table>` passes straight through — **HTTP 101 immediately** —
to Harper's table subscription and delivers deltas normally. (Re-verified against stage, Jul 2026.
Probing from outside can't separate a NodeBalancer buffer from a stall in Harper's own SSE handler;
that needs origin-side access. The proxy is the better first suspect only because a socket to the
same host streams fine.)

So reach for `WebSocket`, not `EventSource`, for any live central-manager data. Public-read tables
upgrade **anonymously**, which is what lets a global notice render for signed-out users. Reference
implementation: `src/features/notifications/NotificationsSubscriptionManager.tsx`, whose file comment
carries the reconnect/backoff reasoning. Copy its slow poll backstop too — that lives on the query
rather than the component (`refetchInterval: 60_000` in `src/features/notifications/queries.ts`) —
because an edge that accepts-then-drops the upgrade otherwise leaves the tab with no data path at
all.

## Browse — relationship/computed attributes vary by Harper version

`@relationship` and `@computed` attributes are read-only: Harper rejects any insert/update
whose record merely CONTAINS the key ("Computed property X may not be directly assigned a
value", even for `null`). Strip them from record-editor JSON (see
`functions/relationshipAttributes.ts`).

What `describe_table` reports differs by server version (verified empirically, Jul 2026):

- **Harper 4.7**: relationship attrs ARE listed — to-one as `{attribute, type: '<RelatedTable>',
  properties: [...]}`, to-many as `{type: 'array', elements: '<RelatedTable>'}` — but there is
  NO explicit relationship flag: the only signal is that `type`/`elements` names a sibling
  table. `@computed` attrs are omitted.
- **Harper 5.1**: relationship attrs are omitted from describe entirely; `@computed` attrs appear
  only with `include_computed: true`, and carry `computed: true`.

The 5.1 omission is an **unintentional regression**, not a deliberate change (traced in the Harper
source, Jul 2026). describe's `pushAtt` never filtered relationships and hasn't changed; what
changed is the v5.0 "big lift" rewrite made describe read `table.attributes` rebuilt from the
persisted attribute registry (`attributesDbi`), and relationships are runtime-only — `table()`'s
persistence loop `continue`s past them so they're never written to the registry (same in 4.7, but
4.7's describe read the schema-applied in-memory list that still held them). Harper commit
`3017e097c` (RE-7 / #1183) treats this as a bug but only partially fixes it, and there is NO
`include_relationships`-style flag to re-surface them.

Because of that, browse ALSO reads relationships from the component `schema.graphql` files
(`functions/schemaRelationships.ts` → `get_components` + `get_component_file`, parsed with the
applications schema parser). This is the ONLY source on 5.1, and it's authoritative for the exact
`@relationship(from:/to:)` key mappings even on 4.7. A schema-only relationship (not in describe)
renders as a synthesized column: to-one reads the stored foreign key (`from:`) directly from the
row; to-many links to the related table filtered by the reverse key (`to:`). `getRelationshipInfoMap`
merges the describe-detected and schema-declared sources.

Search wire contract (works on 4.7; describe-resolvable there, FK-based on 5.1): `get_attributes`
accepts nested selects `{name, select: [...]}` to resolve relationships, but a LEADING `'*'` makes
the server return raw records and ignore the rest of the list — relationship selects must come
before the `'*'`. `search_by_conditions` accepts `search_attribute: ['rel', 'subProp']` as a join
into the related table; when the sub-property IS the related primary key AND we know the local
foreign key, we query the FK directly instead (indexed, and works on 5.1's ops API which can't
execute relationship joins).

## Role `permission.operations` — the semantics are not what the shape suggests

Harper 5.0+ roles accept an `operations` allowlist. Almost every intuitive reading of it is wrong,
and each of these cost a review round on #1628 — verify against the Harper source before changing
`src/features/instance/config/roles/operations/**` or `src/integrations/api/localRolePermission.ts`.

- **It does not restrict super users.** `verifyPerms` returns early for `super_user`
  ("admins can do (almost) anything") _before_ the allowlist gate. The allowlist is a way to scope
  a NON-super role (gate 2 then lets it hold otherwise-SU operations), not a way to narrow an admin.
- **`super_user`/`cluster_user` + `operations` cannot even be saved.** `validateNoSUPerms` rejects
  any permission with more than one key that sets either flag, so the combination 400s. Strip the
  allowlist for those roles rather than sending it.
- **`structure_user` is different and IS gated** — only `create_table`/`create_attribute`/
  `drop_table`/`drop_attribute` (plus create/drop database for the boolean form) short-circuit. The
  array form scopes that carve-out to its listed databases and never reaches create/drop database.
- **~23 operations are inert when granted.** Their `requiredPermissions` entry omits `api_name`, so
  the gate compares a camelCase handler name against a snake_case grant and never matches
  (`deploy_component`, `get_status`, `registration_info`, …). Filed as HarperFast/harper#2175.
  `sql` is worse: it routes to `verifyPermsAST`, which never consults the allowlist at all.
- **Alias spellings are inert too** (`describe_database`, `search_by_id`, `create_schema`, …): both
  spellings dispatch to one handler whose entry carries only the canonical `api_name`.
- **A non-iterable value takes the instance down.** `listUsers` expands every assigned role's
  allowlist behind a truthiness-only guard, so a record/`true`/number reaches `expandOperationsPerms`
  and its `for…of` throws — rejecting the user-cache load and failing authentication for EVERY user.
  A bare string or an array with non-strings iterates fine (a string per character), so those are
  invalid but not fatal. Reachable via a v4 upgrade of a role granting a database named `operations`.
  Filed as HarperFast/harper#2194.
- **A database named `operations` breaks allowlists instance-wide.** `translateRolePermissions`
  loops the instance schema, so `perms.operations.tables[t]` runs against the allowlist array and
  throws for any role carrying one.

Practical consequence for the UI: never describe a restriction the server does not enforce, and
never advise "fixing" an `operations` value in place — both mistakes shipped and were caught in
review. `classifyOperationsValue` needs the instance version because the same shape means different
things on either side of the 5.0.0-alpha.8 floor (the feature's first tagged build, not 5.0.0).
