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

## Deploys — two composite actions, and `shell: bash` is not the shell the workflows had

`deploy-dev/stage/prod.yaml` own only what differs per environment; the job body lives in two
composite actions. **The split is a security boundary, not a refactor** — do not reunify them:
`studio-verify` installs, tests and lints and takes **no credentials**; `studio-deploy` holds
every credentialed step. That keeps deploy secrets out of the merge-queue path — **not** out of
reach of unmerged code generally: a same-repo `pull_request` also runs the workflow definition
from the PR's own ref with repository secrets available, so anyone who can push a branch can
already read any secret a workflow references. Scoping the credentials is the fix for that, and
it is tracked on studio#1651.

**No deploy workflow may accept `merge_group`.** That event runs the candidate PR's own workflow
and action YAML, so it can request `contents: write` or edit the actions outright — a boundary
inside candidate-controlled YAML is not a boundary. `src/lib/workflowPrivilege.test.ts` asserts
it for any workflow that writes contents or receives deploy credentials, because `actionlint`
never evaluates the event set against job permissions.

The queue **is** in use on `stage`, and `verify-stage.yaml` is its credential-free check — that
separation is the point, so never move a deploy step into it. `Verify Stage` is the check name
the queue must require; whether it already does is a repo setting, not something this repo
records (studio#1649).

Every workflow declares `permissions:` explicitly. The repo default is **write**, so omitting the
block hands a job a write-capable token it almost never needs.

They are **composite actions, not a reusable workflow**. Composite steps run inside the caller's
job, so job names stay `Deploy to Dev/Stage/Prod` rather than becoming `<caller> / <called>`.
This is about keeping check names stable and the run graph flat. **Do not reason about which
checks are required from the API alone** — `branches/stage/protection` and `rules/branches/stage`
both read as empty here while the queue demonstrably gates on checks, so a partial read will
tell you the opposite of the truth. Ask, or look at the settings UI.

Moving a step in there changes its shell. A composite `run` step **must** declare `shell:`, and
`shell: bash` runs as `bash --noprofile --norc -eo pipefail`, where a workflow's default is a
plain `bash -e`. **`-o pipefail` is the trap**: any `cmd | grep …` that legitimately finds
nothing now fails the whole step, because grep exits 1. That is how the version-tag lookup
(`git tag --points-at HEAD | grep -E '^v?[0-9]+…'`) came to abort before reaching its own
no-tag fallback, which would have failed every dev deploy. Audit each pipeline you move, and
tolerate only the status you mean — `{ grep … || true; }`, never `|| true` on the whole
pipeline, which would also swallow a real `git` failure.

Which Harper major a CM runs is a deploy **input**, not a commit: `@fastify/static` majors track
fastify majors (v7 ↔ fastify 4 ↔ harperdb 4.x, v8 ↔ fastify 5 ↔ Harper 5.x) and pairing them
wrong fails _silently on the CM_ — `reply.sendFile` is never decorated and every asset 404s. See
`.github/deploying.md` for the pairing, both dispatch inputs, and how to retire the split.

## Builds — sourcemaps are per mode, and `localstudio` deliberately has none

`build.sourcemap` in `vite.config.ts` is a function (`sourcemapFor`), not a flag, because the
three kinds of build want three different things. Sourcemaps dominate this output — they were
71 MB of a 94 MB build — since each embeds `sourcesContent`, the full original text of every
module it covers.

| build                                | sourcemap  | why                                              |
| ------------------------------------ | ---------- | ------------------------------------------------ |
| `pnpm build:local` (`localstudio`)   | `false`    | ships inside Harper; nothing reads the maps      |
| `pnpm build --mode dev\|stage\|prod` | `'hidden'` | uploaded to Datadog, then stripped before deploy |
| bare `pnpm build`                    | `true`     | a developer inspecting a prod build locally      |

**How Studio ships inside Harper.** The `localstudio` mode is the UI bundled into the Harper
distribution. The **harper** repo drives that build from its own scripts, roughly
`VITE_STUDIO_VERSION="v$(jq -r '.version' ../package.json)" pnpm run build:local`, and packages
the resulting `web/` as-is. Nothing on that path uploads maps to Datadog or reads them, so
emitting them only inflates the published Harper package — which is why the omission is
configured **here** rather than by post-processing over in harper. Keep it that way: turning
`localstudio` sourcemaps back on silently adds ~71 MB to the Harper package with no consumer,
and no failing test will catch it.

**Deploy modes.** Datadog is the only consumer of the deploy maps, and it keeps its own copy, so
the workflows delete them after the upload and before `mv web deploy/` rather than replicating
~71 MB to every node for nothing. `'hidden'` is what makes that safe to do: it writes the maps
but omits the trailing `//# sourceMappingURL=` comment, which under `true` would dangle onto a
404 once the files are gone. `datadog-ci sourcemaps upload` pairs each `.js.map` with its bundle
by filename and never needs that comment (verified with `--dry-run`: 173/173 paired). The strip
step now lives once, in `.github/actions/studio-deploy`, so a new environment workflow inherits
it by calling that action rather than repeating it.

(The repo is public, so none of this is about keeping `sourcesContent` unreadable — it is purely
size containment.)

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

## A mocked hook whose value lands in a dependency array must keep a stable identity

If you `vi.mock` a hook and the code under test puts its return value in a `useEffect` dependency
array, returning a fresh object per call re-fires that effect on **every render** — and any
assertion counting effect side-effects then passes for the wrong reason. `vi.mock('@tanstack/
react-router', () => ({ useRouter: () => ({ ... }) }))` did exactly that to
[`datadog.test.tsx`](src/integrations/datadog/datadog.test.tsx): the test that claimed to prove
"one view per navigation" would have passed with `location.href` removed from the deps entirely.
The real `useRouter` returns a stable reference, so the mock was also lying about production.

Instantiate once in the factory and expose changing state through a getter:

```ts
vi.mock('@tanstack/react-router', () => {
	const router = {
		get state() {
			return { location: { href: routerState.href } };
		},
	};
	return { useRouter: () => router };
});
```

The general check, worth running on any effect-counting test: **re-render without changing
anything and assert nothing happened.** That assertion is what distinguishes "the effect re-ran
because its input changed" from "the effect re-runs constantly"; it fails immediately against an
unstable mock.

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

## Browse — removing an attribute needs `put`, and only on Harper 5.3+

`update` and `upsert` are both a **merge**. Both land on the same bridge path —
`dataLayer/harperBridge/ResourceBridge.ts` `updateRecords` → `upsertRecords`, which calls
`Table.patch` for an existing record — so an attribute left out of the payload keeps its stored
value, and `null` stores a null rather than dropping the key. That is why deleting a property in the
row editor silently did nothing (studio#1643).

The fix is Harper's **`put`** operation (create-or-replace, HarperFast/harper#2347, **5.3.0**): the
stored record becomes exactly what you send, so an omitted attribute is removed. It is the same
`Table.put` REST's `PUT /Table/id` performs, so one atomic write — the record is never absent,
`__createdtime__` survives, and subscribers see a single write rather than a delete followed by an
insert. Studio previously emulated this with delete-then-insert; don't go back to that.

Four things worth knowing before changing the record editor:

- **The target record's own concurrent writes are clobbered, deliberately.** The `put` sends the
  buffer captured when the modal opened, so it reverts any change another writer (an app resource, a
  replicated peer write) committed to an attribute this edit never touched. `search_by_id` has no
  `refetchInterval` and is invalidated only after a write, so the modal's stale-buffer guard never
  fires during the editing window. This is the accepted cost of replace-based removal until
  field-scoped `__unset__` (harper#2350) lands — note the asymmetry: a mixed batch is refused to
  protect _other_ records from exactly this, while the target record takes it silently.
- **Only removals take the `put` route, and only the records that made them.**
  `functions/removedRecordAttributes.ts` reports removals **per record**, not as one flat list. An
  edit that merely changes values stays an `update`; a pasted batch where only some records drop an
  attribute is refused outright. A replace is last-writer-wins over the whole record, so routing a
  co-edited record through `put` would clobber a concurrent writer's change to an attribute that
  record's edit never touched. Use `Object.hasOwn`, never `in`, to test presence — an attribute named
  `constructor`/`toString`/`valueOf` reads as present through the prototype chain and its removal
  silently takes the merge path.
- **`put` has its own authorization shape — do not assemble it from the per-action checks.**
  `checkTablePutPermission` (`hooks/checkSchemaTablePermission.ts`) is the only correct gate.
  `checkSchemaTablePermission(…, 'update')` ANDs in the **`update` operation allowlist**, which Harper
  does not require for `put`: it authorizes from the raw table insert+update flags plus a **`put`**
  allowlist entry, so a role with `operations: ['put']` and both flags is valid server-side and must
  not be blocked. And an **attribute-scoped role is denied outright**
  (`utility/operation_authorization.ts`, `PUT_WITH_ATTRIBUTE_PERMS`) — a replace removes every
  attribute the request omits, which the attribute check cannot police since it only sees what a
  request supplies. Those table flags stay `true` for such a role, so a gate built from them offers a
  save that 403s. Check both `attribute_permissions` (v5) and `attribute_restrictions` (translated
  v4). Only `super_user` short-circuits; `structure_user` covers DDL, not DML.
- **Version-gated, but an unreadable version does NOT block the save.** Harper denies
  `registration_info` to any role carrying an `operations` allowlist — it is in the gate-inert list in
  `config/roles/operations/operationsCatalog.ts` — which is exactly the shape of role
  `checkTablePutPermission` exists to accept. Blocking on an unread version therefore made the
  feature permanently unavailable for those roles, behind a "reload and try again" that never helps.
  Allowing it is safe because the fallback isn't silent: `put` is a distinct operation name, so a
  pre-5.3 instance rejects the request outright rather than merging and keeping the attribute. A
  version that IS readable and predates the operation still blocks, for the clearer message, and
  grants are checked first so a missing grant never reads as a version problem. Note
  `supportsPutOperation` refuses `5.3.0` prereleases while the role catalog floors `put` at the
  earliest one; the divergence is deliberate and explained at both sites.
- **The primary key can't be edited, and silence there is the same bug again.**
  `functions/primaryKeyMismatch.ts` refuses a save that lost a loaded record's key, or that names one
  the editor never loaded. Removing or changing it isn't a rename: `update` requires an existing
  record, so it skips the write and the modal reported success — #1643 all over again — and if
  something IS stored under the new key, `update` patches a record the user never opened. Key the
  check on the **loaded** records' keys, not on every edited record having one: a stored row with no
  value for the declared key is #1199, and flagging it refuses a whole batch over a row that was
  never addressable. Keyless records are still _counted_ — a surplus over what was loaded means the
  payload adds records, which `update` skips and `put` cannot address, so success would be a lie.
  Both failure modes are pinned by tests; the rule has been wrong in each direction once.
- **On a legacy open table the read projection lies, and `put` writes the lie back.** The
  operations-API attribute projection reports every _registered_ attribute, filling in `null` for one
  the record doesn't have — verified by inserting a record that never had it. `SELECT *` reflects
  real storage. Browse reads through `search_by_conditions`/`search_by_id` with `get_attributes`, so
  two things follow. On the read side, a removed attribute keeps rendering as an empty cell: storage
  is correct, the read lies. On the **write** side, those invented `null`s are in the editor buffer,
  so a `put` stores them as explicit nulls — turning "absent" into "null" for attributes the user
  never touched. Studio cannot fix that from the client: a projected `null` and a stored `null` are
  indistinguishable in the response, which is the same ambiguity that made #1643 confusing. The
  removal the user asked for still happens, and the record still reads the same; the difference is
  visible in `SELECT *`, storage size, and replication.
- **Only top-level attributes need any of this.** A patch replaces a nested object wholesale rather
  than merging into it (`resources/tracked.ts` `updateAndFreeze`), so deleting a property _inside_ an
  object already works through a plain `update`.

**Both** write paths check their answer, not just `put` — `update` skips a record it can't address
and names it in `skipped_hashes`, so the merge path had the same silent-success hole.

**But the update check lives at the call site, not in the writer.** `describeIncompleteUpdate`
returns a description; `updateTableRecords` stays a transport. That is deliberate: the writer is
shared with the chat agent tool
(`features/instance/applications/components/Chat/tools/updateTableRecords/execute.ts`), which needs
the response — `skipped_hashes` included — and its own `invalidateQueries` to still run on a
partially committed batch. Asserting inside the writer turned a 9-of-10 durable write into a reported
total failure _and_ skipped the invalidation, leaving the grid serving stale data for the 9 records
that did change. A rule about what a person is told does not belong in a shared writer.

It reads an _absent_ field as complete, since `update` runs against every version Studio manages back
to 4.7 and an unrecognized legacy response isn't evidence of failure — but a field that is _present
and not an array_ is incomplete: that responder does answer this operation, so an unreadable answer
can't be read as success. `put` follows the same shape — `describeIncompletePut`, interpreted at the same call site — for the
same reason: a throw skips the caller's invalidation, so a replace that landed but answered
unreadably would leave the grid and the open editor showing the attribute the user just removed.
Neither writer asserts; `integrations/api/instance/database/incompleteWrite.ts` holds the shared
shape.

One policy, in `onWriteSettled`, for both paths — every asymmetry between them so far came from
changing one and not the other, so they share the handler rather than mirroring it.

**Two invalidations, not one.** `refreshTable` keys on `[entityId, databaseName, tableName]`, which
does **not** reach the open record: `getSearchById` keys on
`[entityId, 'search_by_id', databaseName, tableName, ids]`, so `'search_by_id'` sits where that
prefix expects the database name and partial matching fails. Use `searchByIdInvalidationKey`, never a
hand-built key; the relationship is pinned by a test asserting it against the live query key, because
the original bug was exactly this mismatch — a landed removal left the row editor's cached record
showing the attribute again on reopen, the very symptom #1643 is about.

Refresh both unless the answer says plainly that nothing was written; in that one case refresh neither
and leave the editor open, since nothing is stale and the draft is what the user needs in order to act
on the message. Otherwise refresh and close.

`describeIncompletePut` treats anything short of `put_hashes` naming every record sent as incomplete,
including a missing or malformed list: `put` only ever goes to a 5.3+ instance and
`dataLayer/insert.ts` always sets the field, so a 200 without one didn't come from a healthy Harper
answering this operation. The `message` can't help — `insert.ts` builds it as `put N of N` from
`written_hashes.length` for both halves (`skipped` is always `[]` for put), so it can never report a
partial write.

`__unset__` — field-scoped removal that keeps merge semantics for everything else — is
HarperFast/harper#2350, not yet built. When it lands it is the better tool for "drop one field,
leave the rest alone", because it does not clobber concurrent writes the way a replace does.

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

### Which of those the UI gating turns on

The two facts that decide Studio's permission hooks (`src/hooks/checkOperationPermission.ts`):

- **Gate admin chrome on the allowlist and you hide UI that works.** Because super users never reach
  the gate, `useInstanceManagePermission` and `useInstanceBrowseManagePermission` are deliberately NOT
  gated. Note browse-manage is only half short-circuited: its DDL half is, but the application-editor
  operations behind it (`set_component_file`, `drop_component`, `deploy_component`, `set_env_value`,
  `restart_service`) are not in `STRUCTURE_USER_OPS`, so for a non-super role they do reach the gate —
  where an allowlist listing them _grants_ them via gate 2. Denying that half on the allowlist would
  therefore hide UI a scoped role can legitimately use.
- **`isElevatedRole` is the wrong question for a specific operation.** It answers "is the list
  unenforceable anywhere for this role", which is what the editor warns about. For DML,
  `structure_user` and `cluster_user` are still gated.

Also two different expansions are correct for two different questions, and sharing one silently broke
the second once: `expandEffectiveOperations` folds alias spellings together to describe a role's
effective reach (display); simulating the gate must expand verbatim and canonicalize only the
operation being checked, or a lone alias grant wrongly reads as working.

### Settling one of these empirically

Reading `verifyPerms` is not enough — the super-user and structure-user verdicts above were confirmed
by running it. In a Harper checkout, drop a throwaway spec in `unitTests/utility/`,
`require('#src/utility/operation_authorization')`, build a `hdb_user.role.permission` literal, and call
`verifyPerms(requestJson, handler.name)`: `null` means allowed, a `PermissionResponseObject` means
denied. `testUtils.preTestPrep()` + `testUtils.setGlobalSchema(...)` provide the schema globals, and
`rewire` reaches internals — `requiredPermissions` (to audit which names carry an `api_name`) and
`verifyPermsAST` (to show SQL skipping the gate). Run with `npx mocha unitTests/utility/<file>`, read
the verdicts, delete the file. Measured this way: `super_user` + `operations: []` still ALLOWS insert,
search, restart and get_configuration, while `super_user: false` + `operations: []` DENIES insert.

## Datadog RUM — `beforeSend` fails open, so nothing in it may throw

The SDK wraps our `beforeSend` in `catchUserErrors`: a throw is swallowed, the hook returns
`undefined`, and `shouldSend` drops the event only on an explicit `false` — and a **view** event
can't be dropped from `beforeSend` at all (`assembly.js` warns "Can't dismiss view events using
beforeSend!"). So a throw part-way through ships the event with only the mutations made so far.
For a hook whose job is redaction, that is the one failure mode that matters, and it is why
[`beforeSend.ts`](src/integrations/datadog/beforeSend.ts) type-checks every field it touches
instead of testing it for truthiness.

Same reason the URL redaction runs **before** `shouldKeepEvent` and the error-text redaction
**after** it. The filter attributes errors on the raw stack and raw `error.resource.url`, so those
can't be rewritten ahead of it — but it reads no URL field, and it can itself throw on a malformed
error field, which would ship the event with its URLs untouched.

`error.stack` is **not** the engine's stack string. The SDK parses it and re-serializes every stack
it records, so what reaches `beforeSend` is always this shape, whatever the engine produced — no V8
`at fn (url)` or Safari `fn@url` variants get through:

```
<Name>: <message>
  at <func>[(args)] @ <url>[:<line>[:<column>]]
```

(`toStackTraceString` in `@datadog/browser-core/cjs/tools/stackTrace/handlingStack.js`, reached from
`domain/error/error.js`.) Note the two-space indent and the space-padded `@` separator: the frame's
URL is reliably the trailing token, which is what lets
[`shouldKeepEvent`](src/integrations/datadog/shouldKeepEvent.ts) attribute a frame by parsing its
URL rather than substring-matching the whole line.

**Only the frames are normalized — the message is not**, and that distinction is load-bearing.
`formatErrorMessage` is just `` `${name}: ${message}` ``, so any newlines the thrower put in the
message land in `error.stack` ahead of the real frames. Monaco's DI errors do exactly this: their
message embeds a whole _V8-native_ stack, which looks like frames but is text:

```
Error: [createInstance] Fm depends on UNKNOWN service ICodeLensCache.
    at e._createInstance (https://fabric.harper.fast/assets/editor.api-OBQnf1nL.js:817:2045)
  at <anonymous>
```

The four-space parenthesised lines are the message; only the last, two-space `@`-separated line
is a frame the SDK emitted. Attribution therefore has to match the SDK's frame shape rather than
hunt for a URL anywhere on the line — otherwise those message lines read as first-party frames.
Roughly a third of Studio's RUM error volume is this family, so it is not an edge case.

Two traps when re-checking this after an SDK bump. The pnpm store can hold several `browser-core`
versions at once, so resolve the one `browser-rum` actually uses (`require.resolve` from the
`browser-rum` entry) instead of globbing `.pnpm` — a stale sibling copy reads as authoritative. And
a frame that fails to parse is treated as _unlocatable_ and silently skipped, not flagged, so a
regex anchored to end-of-line must tolerate a trailing carriage return from a CRLF stack; one stray
character otherwise disables attribution for the whole stack without any symptom.

Only fields on the SDK's modifiable-field allowlist can be mutated here. `view.name`, `view.url`,
`view.referrer`, `context`, `service` and `version` are shared by every event type; errors add
`error.message`, `error.stack`, `error.handling_stack`, `error.resource.url` and
`error.fingerprint`; resource events add `resource.url` (plus GraphQL/header/websocket fields).
Grep the installed bundle for `"view.referrer":"string"` to re-check after an SDK bump.

## Datadog RUM — exactly one `startView` per page load, or Core Web Vitals vanish

[`datadog.ts`](src/integrations/datadog/datadog.ts) sets `trackViewsManually: true`, and the SDK's
contract for that flag is narrower than it looks. It stays stopped until the **first** `startView`,
adopts that call's options as its single `initial_load` view, then turns every later call into a
`route_change` view (`preStartRum.ts` `tryStartRum`, `trackViews.ts` `startView`). Only an
`initial_load` view runs `trackInitialViewMetrics`, so it is the only view that can ever carry LCP
or FCP.

A second `startView` on boot therefore ends the one view that collects paint metrics. That is what
zeroed Studio's vitals for a month (#1570): `useDatadog` and `useOnRouteLoadTracker` both called
it, 0.3ms apart, and every `initial_load` event shipped with `dom_complete` but no `lcp` and no
`fcp`. Ownership of that first call now lives in `useOnRouteLoadTracker` alone — it mounts on the
root route (`rootRoute.ts`), so it runs on every cloud route.

Three traps when reading this from RUM data:

- Scope every query to `env:prod`. Until `isDeployedBuild` landed, a bare `vite build` reported
  into the same app with **no `env` tag at all**: its mode is `production`, so Vite reads nothing
  from `.github/deploy-public-env` and neither `DEV` nor `VITE_LOCAL_STUDIO` is set. On 2026-08-26
  that was 192 of 227 error events — 85%, all from one developer's `127.0.0.2:9926` — and it
  manufactured a 135-event "Monaco DI regression" that had zero production occurrences. An
  unscoped count is not a production count, and historical data from before that fix still
  contains this traffic.
- Telemetry is now gated on `VITE_TELEMETRY_ENABLED`, which **only the deploy action's build step
  sets** — deliberately not any file in `.github/deploy-public-env`, because those are read by a
  local `pnpm build --mode prod` too. So a hand-built deploy-mode bundle stays silent, and both the
  RUM and GTM branches are constant-folded out of it entirely (verified: no client token, no
  `gtm.js` URL in the emitted assets). If you ever need telemetry from a local build, set that flag
  explicitly and know you are writing into real `env:` data.
- `view.time_spent` on an `initial_load` view is measured from `clocksOrigin()` — page origin, not
  SDK start — so a ~1s `time_spent` does **not** mean the view was alive and observing for a
  second. It says nothing about the observation window.
- Never name a view from `window.location.pathname`. Studio uses hash routing, so that is
  permanently `/` — which is why all 880 `initial_load` views in one week were named `/` whatever
  route actually loaded, and why #1405's "`/` view regression" was really every deep-link entry
  conflated into one bucket.

A boot-time redirect does **not** cost you that first view, and the deciding factor is whether
`getAllConnections()` can answer synchronously. It synthesizes `{ user: null, isLoading: false }`
for `OverallAppSignIn` only when the `Studio:PotentiallyAuthenticated` localStorage record has no
entry for it; with an entry it returns the record untouched, so the key is simply **absent**.
`dashboardLayout.beforeLoad` guards on `auth && !auth.isLoading && !auth.user`, so those are two
different outcomes: a signed-out deep link redirects _during_ the router's initial load and the root
component never commits the deep-link location — one `startView`, named `/sign-in/` — while an
expired session short-circuits on the missing key, renders the deep link, and only redirects once
auth resolves and `AppRouted` calls `router.invalidate()`. Two views there, a network round trip
apart, the second a genuine navigation.

Verifying a change here needs a **visible** browser on a production build: a headless or background
tab reports `visibilityState: 'hidden'`, emits zero paint and LCP entries, and `trackFirstHidden`
discards them anyway — so vitals always read as absent, and a broken fix looks identical to a
working one.

## Never put an address or a credential in a URL

Studio uses **hash routing**, so a query param lives in the fragment: for
`https://fabric.harper.fast/#/sign-in?me=…`, `new URL(url).search` is **empty** and anything built
on `URLSearchParams` silently does nothing. Match the raw string.

The RUM SDK reads `view.url`/`view.referrer` from `window.location`, and every third-party pixel
we load reads the page URL too — so a param is not a private channel. As of 2026-08-18 the auth
screens' `?me=`/`?email=` form persistence and the `/config/users/<address>` route were putting
addresses there, and `?token=` on `/reset-password` was putting a live password-reset credential
there.

[`redactSensitiveParams`](src/integrations/datadog/redactSensitiveParams.ts) keeps both out of
Datadog — credential params by name, addresses by matching the address _token_ anywhere in the URL
(a param value ending at a delimiter cannot cover a path segment or an unencoded JSON value, and
picking a delimiter set trades one leak for another). It applies to URL fields only: `user@host.tld`
is also an scp-style git remote, and `redactErrorText` deliberately keeps the host of
`git@github.com:<redacted>` in free text, so error text gets `redactCredentialParams` instead.

None of that helps anywhere else. Every third-party pixel we load reads the page URL, so those
addresses also reach HubSpot, Meta, LinkedIn and GA — `beforeSend` cannot touch what they send.
Carry the value in router state or `sessionStorage`, and key routes by an opaque id.

## Tailwind — `--spacing(N)` in an arbitrary value is a function, not a variable

`h-[calc(100vh-(--spacing(32)))]` (used by the databases, log, and API-explorer sidebars) is valid
Tailwind v4: `--spacing(N)` is the framework's spacing **function**, compiled to
`calc(var(--spacing) * N)` = 8rem here. It is **not** `var(--spacing-32)` — the default theme defines
only the base `--spacing: 0.25rem`, so a `var(--spacing-32)` "fix" resolves to nothing and collapses
the `calc()` (the container height drops to `auto`). Multiple code-review models flag the function form
as invalid CSS and suggest the `var()` form; don't take the bait. Verify by measuring, not by reading:
the container computes to exactly `innerHeight − 128px` when the function resolved.

## Dropping `errorHandler` from an `onError` also drops the RUM report

The Datadog RUM SDK instruments `console.error` and reports each call as an error with
`error.source: "console"` — no `datadogLogs` init involved, and we have none. `errorHandler`
([`src/react-query/queryClient.ts`](src/react-query/queryClient.ts)) opens with `console.error(rawErr)`,
so a handled query/mutation rejection reaches RUM today purely as a side effect of showing its toast
— subject to [`shouldKeepEvent`](src/integrations/datadog/shouldKeepEvent.ts), which then drops
timeouts, 401s and third-party stacks in `beforeSend`. Reaching RUM is not the same as reaching
Error Tracking.

That matters when replacing a toast with inline form copy: drop the `errorHandler` call and the
failure silently stops being reported. The auth forms that render their own failure keep an explicit `console.error(error)` for exactly this
reason — **at mutation level, in the `useMutation({ onError })`, not in the caller's `mutate(…, {
onError })` callback**. React Query skips the latter when the component unmounted mid-flight, which
is precisely when someone gave up on a slow sign-in and navigated away. Exclude control flow from it —
`SignIn` skips the unverified-email rejection there, because `submitForm` redirects into the
verification flow on it and reporting it would file every unverified sign-in.

A related trap when reasoning about these forms: **a minimal `useForm` probe does not reproduce them.**
react-hook-form clears a `root` error on a resolver-rejected resubmit in isolation, but `SignUp` and
`ForgotPassword` demonstrably do not (#1677), and `handleSubmit(fn, () => clearErrors('root'))` does
not change that. Reproduce against the real component, and assert the request count so a "stale"
alert cannot actually be a second identical rejection. (`ForgotPassword` keeps
its report in the caller because it reports conditionally: its CAPTCHA branch is deliberately silent
per #1658, and its non-retryable branch routes through `errorHandler`. The consequence, unchanged by
#1676, is that a forgot-password failure is reported only if the form is still mounted when it
settles.)
The inverse trap is real too — a `.catch()` written to _reduce_ RUM noise must not `console.error`,
which is what #1658 was. `console.debug` is not collected, and is the channel for a swallowed
failure you still want in devtools.

## A 5xx body never reaches an auth form

`describeError` renders whatever the server sent, and before #1676 that reached the sign-in and
sign-up forms as a toast. Those pages are anonymous and the inline alert this PR added _persists_,
so [`describeAuthFailure`](src/features/auth/describeAuthFailure.ts) substitutes our own copy for
every 5xx (and 429) rather than deferring: a 5xx body is our infrastructure talking — Harper's
"exceeded request queue limit for resolving cache record", or an upstream
`connect ECONNREFUSED 10.0.3.x:9925` — none of it actionable by a signed-out visitor, and some of it
our topology. 4xx still defers, because that is where an authored, actionable reason lives.

Which 5xx copy is shown turns on whether the request could already have been
processed, not on
[`curryRetryGatewayErrors`](src/integrations/api/retryGatewayErrors.ts)'s retry list — that
interceptor is installed on instance clients only
([`getInstanceClient.ts`](src/config/getInstanceClient.ts)), never on `apiClient`, so nothing
auto-retries an auth call and the retry the copy invites is the user's own. **Only 503 promises a
plain retry**, because a declining server very likely never processed the request. **502, 504 and
any timeout get a third message** instead: all three auth submits are non-idempotent POSTs, and each
of those means the request had already been handed upstream, so the write's outcome is unknown and
"try again" turns a completed sign-up into a 409 with the verification mail already sent (#1668).
That copy says to reload before retrying.
Everything else 5xx gets copy that does not promise waiting helps, plus a way to escalate — and
`SubmitErrorMessage` decides that from the message itself rather than from a prop each caller must
remember, which is what kept two of three forms from shipping without it.

Do not "improve" this by rendering the server's 5xx sentence when it looks presentable. Two earlier
passes tried gating on whether the body held a usable sentence (truthiness, then a length and
leading-character heuristic); both leaked, and both duplicated `describeError`'s extraction where it
could drift. Gate on **status**, which cannot.

Worth knowing for the telemetry half: with no body `describeError` falls back to `errorText(err.message)`,
so the pre-#1676 user saw the bare `Request failed with status code 503`. `"We had some trouble!"` is
the next fallback down and needs `message` absent too, which real AxiosErrors never are — it shows up
only in tests whose fixture omits it, so don't read a test expectation as production behavior here.
