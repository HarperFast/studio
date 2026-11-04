import type {
	PlanStepKind,
	WorkflowDetail,
	WorkflowPlanStep,
	WorkflowRow,
} from '@/features/admin/workflows/workflowAdminApi';

const isForEach = (kind: PlanStepKind | undefined) => kind === 'forEach' || kind === 'forEach-steps';

interface Resolved {
	path: string;
	/** The runtime path ends on a forEach item id (`batch/b1`), so it names an item rather than a step. */
	endsOnItem: boolean;
}

function resolve(stepPath: string, plan: WorkflowPlanStep[]): Resolved | null {
	const kinds = new Map(plan.map((step) => [step.path, step.kind]));
	const segments = stepPath.split('/');
	const parts: string[] = [];
	for (let index = 0; index < segments.length; index++) {
		parts.push(segments[index]);
		const kind = kinds.get(parts.join('/'));
		if (!kind) { return null; }
		if (isForEach(kind) && index + 1 < segments.length) {
			index++;
			if (index === segments.length - 1) { return { path: parts.join('/'), endsOnItem: true }; }
		}
	}
	return { path: parts.join('/'), endsOnItem: false };
}

/**
 * The definition path of a runtime path: `batch/b1/instance/ins-1/requestUpdate` → `batch/instance/requestUpdate`.
 * Every forEach step is followed by its item id, which is dropped. Null when the path leaves the plan.
 */
export function itemDefinitionPath(stepPath: string, plan: WorkflowPlanStep[]): string | null {
	return resolve(stepPath, plan)?.path ?? null;
}

export type StatusCounts = Partial<Record<string, number>>;

/**
 * Item statuses per definition step. Central manager's plan reads one status per definition path, which misses every
 * row nested under a forEach (those are keyed by runtime path), so the counts come from the items instead.
 */
export function statusCountsByStep(detail: Pick<WorkflowDetail, 'plan' | 'items'>): Map<string, StatusCounts> {
	const counts = new Map<string, StatusCounts>();
	if (!detail.plan) { return counts; }
	for (const item of detail.items) {
		const resolved = resolve(item.stepPath, detail.plan);
		if (!resolved || resolved.endsOnItem) { continue; }
		const forStep = counts.get(resolved.path) ?? {};
		forStep[item.status] = (forStep[item.status] ?? 0) + 1;
		counts.set(resolved.path, forStep);
	}
	return counts;
}

export interface BatchProgress {
	total: number;
	/** Batches `settle` has stamped, in admission's order. */
	finished: number;
	/** 1-based position of the batch being worked on, or null once all are finished. */
	current: number | null;
	currentId: string | null;
}

const isIdList = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((id) => typeof id === 'string');

/**
 * Progress through an upgrade's batches, from its own checkpoint: admission plans `state.batchIds`, and each batch's
 * `settle` step records `state.lastBatchFinished` once that batch is out of the way. Null for a workflow without them.
 */
export function batchProgress(row: Pick<WorkflowRow, 'state'>): BatchProgress | null {
	const state = row.state as { batchIds?: unknown; lastBatchFinished?: unknown } | null | undefined;
	if (!isIdList(state?.batchIds) || !state.batchIds.length) { return null; }
	const ids = state.batchIds;
	const last = typeof state.lastBatchFinished === 'string' ? ids.indexOf(state.lastBatchFinished) : -1;
	const finished = last + 1;
	const current = finished < ids.length ? finished + 1 : null;
	return { total: ids.length, finished, current, currentId: current ? ids[current - 1] : null };
}

const TYPE_LABELS: Record<string, string> = {
	UPDATE_HARPER_VERSION: 'Harper version upgrade',
	UPDATE_RECORD_LOCKS: 'Record locks change',
};

export function workflowTypeLabel(type: string): string {
	return TYPE_LABELS[type] ?? type;
}

const PAUSE_LABELS: Record<string, string> = {
	command: 'Paused by an operator',
	failed: 'Paused: a step failed',
	unknown: 'Paused: a step’s outcome is unknown',
	'finalize-failed': 'Paused: cleanup failed',
	'missing-step': 'Paused: its definition lost a step',
};

export function pauseLabel(reason: string | undefined): string {
	return (reason && PAUSE_LABELS[reason]) ?? 'Paused';
}
