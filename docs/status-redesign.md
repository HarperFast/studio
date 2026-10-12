# Status Tab — Analytics Architecture

The instance Status tab is a spec-driven analytics dashboard built on top of Harper's `get_analytics` operation. This doc covers the shipped architecture; consult the linked source files for current code.

## Tabs

`Health → Traffic → Requests → Database → Replication → Storage → Overview → Jobs` (Health is the default landing tab).

Tab + time-range state is mirrored to `?tab=&range=&refresh=` so URLs are shareable. Below `md` the tab strip collapses to a `Select`. The time-range picker is a sticky sub-toolbar inside each chart tab (hidden on Overview and Jobs, which has its own toolbar).

## Data Path

All analytics data flows through one query:

- **Transport:** `instanceClient.post('/', { operation: 'get_analytics', metric, start_time, end_time, conditions?, bucket_ms? })`. **No SQL, no new endpoints.**
- **Query options:** `getRawAnalyticsQueryOptions` in `src/integrations/api/instance/status/getAnalytics.ts`. Query key is instance-scoped: `[ANALYTICS_QUERY_KEY_PREFIX, instanceId, metric, startTime, endTime, bucketMs, conditions]`.
- **Adapter:** `useAnalyticsRecords` in `src/features/instance/status/analytics/hooks/`. Passes rows through verbatim (each spec's `timestamp:` field decides which column drives the x-axis), surfaces a `missingFields` schema-drift signal, and applies per-spec startup jitter so concurrent specs don't refire in lockstep.
- **Capability probe:** `useAnalyticsCapability` runs one cheap probe per instance on mount. While loading, the Status tab shows an inline message; on error, it surfaces an "analytics unavailable" message (no legacy fallback).
- **Cap:** server responses larger than 50 000 rows are tail-truncated client-side with a console warning.

## Jobs tab

Jobs lists Harper's background jobs (CSV/S3 loads, exports, bulk deletes, backups) from `search_jobs_by_start_date` — `src/features/instance/status/jobs/` plus `src/integrations/api/instance/status/searchJobs.ts`. It reads no `get_analytics`, so like Overview it sits in `ANALYTICS_FREE_TABS` in `StatusTabs.tsx`: the capability probe neither gates its body nor redirects a `?tab=jobs` deep link.

- **Its own poll, not the window tick.** The analytics tick bakes `[start, end]` into every key; Jobs keys on the window _width_ and computes the bounds in the query function, polling with `pollUnlessForbidden(refresh)` so a 403 stops the timer. It shares the `range`/`refresh` search params and their option lists, but not `TimeRangePicker`, whose resolution sub-label and freshness stamp describe analytics queries only. The StatusTabs tick keeps running on Jobs on purpose: stopping it would leave the charts on a stale window when the user switches back.
- **Unbounded by the server.** The operation takes no limit or cursor, so every poll fetches the whole window. Jobs therefore offers windows up to 7 days (a `range=30d` link reads as 7 days there), and renders at most `MAX_RENDERED_JOBS` of the newest rows, saying how many it held back.
- **Per node.** `hdb_job` is a non-replicating system table (harper `resources/databases.ts`), so a cluster route lists the jobs of whichever node its request reached, and says so.
- **Super user only, by the role catalog's rule.** The operation is `requires_su`; `canListJobs` honours an allowlist grant only where the role editor's `gateVerdict` says a listing grants it for the instance's version band (5.3.0-beta.3 on), so the tab and the role editor never disagree. The version comes from the `registration_info` the instance route already loaded; if a refetch of it fails, a listed grant is tried rather than refused, and a 403 shows the same explanation.

The import modal's CSV progress toast uses the same job records: `waitForJob` reports each poll through `onUpdate`, and the toast is settled from `useImportDataMutation`'s own callbacks, which still run after the modal unmounts. Harper writes nothing to a job between starting and finishing it, so the toast shows state and elapsed time, never a percentage.

## Pipeline + Primitives

Ported from the analytics-viz project. Key directories under `src/features/instance/status/analytics/`:

- `pipeline/` — declarative `MetricSpec` definitions per metric (`cpu-usage`, `bytes-sent`, `replication-latency`, `connections`, …) plus the runner (`pipeline.ts`) that buckets records by `(dimension, time, node)`, applies temporal/cross-node aggregators, and emits `SeriesData`. Derived metrics (`error-rate`, `request-rate`, `transaction-log-growth`, `mqtt-traffic-*`) live in `pipeline/derived/`.
- `primitives/` — Recharts wrappers (`LineChart`, `StackedAreaChart`, `SmallMultiples`, `HeatmapMatrix`, `DimensionChipRow`, `DimensionCombobox`) plus the dispatcher `MetricRenderer`. Tooltip surfaces use the shared `tooltipStyle.ts` so every chart matches Studio's `--popover` surface.
- `tabs/` — one file per tab. Most cards go through `MetricPanel`, which wraps `MetricRenderer` in a `<PanelErrorBoundary>` so a single broken spec can't tank the whole tab. Storage and Connections use bespoke panels.

## Styling

Studio's `--background` is brand-purple, so chart-surface tokens (`--chart-bg`, `--chart-grid`, `--chart-axis`, `--chart-tooltip-bg`, `--chart-tooltip-fg`) resolve against `--card` instead, and chart tooltips share the `--popover` surface used by Studio's `HoverCard` / `Tooltip`. The ported analytics-viz primitives reference semantic aliases (`--color-text-secondary`, `--color-error`, `--color-warning`, …) which are mapped onto Studio tokens in the `@theme inline` block of `src/index.css`.

Series colors use analytics-viz's stable node/type palettes (`lib/nodeColors.ts`, `lib/colorAllocators/`), keyed so a node keeps the same hue across tabs.

## Reliability + Performance

- **Error isolation:** every panel is wrapped in `PanelErrorBoundary` with a `resetKey` keyed to the time-range stamp, so changing the window automatically retries panels that errored on stale data.
- **Refetch discipline:** `staleTime = refreshInterval`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `placeholderData: keepPreviousData`. Concurrent specs in one tab are jittered by 0–500 ms.
- **Aggregator safety:** `Math.max/min` on per-bucket samples uses a reducer instead of argument spread (the spread form `RangeError`s past ~125 k values on V8).
- **PNG export:** `lib/chartExport.ts` captures only the chart body (not the title-bar action buttons) via `html-to-image`; backgrounds are resolved by walking up the DOM so dark-mode panels export as dark, not white.

## Testing

- Ported pipeline tests live in `__tests__/pipeline/` (per-spec correctness, time bucketing, transforms, confidence gating).
- Adapter tests cover schema-drift detection, missing-field empty states, instance-scoped cache keys, and conditions-in-key.
- Per-tab RTL smoke tests in `__tests__/tabs/` mount each tab against fixture data and assert no thrown errors plus at least one `<svg>` per spec.

## Out of Scope

- Server-side Harper changes
- New transports or SQL
- Playwright E2E (follow-up)
