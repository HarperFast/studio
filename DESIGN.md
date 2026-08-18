# Studio Design Notes

This file collects architecture and design notes for studio that aren't otherwise discoverable from code or commit history. Future agents (and humans) should read this before making non-trivial changes.

## Active design documents

- [`docs/status-redesign.md`](docs/status-redesign.md) — port of analytics-viz visualizations + spec system into the instance Status tab. Covers: 7-tab IA, the data-path adapter (no SQL — `get_analytics` only), bucket-by-window clamps, chart-surface CSS tokens, feature-flag rollback, testing strategy. Read before touching `src/features/instance/status/**`.

## Repo conventions worth knowing

- **Data path to a Harper instance**: always via `instanceClient.post('/', { operation: ... })`. Never SQL, never new endpoints, never a separate transport.
- **Styling stack**: Tailwind 4 + Radix UI + design tokens in `src/index.css`. `cn()` from `src/lib/cn` is the canonical class-merge helper.
- **Routing**: TanStack Router, file-based, lazy-loaded.
- **Data fetching**: TanStack React Query 5. Query keys must be instance-scoped when the request targets a specific instance.
- **Custom lint rules**: oxlint loads repo-local JS plugins from `tools/oxlint-plugins/`, registered in `.oxlintrc.json` under `jsPlugins`. They are written to the ESLint v9 rule API, so they also run under ESLint unchanged, and they are tested by driving the real oxlint binary rather than calling `create()` directly. `comment-budget` is the worked example — see AGENTS.md for what it enforces and why.
