// Central manager's `/Admin/Workflow`. Its OpenAPI entry types every answer as a bare object, so the shapes are written
// here and the URLs cast as elsewhere.
import { apiClient } from '@/config/apiClient';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const WORKFLOW_STATUSES = [
	'PENDING',
	'RUNNING',
	'UNDOING',
	'PAUSED',
	'SUCCEEDED',
	'UNDONE',
	'ABANDONED',
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
const ACTIVE_WORKFLOW_STATUSES: readonly WorkflowStatus[] = ['PENDING', 'RUNNING', 'UNDOING', 'PAUSED'];

export const WORKFLOW_COMMANDS = ['pause', 'resume', 'retry', 'undo', 'abandon'] as const;
export type WorkflowCommand = (typeof WORKFLOW_COMMANDS)[number];

export const INTAKE_MODES = ['open', 'queue', 'pause'] as const;
export type IntakeMode = (typeof INTAKE_MODES)[number];

export type PauseReason = 'command' | 'failed' | 'unknown' | 'finalize-failed' | 'missing-step';
export type WorkflowPhase = 'run' | 'undo' | 'finalize';

export const KNOWN_WORKFLOW_TYPES = ['UPDATE_HARPER_VERSION', 'UPDATE_RECORD_LOCKS'] as const;

export interface WorkflowRow {
	id: string;
	type: string;
	status: WorkflowStatus;
	phase?: WorkflowPhase | null;
	step?: string | null;
	scope?: string | null;
	/** Null for a workflow whose scope holds several clusters, such as `host:<id>`; `clusterIds` lists them. */
	clusterId?: string | null;
	clusterIds?: string[] | null;
	parentId?: string | null;
	stepInFlight?: boolean | null;
	stepAttempt?: number | null;
	stepStartedAt?: string | null;
	stepDeadlineAt?: string | null;
	undoStep?: string | null;
	failedStep?: string | null;
	failedItem?: string | null;
	failure?: unknown;
	input?: unknown;
	state?: unknown;
	// `token` is the owner's fencing secret; nothing here reads or renders it.
	owner?: { node?: string | null } | null;
	leaseExpiresAt?: string | null;
	pointOfNoReturnAt?: string | null;
	command?: { action?: WorkflowCommand; by?: string; at?: string; reason?: string } | null;
	pause?: { reason?: PauseReason | string; at?: string } | null;
	error?: unknown;
	createdByUserId?: string | null;
	createdAt?: string | null;
	updatedAt?: string | null;
	endedAt?: string | null;
	notBefore?: string | null;
}

export type PlanStepKind = 'step' | 'forEach' | 'forEach-steps' | 'workflow';

/** One step of the definition. `status` is central manager's, read by definition path. */
export interface WorkflowPlanStep {
	path: string;
	kind: PlanStepKind;
	parallel: boolean;
	pointOfNoReturn: boolean;
	undo: 'none' | 'nothing' | 'function';
	maxDuration: string | number | null;
	status: string;
}

export type WorkflowItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'undone' | 'skipped' | 'unknown';

/** One step execution, keyed by runtime path: `batch/b1/instance/ins-1/requestUpdate`. */
export interface WorkflowItem {
	id: string;
	workflowId: string;
	stepPath: string;
	item?: string | null;
	status: WorkflowItemStatus | string;
	dispatchIndex?: number | null;
	attempt?: number | null;
	startedAt?: string | null;
	finishedAt?: string | null;
	pointOfNoReturnAt?: string | null;
	receipt?: unknown;
	error?: unknown;
}

export interface WorkflowEvent {
	id: string;
	workflowId: string;
	at: string;
	kind: string;
	step?: string | null;
	item?: string | null;
	attempt?: number | null;
	data?: unknown;
}

export interface WorkflowChild {
	id: string;
	type: string;
	status: WorkflowStatus;
	step?: string | null;
	pause?: WorkflowRow['pause'];
}

export interface WorkflowDetail extends WorkflowRow {
	definitionRegistered: boolean;
	plan: WorkflowPlanStep[] | null;
	items: WorkflowItem[];
	children: WorkflowChild[];
	events: WorkflowEvent[];
	acceptedCommands: WorkflowCommand[];
}

export interface WorkflowSummary {
	intake: IntakeMode;
	active: number;
	byStatus: Partial<Record<WorkflowStatus, number>>;
	byType: Record<string, number>;
	byNode: Record<string, number>;
	stuck: Array<{ id: string; type: string; step?: string | null; stuckReason: string; node?: string | null }>;
	pausedOnFailure: Array<
		{ id: string; type: string; reason?: string; step?: string | null; clusterId?: string | null }
	>;
	lockAvailable: boolean | null;
	drained: boolean | null;
	node: string | null;
	oldestActive: { id: string; type: string; createdAt: string } | null;
	oldestActiveSeconds: number;
}

export interface WorkflowFilters {
	status?: WorkflowStatus;
	type?: string;
	clusterId?: string;
	active?: boolean;
}

const BASE = '/Admin/Workflow/';

/** A child's id is `<parent id>/<runtime path>`; central manager splits the path on its slashes, so they stay literal. */
export function workflowPath(id: string): string {
	return `${BASE}${id.split('/').map(encodeURIComponent).join('/')}`;
}

/** Unset filters are left out: the endpoint answers an unknown status with a 400, and `status` already implies activity. */
export function workflowsQueryString(filters: WorkflowFilters): string {
	const params = new URLSearchParams();
	if (filters.status) {
		params.set('status', filters.status);
	} else if (filters.active) {
		params.set('active', 'true');
	}
	const type = filters.type?.trim();
	if (type) { params.set('type', type); }
	const clusterId = filters.clusterId?.trim();
	if (clusterId) { params.set('clusterId', clusterId); }
	return params.toString();
}

const isActiveWorkflow = (row: Pick<WorkflowRow, 'status'>) => ACTIVE_WORKFLOW_STATUSES.includes(row.status);

const workflowsQueryPrefix = ['fabric-admin', 'workflows'] as const;
const LIST_POLL_MS = 10_000;
const DETAIL_POLL_MS = 5_000;
/** Central manager's page size when the request names none; a full page may not be every match. */
export const LIST_PAGE_SIZE = 100;

const RETRY_POLL_MS = 30_000;
const statusOf = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status;
/** An answer that polling won't change: no such endpoint or row (an older central manager), or no permission. */
export const isLastingFailure = (error: unknown) => [403, 404].includes(statusOf(error) ?? 0);

const pollUnlessGone = (interval: number) => (query: { state: { error: unknown } }) =>
	isLastingFailure(query.state.error) ? false : query.state.error ? RETRY_POLL_MS : interval;

export function workflowsQueryOptions(filters: WorkflowFilters) {
	return queryOptions({
		queryKey: [...workflowsQueryPrefix, 'list', filters],
		queryFn: async () => {
			const query = workflowsQueryString(filters);
			const { data } = await apiClient.get(`${BASE}${query ? `?${query}` : ''}` as '/Admin/Region/');
			if (!Array.isArray(data)) { throw new Error('Central manager did not answer with a list of workflows.'); }
			return data as unknown as WorkflowRow[];
		},
		retry: false,
		meta: { quietErrors: true },
		refetchInterval: pollUnlessGone(LIST_POLL_MS),
	});
}

async function getWorkflowDetail(id: string): Promise<WorkflowDetail> {
	const { data } = await apiClient.get(workflowPath(id) as '/Admin/Region/');
	const detail = data as unknown as Partial<WorkflowDetail> | undefined;
	if (!detail?.id || !Array.isArray(detail.acceptedCommands)) {
		throw new Error('Central manager did not answer with a workflow.');
	}
	return {
		...detail,
		plan: Array.isArray(detail.plan) ? detail.plan : null,
		items: Array.isArray(detail.items) ? detail.items : [],
		children: Array.isArray(detail.children) ? detail.children : [],
		events: Array.isArray(detail.events) ? detail.events : [],
	} as WorkflowDetail;
}

/** An ended row no longer changes; a paused one changes only on a command, so its full history is fetched less often. */
export function workflowDetailQueryOptions(id: string | null | undefined) {
	return queryOptions({
		queryKey: [...workflowsQueryPrefix, 'detail', id ?? ''],
		queryFn: () => getWorkflowDetail(id as string),
		enabled: !!id,
		retry: false,
		meta: { quietErrors: true },
		refetchInterval: (query) => {
			const row = query.state.data;
			if (row && !isActiveWorkflow(row)) { return false; }
			return pollUnlessGone(row?.status === 'PAUSED' ? RETRY_POLL_MS : DETAIL_POLL_MS)(query);
		},
	});
}

/**
 * The cluster notice's read of the workflow holding a cluster: its row from the list, which carries no items or
 * events. `quietErrors`: the notice falls back to its plain state, so a failure is not news, and the last row read
 * stays shown while polling carries on.
 */
export function heldClusterWorkflowQueryOptions(clusterId: string | undefined, workflowId: string | null | undefined) {
	return queryOptions({
		queryKey: [...workflowsQueryPrefix, 'notice', clusterId ?? '', workflowId ?? ''],
		queryFn: async (): Promise<WorkflowRow | null> => {
			const { data } = await apiClient.get(
				`${BASE}?${workflowsQueryString({ clusterId, active: true })}` as '/Admin/Region/',
			);
			if (!Array.isArray(data)) { throw new Error('Central manager did not answer with a list of workflows.'); }
			return (data as unknown as WorkflowRow[]).find((row) => row.id === workflowId) ?? null;
		},
		enabled: !!clusterId && !!workflowId,
		retry: false,
		meta: { quietErrors: true },
		refetchInterval: pollUnlessGone(LIST_POLL_MS),
	});
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const hasId = (value: unknown) => isObject(value) && typeof value.id === 'string';

export function workflowSummaryQueryOptions() {
	return queryOptions({
		queryKey: [...workflowsQueryPrefix, 'summary'],
		queryFn: async (): Promise<WorkflowSummary> => {
			const { data } = await apiClient.get(`${BASE}summary` as '/Admin/Region/');
			const summary = data as unknown as Partial<WorkflowSummary> | undefined;
			if (!isObject(summary) || typeof summary.active !== 'number') {
				throw new Error('Central manager did not answer with a workflow summary.');
			}
			return {
				...summary,
				intake: INTAKE_MODES.includes(summary.intake as IntakeMode) ? summary.intake as IntakeMode : 'open',
				byStatus: isObject(summary.byStatus) ? summary.byStatus : {},
				byType: isObject(summary.byType) ? summary.byType as Record<string, number> : {},
				byNode: isObject(summary.byNode) ? summary.byNode as Record<string, number> : {},
				stuck: Array.isArray(summary.stuck) ? summary.stuck.filter(hasId) : [],
				pausedOnFailure: Array.isArray(summary.pausedOnFailure) ? summary.pausedOnFailure.filter(hasId) : [],
				lockAvailable: summary.lockAvailable ?? null,
				oldestActive: summary.oldestActive ?? null,
				oldestActiveSeconds: summary.oldestActiveSeconds ?? 0,
			} as WorkflowSummary;
		},
		retry: false,
		meta: { quietErrors: true },
		refetchInterval: pollUnlessGone(LIST_POLL_MS),
	});
}

/**
 * Failures toast through the global MutationCache handler, which shows a 409's reason as central manager words it and
 * an unanswered write as "outcome unknown". Every settle refetches, because a refused command means the row moved on
 * since it was read and an unanswered one may have landed.
 *
 * `networkMode: 'always'`: React Query's default pauses an offline mutation and sends it on reconnect, which would
 * deliver an abandon or undo long after the operator stopped looking. Failing at once leaves the decision with them.
 */
export function useWorkflowCommandMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		networkMode: 'always',
		mutationFn: async ({ id, command, reason }: { id: string; command: WorkflowCommand; reason?: string }) => {
			await apiClient.post(
				`${workflowPath(id)}/${command}` as '/Admin/Region/',
				command === 'abandon' ? { reason } : {},
			);
		},
		// Here, not in a caller's mutate options, which React Query skips once that component unmounts.
		onSuccess: (_data, { id, command }) =>
			toast.success(`${command[0].toUpperCase()}${command.slice(1)} sent`, { description: id }),
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: workflowsQueryPrefix });
		},
	});
}

export function useSetIntakeMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		networkMode: 'always',
		mutationFn: async (mode: IntakeMode) => {
			await apiClient.post(`${BASE}intake` as '/Admin/Region/', { mode });
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: workflowsQueryPrefix });
		},
	});
}
