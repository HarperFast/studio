# Status Tab Redesign — Port analytics-viz Visualizations into Studio

## Context

Studio's instance Status page today shows a single Recharts line chart (one metric at a time) plus a small text tree dump of `system_information` / `get_status`. The sibling project `/home/berns/code/analytics-viz` has a richer dashboard with 6 functional tabs and a declarative metric-spec pipeline driving multiple chart primitives (line, stacked area, small multiples, heatmap, table-size snapshot/trend).

We are replacing Status's contents with a port of analytics-viz's **visualizations and spec system**, while keeping:

- Studio's data path (`get_analytics` operation via `instanceClient` + React Query) — **no SQL, ever**
- Studio's styling stack (Tailwind 4, Radix UI, design tokens, `next-themes`)
- Studio's tab pattern (Radix `@radix-ui/react-tabs`)

This plan was reviewed by four personas (UI/UX, Data, SRE, QA). Their P0/P1 findings are incorporated below.

## Hard Constraints

1. **Never use SQL.** All data flows through the `get_analytics` operation. No `search_by_value`, no `sql`, no `table-query`. If a spec from analytics-viz cannot be served via `get_analytics`, drop it.
2. **No new transports / endpoints.** Re-use `instanceClient.post('/', { operation: ... })`.
3. **No server-side Harper changes** in this work.

## Tab Structure (revised)

In order: **Health → Traffic → Requests → Database → Replication → Storage → Overview**.

Rationale: operators land here for triage; Health first matches that intent. Overview moves to the end (system-info dump is reference data, not a triage surface). If the 7-tab strip wraps studio's chrome at common viewports, fold Storage into Database as the fallback ("Data" tab), TBD during implementation.

Default landing tab on first visit: **Health**.

URL search-param state: `?tab=&range=&node=` synced via TanStack Router so links are shareable.

## Data Path (reworked — was P0 in review)

### Adapter principles

The adapter does **not** rename `id` → `time`. It passes Harper's `get_analytics` rows through verbatim and lets each spec's `timestamp:` field (`'time' | 'id' | 'time-or-id'`) decide which column drives the x-axis. This matches analytics-viz's existing pipeline contract (`pipeline.ts:85-100`).

```ts
useAnalyticsRecords(metricName, conditions?) → {
  data: AnalyticsDataPoint[]    // rows passed through with all original keys
  isLoading, isError, isEmpty
  fieldKeys: Set<string>        // union of keys observed (for schema-drift detection)
}
```

### Schema-drift detection (was P0)

For each metric, the adapter records the union of keys observed in the response and compares against the keys the spec needs (`field.field`, `confidence.field`, `series.dimension`, `bucket.source: 'period-field'` → `period`). When a required key is missing, the panel renders an explicit `<MissingFieldEmptyState fieldName=... />` instead of a blank chart. This kills the "low traffic vs missing field" ambiguity.

### Transport audit (was P0)

Every analytics-viz spec audited against `get_analytics`'s capability (single `metric`, optional `conditions: [{ attribute, value, comparator? }]`). All 22 specs are reachable:

| Spec                                           | Harper metric           | Conditions used            | Status                                                                                            |
| ---------------------------------------------- | ----------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| duration / success / transfer / response-200   | `request` (or per-spec) | `path=...` filter optional | ✅                                                                                                |
| db-read / db-write / db-message                | `db-*`                  | `table=...` (top-N+Other)  | ✅                                                                                                |
| bytes-sent / bytes-received                    | `bytes-*`               | groupBy `type`             | ✅                                                                                                |
| cpu-usage                                      | `cpu-usage`             | groupBy `type`             | ✅                                                                                                |
| utilization / main-thread-utilization          | `utilization` etc.      | none                       | ✅                                                                                                |
| memory / connection / connections / tls-reused | as-named                | none                       | ✅                                                                                                |
| resource-usage                                 | `resource-usage`        | none                       | ✅                                                                                                |
| replication-latency                            | `replication-latency`   | none — pivot in pipeline   | ✅ (verify field set on real instance)                                                            |
| database-size / storage-volume                 | `database-size` etc.    | groupBy `database`         | ✅                                                                                                |
| **table-size** (snapshot+trend)                | `table-size`            | groupBy `table`            | ✅ confirmed (analytics-viz fetches via the same `metric: 'table-size'` pattern; no SQL required) |

If a real-instance check shows `replication-latency` needs richer conditions than the current `attribute/value` shape supports, the spec is held back to a follow-up — we do **not** add SQL.

### Request budget & React Query config (was P0)

- `staleTime: refreshInterval` — prevents window-focus refetch storms
- `refetchOnWindowFocus: false`, `refetchOnReconnect: false`
- Per-spec startup jitter `0–500 ms` so a tab's 5–7 specs don't fire in lockstep
- `queryKey` **prefixed with `instanceParams.instanceId`** (was P1 — fixes cross-instance cache leakage)
- Pause refetch when `document.visibilityState !== 'visible'`
- Debounce time-range commits ≥ 500 ms before invalidating queries
- `placeholderData: keepPreviousData` so charts don't flash on auto-refresh

