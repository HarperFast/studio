// Central manager's investigation-agent reads (`/Admin/Investigation`, `/Admin/AgentOverview`, `/Admin/AgentWatch`),
// hand-typed from the endpoint contract on central-manager#1201: the generated SDK does not carry these paths, so URLs
// are cast as elsewhere. Every shape and parameter the page relies on is named here, so a contract change is one file.
import { apiClient } from '@/config/apiClient';
import { updateConfiguration } from '@/features/admin/configuration/mutations/useUpdateConfiguration';
import { configurationQueryKey } from '@/features/admin/configuration/queries/getConfiguration';
import { AdminConfigurationEntry } from '@/integrations/api/api.patch';
import { errorStatus } from '@/lib/errorStatus';
import { pollUnlessForbidden } from '@/react-query/pollUnlessForbidden';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const RUN_STATUSES = ['pending', 'running', 'completed', 'error', 'cancelled', 'expired'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
const OPEN_RUN_STATUSES: readonly string[] = ['pending', 'running'];
export const PAST_RUN_STATUSES = ['completed', 'error', 'cancelled', 'expired'] as const;

export const TRIGGER_KINDS = ['manual', 'failed_operation', 'version_upgrade', 'bulk_upgrade'] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const VERDICTS = ['healthy', 'degraded', 'down', 'unknown'] as const;
export type Verdict = (typeof VERDICTS)[number];

export type Confidence = 'high' | 'medium' | 'low';
export type RunStage = 'admitted' | 'gathering' | 'model' | 'finding' | 'finished';

export interface RunTrigger {
	kind?: string;
	ref?: string | null;
	windowMinutes?: number | null;
	operation?: string | null;
	reason?: string | null;
	by?: string | null;
}

export interface RunCost {
	reservedUsd?: number | null;
	spentUsd?: number | null;
	spendKnown?: boolean | null;
	tokens?: unknown;
}

export interface RunSummary {
	id: string;
	clusterId: string;
	organizationId?: string | null;
	role: string;
	triggerKind: string;
	trigger?: RunTrigger | null;
	status: RunStatus | string;
	stage: RunStage | string;
	verdict?: Verdict | null;
	confidence?: Confidence | null;
	startedBy?: string | null;
	createdAt: string;
	startedAt?: string | null;
	modelCallAt?: string | null;
	finishedAt?: string | null;
	deadline?: string | null;
	cost?: RunCost | null;
	error?: string | null;
	blindSpots?: string[] | null;
}

export interface EvidenceEntry {
	id: string;
	name?: string | null;
	status?: 'ok' | 'blind_spot' | string;
	coverage?: 'complete' | 'partial' | 'none' | string;
	reason?: string | null;
	bytes?: number | null;
	durationMs?: number | null;
	at?: string | null;
	text?: string | null;
}

export interface FindingHypothesis {
	cause: string;
	confidence: Confidence | string;
	evidence?: string[];
	against?: string[];
}

export interface Finding {
	triage?: { verdict?: string; summary?: string } | null;
	hypotheses?: FindingHypothesis[];
	blindSpots?: string[];
	rejected?: Array<{ cause: string; reason: string }>;
	captureBeforeRestart?: string[];
	nextStep?: string | null;
}

export interface AgentWatch {
	id: string;
	runId?: string | null;
	clusterId: string;
	kind: 'status_key' | 'log_message' | 'metric' | string;
	key: string;
	threshold?: number | null;
	firing?: boolean | null;
	lastValue?: unknown;
	lastEvaluatedAt?: string | null;
	expiresAt?: string | null;
	createdAt?: string | null;
}

export interface RunDetail extends RunSummary {
	evidence?: EvidenceEntry[] | null;
	brief?: string | null;
	finding?: Finding | null;
	watches?: AgentWatch[] | null;
}

export interface RoleSpend {
	role: string;
	enabled: boolean;
	monthlyBudgetUsd: number | null;
	reservedUsd: number;
	spentUsd: number;
	runs: number;
	updatedAt: string | null;
}

export interface AgentOverview {
	month: string;
	agentEnabled: boolean;
	runBudgetUsd: number | null;
	roles: RoleSpend[];
	settings: AdminConfigurationEntry[];
}

/** A time range the server resolves: the contract's 30-day default, a span ending now, or explicit dates. */
export type RunRange =
	| { kind: 'default' }
	| { kind: 'last'; hours: number }
	| { kind: 'between'; from: string; to: string };

export interface RunFilters {
	range: RunRange;
	status?: RunStatus | 'active';
	triggerKind?: TriggerKind;
	verdict?: Verdict;
	clusterId?: string;
	organizationId?: string;
}

export const RUN_PAGE_SIZE = 50;
/** The server's largest page; the open-run list asks for all of it, since it is not paged. */
export const RUN_MAX_PAGE = 200;
/** Contract: a page may end at most 2,000 rows in; past that the server answers 400. */
export const RUN_MAX_END = 2_000;

export const runPageSize = (filters: Pick<RunFilters, 'status'>) =>
	filters.status === 'active' ? RUN_MAX_PAGE : RUN_PAGE_SIZE;

export const isOpenRun = (run: Pick<RunSummary, 'status'>) => OPEN_RUN_STATUSES.includes(run.status);

const RUN_BASE = '/Admin/Investigation/';

export function runPath(id: string): string {
	return `${RUN_BASE}${encodeURIComponent(id)}`;
}

/**
 * The list request's query string. `from` for a trailing span is resolved here, at request time, so a poll keeps
 * the window ending now; with `from` alone the server ends the range at now (contract: "to never defaults past now").
 * `between` dates are whole UTC days, `to` exclusive.
 */
export function runListQueryString(filters: RunFilters, start: number, now = Date.now()): string {
	const params: string[] = [];
	const set = (name: string, value: string | undefined) => {
		const trimmed = value?.trim();
		if (trimmed) { params.push(`${name}=${encodeURIComponent(trimmed)}`); }
	};
	set('status', filters.status);
	set('triggerKind', filters.triggerKind);
	set('verdict', filters.verdict);
	set('clusterId', filters.clusterId);
	set('organizationId', filters.organizationId);
	const { range } = filters;
	if (range.kind === 'last') {
		set('from', new Date(now - range.hours * 3_600_000).toISOString());
	} else if (range.kind === 'between') {
		set('from', range.from);
		set('to', range.to);
	}
	params.push(`limit(${start},${start + runPageSize(filters)})`);
	return params.join('&');
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export async function getRuns(filters: RunFilters, start: number): Promise<RunSummary[]> {
	const { data } = await apiClient.get(`${RUN_BASE}?${runListQueryString(filters, start)}` as '/Admin/Region/');
	if (!Array.isArray(data)) { throw new Error('Central manager did not answer with a list of runs.'); }
	return (data as unknown[]).filter((row): row is RunSummary => isObject(row) && typeof row.id === 'string');
}

export async function getRun(id: string): Promise<RunDetail> {
	const { data } = await apiClient.get(runPath(id) as '/Admin/Region/');
	if (!isObject(data) || typeof data.id !== 'string') { throw new Error('Central manager did not answer with a run.'); }
	const run = data as unknown as RunDetail;
	return {
		...run,
		evidence: Array.isArray(run.evidence) ? run.evidence : [],
		watches: Array.isArray(run.watches) ? run.watches : [],
		blindSpots: Array.isArray(run.blindSpots) ? run.blindSpots : [],
	};
}

export async function getAgentOverview(): Promise<AgentOverview> {
	const { data } = await apiClient.get('/Admin/AgentOverview/' as '/Admin/Region/');
	if (!isObject(data) || typeof data.month !== 'string') {
		throw new Error('Central manager did not answer with the agent overview.');
	}
	const overview = data as unknown as AgentOverview;
	return {
		...overview,
		agentEnabled: overview.agentEnabled === true,
		runBudgetUsd: overview.runBudgetUsd ?? null,
		roles: Array.isArray(overview.roles) ? overview.roles : [],
		settings: Array.isArray(overview.settings) ? overview.settings : [],
	};
}

export async function getAgentWatches(): Promise<AgentWatch[]> {
	const { data } = await apiClient.get('/Admin/AgentWatch/' as '/Admin/Region/');
	if (!Array.isArray(data)) { throw new Error('Central manager did not answer with a list of watches.'); }
	return (data as unknown[]).filter((row): row is AgentWatch => isObject(row) && typeof row.id === 'string');
}

export const agentQueryPrefix = ['fabric-admin', 'agent'] as const;
const runListPrefix = [...agentQueryPrefix, 'runs'] as const;
export const agentOverviewQueryKey = [...agentQueryPrefix, 'overview'] as const;

// Contract "Staying current": 5 s while an open run is shown or the view is status=active, else 30 s.
export const FAST_POLL_MS = 5_000;
export const SLOW_POLL_MS = 30_000;
const WATCH_POLL_MS = 60_000;

/** The list's poll interval for its last answer. A view that hides open runs never shows one, so it polls slowly. */
export function runListInterval(filters: RunFilters, rows: RunSummary[] | undefined, hidesOpenRuns = false): number {
	if (filters.status === 'active') { return FAST_POLL_MS; }
	return !hidesOpenRuns && rows?.some(isOpenRun) ? FAST_POLL_MS : SLOW_POLL_MS;
}

/**
 * One page of runs. Each poll re-sends the same request and replaces the page, never merges: that is what drops a
 * run that left the filter. React Query renders only the current key's answer, so a reply for filters the user has
 * since changed is never shown.
 */
export function runListQueryOptions(filters: RunFilters, start = 0, { hidesOpenRuns = false } = {}) {
	return queryOptions({
		queryKey: [...runListPrefix, filters, start],
		queryFn: () => getRuns(filters, start),
		retry: false,
		meta: { quietErrors: true },
		refetchIntervalInBackground: false,
		refetchInterval: (query) => pollUnlessForbidden(runListInterval(filters, query.state.data, hidesOpenRuns))(query),
	});
}

export function runDetailQueryOptions(id: string) {
	return queryOptions({
		queryKey: [...agentQueryPrefix, 'run', id],
		queryFn: () => getRun(id),
		retry: false,
		meta: { quietErrors: true },
		refetchIntervalInBackground: false,
		refetchInterval: (query) => {
			const run = query.state.data;
			if ((run && !isOpenRun(run)) || errorStatus(query.state.error) === 404) { return false; }
			return pollUnlessForbidden(FAST_POLL_MS)(query);
		},
	});
}

export function agentOverviewQueryOptions() {
	return queryOptions({
		queryKey: agentOverviewQueryKey,
		queryFn: getAgentOverview,
		retry: false,
		meta: { quietErrors: true },
	});
}

export function agentWatchesQueryOptions() {
	return queryOptions({
		queryKey: [...agentQueryPrefix, 'watches'],
		queryFn: getAgentWatches,
		retry: false,
		meta: { quietErrors: true },
		refetchIntervalInBackground: false,
		refetchInterval: pollUnlessForbidden(WATCH_POLL_MS),
	});
}

const isActiveListKey = (key: readonly unknown[]) => (key[3] as Partial<RunFilters> | undefined)?.status === 'active';

/** Refetch run lists after something that changes runs; `exceptActive` when the active list's own poll saw it. */
export function invalidateRunLists(queryClient: ReturnType<typeof useQueryClient>, { exceptActive = false } = {}) {
	return queryClient.invalidateQueries({
		queryKey: runListPrefix,
		predicate: (query) => !(exceptActive && isActiveListKey(query.queryKey)),
	});
}

/** Cancel needs agent:run. Every settle refetches, since an unanswered cancel may have landed. */
export function useCancelRunMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		networkMode: 'always',
		mutationFn: async (id: string) => {
			const { data } = await apiClient.delete(runPath(id) as '/Cluster/{id}');
			return data as unknown as { id: string; status: string };
		},
		onSuccess: (result, id) => {
			const status = result?.status;
			const message = status === 'cancelled'
				? 'Run cancelled'
				: status && !OPEN_RUN_STATUSES.includes(status)
				? `Run had already finished (${status})`
				: 'Cancel requested; the run stops shortly';
			toast.success(message, { description: id });
		},
		onSettled: (_data, _error, id) => {
			void invalidateRunLists(queryClient);
			void queryClient.invalidateQueries({ queryKey: [...agentQueryPrefix, 'run', id] });
			void queryClient.invalidateQueries({ queryKey: agentOverviewQueryKey });
		},
	});
}

