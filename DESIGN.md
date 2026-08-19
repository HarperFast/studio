# Studio Design Notes

This file collects architecture and design notes for studio that aren't otherwise discoverable from code or commit history. Future agents (and humans) should read this before making non-trivial changes.

## Active design documents

- [`docs/status-redesign.md`](docs/status-redesign.md) — port of analytics-viz visualizations + spec system into the instance Status tab. Covers: 7-tab IA, the data-path adapter (no SQL — `get_analytics` only), bucket-by-window clamps, chart-surface CSS tokens, feature-flag rollback, testing strategy. Read before touching `src/features/instance/status/**`.

## API explorer (the instance/cluster "APIs" tab)

The `/apis` route is a **custom, in-house API explorer** ([`src/features/instance/apis/explorer/`](src/features/instance/apis/explorer/)) — it replaced the previous `swagger-ui-react` embed. Read before touching `src/features/instance/apis/**`.

- **Spec source**: the target instance's own OpenAPI doc, fetched at runtime from `GET /api/openapi/rest` ([`getOpenAPI.ts`](src/integrations/api/instance/status/getOpenAPI.ts)). It's Harper-generated OpenAPI 3.0 — untagged, no `summary`/`operationId` — so the sidebar groups by **path/resource** (first segment → path → method), not by tag. Parsing/rendering treat every spec field as optional.
- **Pure logic vs. UI**: `spec.ts` (flatten/group/`$ref`-resolve/example-gen) and `request.ts` (URL/headers/body/auth + `fetch` execution + the code snippet) are pure and unit-tested; the components render them. Prefer extending the tested modules over adding logic in components.
- **Server URL is a selector, not a guess.** `useEntityRestURL()` derives the REST base by stripping `:9925` off the operations URL, which lands on the wrong port for instances that serve REST elsewhere (a local dev instance serves REST on `:9926`, not port 80). The explorer therefore offers **both** the Studio-computed URL and the spec-declared `servers[]`, defaulting to the computed one. Do not go back to overwriting `spec.servers[0].url`.
- **Try-it-out is credentialed cross-origin `fetch`** (`credentials: 'include'`), the same model Swagger used — which is why the **CORS warning + one-click enable** flow in [`APIDocs.tsx`](src/features/instance/apis/APIDocs.tsx) matters and must be preserved. Auth offers Cookie (session, default) / Basic / Bearer; Basic/Bearer add an `Authorization` header.
- **Persistence**: the server + auth selections persist to `localStorage` under `LocalStorageKeys.ApiExplorerSettings`, **keyed by entity id**, so a credential set for one instance never applies to another.

## Repo conventions worth knowing

- **Data path to a Harper instance**: always via `instanceClient.post('/', { operation: ... })`. Never SQL, never new endpoints, never a separate transport.
- **Styling stack**: Tailwind 4 + Radix UI + design tokens in `src/index.css`. `cn()` from `src/lib/cn` is the canonical class-merge helper.
- **Routing**: TanStack Router, file-based, lazy-loaded.
- **Data fetching**: TanStack React Query 5. Query keys must be instance-scoped when the request targets a specific instance.
