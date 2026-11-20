# Logs

- `index.tsx` → `Logs` scopes the view to the entity and validated link; `LogsExplorer` owns filters, expanded entries, live following, and existing log-link targets.
- `LogsDataTable.tsx` → controlled expansion and compact occurrence identities, column visibility and resizing, timestamp order.
- `components/LogDetails.tsx` → selectable full message and metadata.
- `components/DownloadLogsMenu.tsx`, `lib/exportLogs.ts` → existing Text/JSON exports for the visible slice.
- `components/LogsFiltersForm.tsx` → server-side source, limit, severity and absolute-date controls.
- `logView.ts` → time-range conversion, validated link targets.
- `routes.ts` → logs route and search validation for local, cluster and instance layouts.
- `hooks/useLogInspection.ts` → pins the displayed slice until resume or a query change; pending count covers only arrivals still in the bounded input buffer.
- `hooks/useInstanceLogs.ts` → existing SSE transport with polling fallback; snapshots and streamed entries share deduplication.
- `hooks/mergeReadLogs.ts` → compact, exact content identities with weak ownership and occurrence-preserving snapshot/tail reconciliation.
- `hooks/streamReducer.ts`, `hooks/useSupportsLogSSE.ts` → stream buffering and direct-connection capability.
- Interaction coverage: `Logs.test.tsx`, `hooks/useLogInspection.test.tsx`, `hooks/useInstanceLogs.test.tsx`, and `e2e/tests/logs.anon.spec.ts`.

- `src/integrations/api/instance/status/getReadLog.ts` → relative tail reads with client cutoff; bounded context pagination follows Harper’s forward-scan selection and fails explicitly when its scan budget is exhausted.