export interface SettingChange {
	name: string;
	value: unknown;
	expected: unknown;
}

/**
 * Save the changed settings one key at a time through Admin → Configuration's own write, so its per-key access rule
 * and its changed-since-opened check apply unchanged. Stops at the first refusal; the keys before it are saved.
 */
export async function saveAgentSettings(changes: SettingChange[]): Promise<string[]> {
	const saved: string[] = [];
	for (const change of changes) {
		try {
			await updateConfiguration(change);
		} catch (error) {
			throw Object.assign(error instanceof Error ? error : new Error(String(error)), { saved });
		}
		saved.push(change.name);
	}
	return saved;
}

/** `onSettledKeys` gets the keys that were saved, on success and on a partial failure alike. */
export function useSaveAgentSettingsMutation({ onSettledKeys }: { onSettledKeys?: (saved: string[]) => void } = {}) {
	const queryClient = useQueryClient();
	return useMutation({
		networkMode: 'always',
		mutationFn: saveAgentSettings,
		onSuccess: (saved) =>
			toast.success(saved.length === 1 ? `${saved[0]} updated` : `${saved.length} settings updated`),
		onSettled: (saved, failure) => {
			onSettledKeys?.(saved ?? (failure as { saved?: string[] } | null)?.saved ?? []);
			void queryClient.invalidateQueries({ queryKey: agentOverviewQueryKey });
			void queryClient.invalidateQueries({ queryKey: configurationQueryKey });
		},
	});
}
