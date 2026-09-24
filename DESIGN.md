# Studio Design Notes

This file collects architecture and design notes for studio that aren't otherwise discoverable from code or commit history. Future agents (and humans) should read this before making non-trivial changes.

## Active design documents

- [`src/features/organizations/DESIGN.md`](src/features/organizations/DESIGN.md) — shared organization target policy, switch destinations, and account-menu behavior.

- [`src/features/clusters/DESIGN.md`](src/features/clusters/DESIGN.md) — cluster list lifecycle classification, optional metadata and notification scope.

- [`src/features/instance/databases/DESIGN.md`](src/features/instance/databases/DESIGN.md) — when the browse grid may show its spinner, and why a table without a primary key can't be listed.

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

## Repo conventions worth knowing

- **Data path to a Harper instance**: always via `instanceClient.post('/', { operation: ... })`. Never SQL, never new endpoints, never a separate transport.
- **Styling stack**: Tailwind 4 + Radix UI + design tokens in `src/index.css`. `cn()` from `src/lib/cn` is the canonical class-merge helper.
- **Routing**: TanStack Router, file-based, lazy-loaded. Build a link to another org/cluster/instance
  with `buildAbsoluteLinkToPage`. A relative `../…` is only safe from a component that unmounts with
  its own route: TanStack resolves it against the _current_ location, so a row that outlives a pending
  navigation re-resolves its href one level too deep (HarperFast/studio#1710).
- **Data fetching**: TanStack React Query 5. Query keys must be instance-scoped when the request targets a specific instance.

- [`src/features/search/DESIGN.md`](src/features/search/DESIGN.md) — global search loading, shared-query ownership, session isolation, and shortcut behavior.
