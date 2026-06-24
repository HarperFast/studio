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
