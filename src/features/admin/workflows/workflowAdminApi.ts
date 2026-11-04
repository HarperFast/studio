// Central manager's staff-only `/Admin/Workflow` endpoint. Its OpenAPI entry types every answer as a bare object, so
// the shapes are written here and the URLs are cast as elsewhere. The endpoint enforces every permission the UI gates on.
import { apiClient } from '@/config/apiClient';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

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
export const ACTIVE_WORKFLOW_STATUSES: readonly WorkflowStatus[] = ['PENDING', 'RUNNING', 'UNDOING', 'PAUSED'];

export const WORKFLOW_COMMANDS = ['pause', 'resume', 'retry', 'undo', 'abandon'] as const;
export type WorkflowCommand = (typeof WORKFLOW_COMMANDS)[number];

export const INTAKE_MODES = ['open', 'queue', 'pause'] as const;
export type IntakeMode = (typeof INTAKE_MODES)[number];

export type PauseReason = 'command' | 'failed' | 'unknown' | 'finalize-failed' | 'missing-step';
export type WorkflowPhase = 'run' | 'undo' | 'finalize';

/** The workflow types central manager registers today; the filter also accepts any other typed value. */
export const KNOWN_WORKFLOW_TYPES = ['UPDATE_HARPER_VERSION', 'UPDATE_RECORD_LOCKS'] as const;

/** What an upgrade keeps in `state`: admission's batch plan and the last batch `settle` stamped. */
export interface UpgradeState {
	batchIds?: string[];
	batches?: Record<string, string[]>;
	targetIds?: string[];
	lastBatchFinished?: string | null;
}

export interface WorkflowRow {
	id: string;
	type: string;
	status: WorkflowStatus;
	phase?: WorkflowPhase | null;
	step?: string | null;
	scope?: string | null;
	clusterId?: string | null;
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

/** One step of the definition. `status` is central manager's, read by definition path; see `itemDefinitionPath`. */
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

export const isActiveWorkflow = (row: Pick<WorkflowRow, 'status'>) => ACTIVE_WORKFLOW_STATUSES.includes(row.status);

const workflowsQueryPrefix = ['fabric-admin', 'workflows'] as const;
const LIST_POLL_MS = 10_000;
const DETAIL_POLL_MS = 5_000;
/** Central manager's page size when the request names none; a full page may not be every match. */
export const LIST_PAGE_SIZE = 100;

// Any failure stops the timer: an older central manager answers 404 for good, and the pages already show the error.
const untilFailure = (interval: number) => (query: { state: { error: unknown } }) =>
	query.state.error ? false : interval;

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
		refetchInterval: untilFailure(LIST_POLL_MS),
	});
}

export function workflowDetailQueryKey(id: string) {
	return [...workflowsQueryPrefix, 'detail', id] as const;
}

export async function getWorkflowDetail(id: string): Promise<WorkflowDetail> {
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

/** Polls only while the workflow is active: an ended row no longer changes. */
export function workflowDetailQueryOptions(id: string | null | undefined) {
	return queryOptions({
		queryKey: workflowDetailQueryKey(id ?? ''),
		queryFn: () => getWorkflowDetail(id as string),
		enabled: !!id,
		retry: false,
		refetchInterval: (query) =>
			query.state.data && !isActiveWorkflow(query.state.data) ? false : untilFailure(DETAIL_POLL_MS)(query),
	});
}

/**
 * The cluster notice's read of the workflow holding a cluster: its row from the list, which carries no items or
 * events, so a page left open polls something light. A failure is not news there (the notice falls back to its plain
 * state), so it settles to null instead of reaching the global error toast, and stops polling. `console.debug` is not
 * collected.
 */
export function heldClusterWorkflowQueryOptions(clusterId: string | undefined, workflowId: string | null | undefined) {
	return queryOptions({
		queryKey: [...workflowsQueryPrefix, 'notice', clusterId ?? '', workflowId ?? ''],
		queryFn: async (): Promise<WorkflowRow | null> => {
			try {
				const { data } = await apiClient.get(
					`${BASE}?${workflowsQueryString({ clusterId, active: true })}` as '/Admin/Region/',
				);
				return Array.isArray(data)
					? (data as unknown as WorkflowRow[]).find((row) => row.id === workflowId) ?? null
					: null;
			} catch (error) {
				console.debug('Could not read the workflow holding this cluster', error);
				return null;
			}
		},
		enabled: !!clusterId && !!workflowId,
		retry: false,
		refetchInterval: (query) => (query.state.data === null ? false : LIST_POLL_MS),
	});
}

export function workflowSummaryQueryOptions() {
	return queryOptions({
		queryKey: [...workflowsQueryPrefix, 'summary'],
		queryFn: async () => {
			const { data } = await apiClient.get(`${BASE}summary` as '/Admin/Region/');
			return data as unknown as WorkflowSummary;
		},
		retry: false,
		refetchInterval: untilFailure(LIST_POLL_MS),
	});
}

export function workflowIntakeQueryOptions() {
	return queryOptions({
		queryKey: [...workflowsQueryPrefix, 'intake'],
		queryFn: async () => {
			const { data } = await apiClient.get(`${BASE}intake` as '/Admin/Region/');
			return (data as unknown as { mode: IntakeMode }).mode;
		},
		retry: false,
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
		onSettled: () => queryClient.invalidateQueries({ queryKey: workflowsQueryPrefix }),
	});
}

export function useSetIntakeMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		networkMode: 'always',
		mutationFn: async (mode: IntakeMode) => {
			await apiClient.post(`${BASE}intake` as '/Admin/Region/', { mode });
		},
		onSettled: () => queryClient.invalidateQueries({ queryKey: workflowsQueryPrefix }),
	});
}