### Bucket-by-window clamps (was P0)

The time-range picker enforces a server-side bucket per window to prevent payload blow-up:

| Window | Max bucket density |
| ------ | ------------------ |
| 1h     | 1m                 |
| 6h     | 1m                 |
| 24h    | 5m                 |
| 7d     | 15m                |
| 30d    | 1h                 |

Bucket is conveyed to Harper if the operation supports it, and otherwise enforced client-side by sub-sampling. Specs with high cardinality (table-split, path-split) get an additional row cap; if exceeded, the panel renders a "showing top-N, expand window's resolution" banner.

## Styling Translation (was P0/P1)

### Chart-surface tokens (new)

Studio's `--background` is brand-purple. Adding:

```css
--chart-bg:    var(--card);
--chart-grid:  hsl(var(--muted));
--chart-axis:  hsl(var(--muted-foreground));
--chart-tooltip-bg: hsl(var(--popover));
```

All charts render inside a `Card` so the surface they sit on is neutral. WCAG AA validated against `--card`, not `--background`.

### Series palette

Use **analytics-viz's `NODE_PALETTE`** (10 hue-spread colors, colorblind-friendly) for per-node series. `harperPalette` is reserved for chrome accents only (legend chips, status pills). Port `nodeColors.ts` and its tests verbatim — do not seed from `harperPalette`.

### Token mapping (mechanical)

- `bg-[var(--color-bg-primary)]` → `bg-card`
- `text-[var(--color-text-secondary)]` → `text-muted-foreground`
- `border-[var(--color-border)]` → `border-border`
- Buttons / selects → studio's existing Radix wrappers

## Reliability (was P1 reviewer findings)

- **Per-panel `<ErrorBoundary>`** so one thrown spec can't take a tab down. Fallback: "This panel is unavailable" + retry.
- **Capability probe**: on first Status mount per instance, fire one cheap `get_analytics` and cache `{ supportsAnalytics: bool, harperVersion }` per instance. If unsupported, fall back to legacy Monitoring view.
- **Feature flag / kill switch**: gate the entire redesign behind a flag (env var or per-instance setting). `?legacyStatus=1` query param keeps the old Monitoring view available for one release. Don't delete `Monitoring.tsx` until after one release cycle.
- **Default refresh interval**: 60s (was 15s in current Monitoring). Minimum selectable is 30s.
- **Client telemetry**: emit a structured warn-level log on `panel rendered with zero series` tagged `{ instanceId, harperVersion, specId, missingFields }`. Surfaces silent breakage without needing a customer to report it.

## UX Details (was P1 reviewer findings)

- **Time picker placement**: a sticky sub-toolbar inside each analytics tab, not above the tab strip. Hidden on Overview.
- **Refresh interval**: small icon-button menu next to the picker, not a peer control.
- **Loading / empty / error**: every primitive accepts `{ isLoading, isError, isEmpty, missingFields }` and renders a consistent skeleton / retry / empty / "field unavailable" state. No inconsistent ad-hoc spinners.
- **Click-to-solo legend affordance**: cursor change + tooltip "Click to isolate · ⌘-click to compare" + visible "Reset selection" pill when a filter is active. One-time popover hint on first visit.
- **Mobile**: tabs collapse to a Radix `Select` below `md`; small-multiples reflow to single column; heatmap becomes horizontally scrollable with sticky row labels. Hard floor: `<640px` is unsupported.

## Overview Tab — Restyled

Replace today's 96-px-wide indented text dump with:

- Top: a 4-column `Card` grid (host, version, uptime, listener ports, replication mode)
- Below: collapsible sections (Components, Replication peers, Storage volumes) using Radix `Accordion`
- "View raw JSON" toggle (`<details>`) so power users don't lose at-a-glance scanning
- Reuse `crawlData` for traversal if convenient; render with Tailwind/Card/`dl-dt-dd`

## Testing (was P0/P1 from QA review)

### Port the analytics-viz test suite alongside the source

Copy `analytics-viz/test/metricSpecs/*` into `studio/src/features/instance/status/analytics/__tests__/pipeline/` in the same PR. Same for `time.test.ts`, `nodeColors.test.ts`, `tableColors.test.ts`, `tableSize.test.ts`, `approxLabel.test.ts`, `runTransform.test.ts`. Wire into `vitest run`. CI gates on green.

### Adapter unit tests (new — only NEW logic on data path)

`useAnalyticsRecords.test.ts` covers: empty result, missing `node`, non-numeric `id`, absent/zero `period`, `time` vs `id` both present, duplicate `(time, node)` rows, unknown extra fields, error/loading propagation, `conditions` in query key, instance-scoped cache key isolation, schema-drift detection emits `missingFields`.

### Per-tab RTL smoke tests

One per analytics tab: mount with fixture data, assert (a) no thrown errors, (b) at least one `<svg>` per spec, (c) empty-state fallback renders when fixture is empty. Catches "spec needs missing field" failures the manual smoke pass would miss.

### Theming test

Assert `getChartColors('light')` and `getChartColors('dark')` differ on grid/axis/tooltip tokens.

