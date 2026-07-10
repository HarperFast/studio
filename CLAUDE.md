# studio — engineering notes for Claude

Hard-won, project-specific gotchas. Skim the relevant section before touching related
code — each of these has cost a debugging session.

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

## Routing — `@tanstack/router-core` is patched (preload eviction `_nonReactive` TypeError)

`patches/@tanstack__router-core@1.171.14.patch` (wired via `patchedDependencies` in
`pnpm-workspace.yaml`) ports the fix from TanStack/router PR #7003 for upstream issue
#7759 / studio #1387: when a hover-intent preload's cached match is evicted mid-flight
(user navigates, `router.invalidate()`, cache GC), `load-matches.js` re-read the match
after an `await` and threw `TypeError: Cannot read properties of undefined (reading
'_nonReactive')`, which `preloadRoute` then `console.error`'d — polluting Datadog RUM on
every hover-then-navigate race. The patch turns the eviction into a quiet cancellation
(resolves the evicted match's controlled promises, aborts it, and `preloadRoute` returns
undefined). Regression tests: `src/router/__tests__/preloadEvictionRepro.test.ts` — they
fail on the unpatched package.

On the next `@tanstack/react-router`/`router-core` bump the patch will stop applying
(pnpm errors on the version mismatch — do not just delete it). Check whether upstream
shipped #7003/#7006 first; if not, re-create the patch against the new version and keep
the regression tests green.

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
