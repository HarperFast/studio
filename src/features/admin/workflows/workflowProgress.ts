import type {
	PlanStepKind,
	WorkflowDetail,
	WorkflowItem,
	WorkflowPlanStep,
	WorkflowRow,
} from '@/features/admin/workflows/workflowAdminApi';

const isForEach = (kind: PlanStepKind | undefined) => kind === 'forEach' || kind === 'forEach-steps';

interface Resolved {
	path: string;
	/** The runtime path ends on a forEach item id (`batch/b1`), so it names an item rather than a step. */
	endsOnItem: boolean;
}

function resolve(stepPath: string, kinds: Map<string, PlanStepKind>): Resolved | null {
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
 * The definition path of a runtime path: `batch/b1/members/ins-1/requestUpdate` → `batch/members/requestUpdate`.
 * Every forEach step is followed by its item id, which is dropped. Null when the path leaves the plan.
 */
export function itemDefinitionPath(stepPath: string, plan: WorkflowPlanStep[]): string | null {
	return resolve(stepPath, kindsByPath(plan))?.path ?? null;
}

const kindsByPath = (plan: WorkflowPlanStep[]) => new Map(plan.map((step) => [step.path, step.kind]));

export type StatusCounts = Partial<Record<string, number>>;

/**
 * Item statuses per definition step. Central manager's plan reads one status per definition path, which misses every
 * row nested under a forEach (those are keyed by runtime path), so the counts come from the items instead.
 */
export function statusCountsByStep(detail: Pick<WorkflowDetail, 'plan' | 'items'>): Map<string, StatusCounts> {
	const counts = new Map<string, StatusCounts>();
	if (!detail.plan) { return counts; }
	const kinds = kindsByPath(detail.plan);
	for (const item of detail.items) {
		const resolved = resolve(item.stepPath, kinds);
		if (!resolved || resolved.endsOnItem) { continue; }
		const forStep = counts.get(resolved.path) ?? {};
		forStep[item.status] = (forStep[item.status] ?? 0) + 1;
		counts.set(resolved.path, forStep);
	}
	return counts;
}

export interface BatchProgress {
	total: number;
	/** Batches the upgrade has marked done, in admission's order. */
	finished: number;
	/** 1-based position of the batch being worked on, or null once all are finished. */
	current: number | null;
	currentId: string | null;
}

const isIdList = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((id) => typeof id === 'string');

/**
 * Progress through an upgrade's batches, from its own checkpoint: admission plans `state.batchIds`, and each batch's
 * last step records `state.lastBatchFinished` once that batch is out of the way. Null for a workflow without them.
 * A current batch only while it runs forward: undo and cleanup walk the batches by other rules.
 */
export function batchProgress(row: Pick<WorkflowRow, 'state' | 'status' | 'phase'>): BatchProgress | null {
	const state = row.state as { batchIds?: unknown; lastBatchFinished?: unknown } | null | undefined;
	if (!isIdList(state?.batchIds) || !state.batchIds.length) { return null; }
	const ids = state.batchIds;
	const last = typeof state.lastBatchFinished === 'string' ? ids.indexOf(state.lastBatchFinished) : -1;
	const finished = last + 1;
	const forward = row.phase === 'run'
		&& (row.status === 'RUNNING' || row.status === 'PAUSED' || row.status === 'PENDING');
	const current = forward && finished < ids.length ? finished + 1 : null;
	return { total: ids.length, finished, current, currentId: current ? ids[current - 1] : null };
}

const lastSegment = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
/** A forEach step's name read as one of its items: `members` → `member`, `batch` → `batch`. */
const singular = (name: string) => (name.length > 3 && name.endsWith('s') ? name.slice(0, -1) : name);

/**
 * How often a step runs, from the forEach steps around it: `once`, or `per batch`, `per member`, … after the innermost.
 * A forEach step itself runs once per item of the forEach that holds it.
 */
export function stepRuns(step: WorkflowPlanStep, plan: WorkflowPlanStep[]): string {
	const kinds = kindsByPath(plan);
	for (let path = parentOf(step.path); path; path = parentOf(path)) {
		if (isForEach(kinds.get(path))) { return `per ${singular(lastSegment(path))}`; }
	}
	return 'once';
}

/**
 * An upgrade's current step in words, from its batch plan: `batch/b2/members/ins-1/waitUntilRunning` reads
 * `batch 2 of 2, member 1 of 1: waitUntilRunning`. Anything it can't place in the plan comes back as the raw path.
 */
export function describeStep(row: Pick<WorkflowRow, 'step' | 'state'>): string | null {
	if (!row.step) { return null; }
	const state = row.state as { batchIds?: unknown; batches?: unknown } | null | undefined;
	const segments = row.step.split('/');
	const batchIds = isIdList(state?.batchIds) ? state.batchIds : null;
	const batch = batchIds?.indexOf(segments[1]) ?? -1;
	if (!batchIds || batch < 0 || segments.length < 3) { return row.step; }
	const where = [`${singular(segments[0])} ${batch + 1} of ${batchIds.length}`];
	let rest = segments.slice(2);
	const members = (state?.batches as Record<string, unknown> | undefined)?.[segments[1]];
	const member = isIdList(members) && rest.length >= 3 ? members.indexOf(rest[1]) : -1;
	if (isIdList(members) && member >= 0) {
		where.push(`${singular(rest[0])} ${member + 1} of ${members.length}`);
		rest = rest.slice(2);
	}
	return `${where.join(', ')}: ${rest.join('/')}`;
}

export interface ItemTreeRow {
	definitionPath?: string;
	/** The runtime path the row stands for, whether or not it has an item yet. */
	path: string;
	depth: number;
	/** `group`: one item of a forEach (a batch, a member), with the steps it ran beneath it. */
	kind: 'group' | 'step';
	label: string;
	/** `1 of 2` for a group. */
	position?: string;
	item?: WorkflowItem;
}

/**
 * The items in the plan's shape: each forEach item is a group (batch b1, then member ins-1 inside it) with its steps
 * beneath it, in definition order, including steps not reached yet. Items the plan can't place (a step the definition
 * no longer has) follow at the end under their raw paths.
 */
export function itemTree(detail: Pick<WorkflowDetail, 'plan' | 'items'>): ItemTreeRow[] {
	const byPath = new Map(detail.items.map((item) => [item.stepPath, item]));
	const sorted = [...detail.items].sort((a, b) => a.stepPath.localeCompare(b.stepPath, undefined, { numeric: true }));
	if (!detail.plan?.length) {
		return sorted.map((item) => ({ path: item.stepPath, depth: 0, kind: 'step', label: item.stepPath, item }));
	}
	const plan = detail.plan;
	const rows: ItemTreeRow[] = [];
	const placed = new Set<string>();
	const idsOf = (path: string) => {
		const frozen = frozenItemIds(byPath.get(path));
		if (frozen) { return frozen; }
		return detail.items
			.filter((item) => parentOf(item.stepPath) === path)
			.sort((a, b) => (a.dispatchIndex ?? 0) - (b.dispatchIndex ?? 0))
			.map((item) => lastSegment(item.stepPath));
	};
	const walk = (definitionParent: string, runtimePrefix: string, depth: number) => {
		for (const step of plan.filter((candidate) => parentOf(candidate.path) === definitionParent)) {
			const name = lastSegment(step.path);
			const path = `${runtimePrefix}${name}`;
			placed.add(path);
			const ids = isForEach(step.kind) ? idsOf(path) : [];
			if (!ids.length) {
				rows.push({ path, depth, kind: 'step', label: name, definitionPath: step.path, item: byPath.get(path) });
				continue;
			}
			for (const [index, id] of ids.entries()) {
				const itemPath = `${path}/${id}`;
				placed.add(itemPath);
				rows.push({
					path: itemPath,
					definitionPath: step.path,
					depth,
					kind: 'group',
					label: `${singular(name)} ${id}`,
					position: `${index + 1} of ${ids.length}`,
					item: byPath.get(itemPath),
				});
				walk(step.path, `${itemPath}/`, depth + 1);
			}
		}
	};
	walk('', '', 0);
	for (const item of sorted) {
		if (!placed.has(item.stepPath)) {
			rows.push({ path: item.stepPath, depth: 0, kind: 'step', label: item.stepPath, item });
		}
	}
	return rows;
}

function frozenItemIds(row: WorkflowItem | undefined): string[] | null {
	const items = (row?.receipt as { items?: unknown } | undefined)?.items;
	return isIdList(items) ? items : null;
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