### Fixtures

Record one realistic Harper response per metric from a live local Harper, commit to `__fixtures__/`. Document a refresh script. Synthetic-only fixtures will miss schema drift between Harper versions.

### E2E

Studio has no Playwright today. **Defer** E2E; file a follow-up issue to add one Playwright spec walking the 7 tabs once per-tab RTL smoke is in place.

### Acceptance criteria — concrete

Rewrite Verification with pass/fail-precise assertions, e.g. "Health tab renders ≥4 charts; each has ≥1 legend item per node returned by `system_information.replication.nodes`; clicking a legend item toggles its series visibility; every panel reachable via keyboard."

## Files

### New (under `src/features/instance/status/analytics/`)

```
analytics/
  StatusTabs.tsx                        # Radix tabs + URL search-param sync
  TabToolbar.tsx                        # time picker + refresh menu, sticky
  TimeRangePicker.tsx
  context/AnalyticsContext.tsx          # range, theme, nodes, view-mode
  hooks/
    useAnalyticsRecords.ts              # adapter (verbatim row passthrough + drift detect)
    useAnalyticsCapability.ts           # one-shot probe per instance
    useAnalyticsNodes.ts
  pipeline/                             # ported verbatim
    aggregators.ts approxLabel.ts confidence.ts fieldExpr.ts
    pathParser.ts pipeline.ts quantileFields.ts runTransform.ts
    transforms.ts index.ts (METRIC_SPECS) + per-spec files
  primitives/                           # ported verbatim
    LineChart.tsx LineChartWithNodeLegend.tsx
    StackedAreaChart.tsx StackedAreaTooltip.tsx
    SmallMultiples.tsx HeatmapMatrix.tsx
    DimensionSelectorRenderer.tsx MetricRenderer.tsx
    formatValue.ts NodeLegend.tsx
    states/ {Skeleton,EmptyState,ErrorState,MissingFieldEmptyState}.tsx
  charts/ TableSizeSnapshot.tsx TableSizeTrend.tsx
  lib/ nodeColors.ts tableColors.ts time.ts theme.ts
  tabs/
    HealthTab.tsx TrafficTab.tsx RequestsTab.tsx
    DatabaseTab.tsx ReplicationTab.tsx StorageTab.tsx
    OverviewTab.tsx
    tabConfig.ts
  __fixtures__/                         # recorded get_analytics responses
  __tests__/
    pipeline/                           # ported from analytics-viz
    useAnalyticsRecords.test.ts
    tabs/*.test.tsx                     # RTL per-tab smoke
```

### Modified

- `src/features/instance/status/index.tsx` — render `<StatusTabs />`. Pass `instanceParams` + `isLocalStudio`. Honor `?legacyStatus=1` query param to bypass redesign.
- `src/integrations/api/instance/status/getAnalytics.ts` — drop `Metric` interface; type response as `AnalyticsDataPoint[]`. Query key: `['get_analytics', instanceId, metric, startTime, endTime, bucket, conditions?]` (instance-scoped).

### Kept under feature flag for one release, then deleted

- `src/features/instance/status/components/Monitoring.tsx`
- `src/features/instance/status/components/monitoring/MetricVisualization.tsx`
- `src/features/instance/status/Status.tsx` + `crawlData.ts` (decide during implementation whether OverviewTab reuses `crawlData` for traversal)

## Verification

1. Type-check + lint pass.
2. Vitest green: ported pipeline tests + adapter tests + per-tab RTL smoke + theme-token test.
3. Dev server smoke against a local Harper: navigate every tab, verify the concrete assertions in the Acceptance Criteria section.
4. Cross-instance cache isolation: open two browser tabs to two different instances simultaneously; confirm queries do not collide (different cache keys).
5. Capability fallback: connect to a Harper instance with analytics disabled; confirm the legacy Monitoring view renders.
6. Window stress: select 30d on the Storage tab; verify the bucket clamp keeps payload + render under budget (no >500 ms render hitch in devtools, no >5 MB JSON).
7. Refresh-storm check: alt-tab away and back rapidly; verify staleTime + visibility-pause prevent a thundering herd in the Network tab.
8. Theme toggle: chart axes, tooltips, grid recolor cleanly; WCAG AA contrast verified against `--card`.
9. URL state: change tab + range, copy URL to a second browser, verify state restores.
10. Missing-field UX: point at an older Harper version (or a mocked fixture omitting `p95`); verify `<MissingFieldEmptyState>` renders, no blank charts.

## Out of Scope

- Server-side Harper changes
- New transports (no SQL, no new endpoints)
- PNG export
- Replacing studio's existing color tokens / design system
- Playwright E2E (follow-up issue)

## Lifecycle (per harper-engineering-guidelines)

Before code changes: branch off (worktree at `../studio-status-redesign`, branch `feat/status-analytics-port`), confirm clean tree. Persist this plan in the studio repo (`docs/status-redesign.md` + pointer in `DESIGN.md`) before implementation begins. PR description focuses on adapter correctness, transport audit, and reviewer fixes incorporated. Set up `/loop` PR-comment monitoring after pushing.
