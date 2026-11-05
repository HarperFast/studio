import type { WorkflowItem, WorkflowPlanStep } from '@/features/admin/workflows/workflowAdminApi';
import { describe, expect, it } from 'vitest';
import {
	batchProgress,
	describeStep,
	heldClusterIds,
	itemDefinitionPath,
	itemTree,
	statusCountsByStep,
	stepRuns,
} from './workflowProgress';

const step = (path: string, kind: WorkflowPlanStep['kind'] = 'step'): WorkflowPlanStep => ({
	path,
	kind,
	parallel: false,
	pointOfNoReturn: false,
	undo: 'function',
	maxDuration: null,
	status: 'pending',
});

// central manager's upgrade table, as describeWorkflow lists it.
const plan = [
	step('batch', 'forEach-steps'),
	step('batch/waitForPeersToRelease'),
	step('batch/drainBatch'),
	step('batch/members', 'forEach-steps'),
	step('batch/members/requestUpdate'),
	step('batch/members/waitUntilRunning'),
	step('batch/markBatchDone'),
];

const item = (stepPath: string, status: string, receipt?: unknown): WorkflowItem => ({
	id: `wf-1/${stepPath}`,
	workflowId: 'wf-1',
	stepPath,
	status,
	receipt,
});

// Batch b1 finished; b2 is draining; b3 hasn't started.
const items = [
	item('batch', 'running', { items: ['b1', 'b2', 'b3'] }),
	item('batch/b1', 'done'),
	item('batch/b1/waitForPeersToRelease', 'done'),
	item('batch/b1/drainBatch', 'done'),
	item('batch/b1/members', 'done', { items: ['ins-1'] }),
	item('batch/b1/members/ins-1', 'done'),
	item('batch/b1/members/ins-1/requestUpdate', 'done'),
	item('batch/b1/members/ins-1/waitUntilRunning', 'done'),
	item('batch/b1/markBatchDone', 'done'),
	item('batch/b2', 'running'),
	item('batch/b2/waitForPeersToRelease', 'done'),
	item('batch/b2/drainBatch', 'running'),
	item('batch/b3', 'pending'),
];

describe('itemDefinitionPath', () => {
	it.each([
		['batch', 'batch'],
		['batch/b1', 'batch'],
		['batch/b1/drainBatch', 'batch/drainBatch'],
		['batch/b1/members/ins-1', 'batch/members'],
		['batch/b1/members/ins-1/requestUpdate', 'batch/members/requestUpdate'],
	])('maps %s to %s', (runtime, definition) => {
		expect(itemDefinitionPath(runtime, plan)).toBe(definition);
	});

	it('is null for a path the plan no longer has', () => {
		expect(itemDefinitionPath('batch/b1/gone', plan)).toBeNull();
	});
});

describe('statusCountsByStep', () => {
	it('counts step rows under their definition path, leaving out the per-item rows', () => {
		const counts = statusCountsByStep({ plan, items });
		expect(counts.get('batch')).toEqual({ running: 1 });
		expect(counts.get('batch/waitForPeersToRelease')).toEqual({ done: 2 });
		expect(counts.get('batch/drainBatch')).toEqual({ done: 1, running: 1 });
		expect(counts.get('batch/members/requestUpdate')).toEqual({ done: 1 });
		expect(counts.has('batch/markBatchDone')).toBe(true);
	});

	it('is empty without a plan', () => {
		expect(statusCountsByStep({ plan: null, items }).size).toBe(0);
	});
});

describe('batchProgress', () => {
	const running = { status: 'RUNNING', phase: 'run' } as const;

	it('reads the batch plan and the last batch marked done', () => {
		expect(batchProgress({ ...running, state: { batchIds: ['b1', 'b2', 'b3'], lastBatchFinished: 'b1' } })).toEqual({
			total: 3,
			finished: 1,
			current: 2,
			currentId: 'b2',
		});
	});

	it('is on the first batch before any has finished', () => {
		expect(batchProgress({ ...running, state: { batchIds: ['b1', 'b2'], lastBatchFinished: null } })).toMatchObject({
			finished: 0,
			current: 1,
		});
	});

	it('has no current batch once the last one finished', () => {
		expect(batchProgress({ ...running, state: { batchIds: ['b1', 'b2'], lastBatchFinished: 'b2' } })).toMatchObject({
			finished: 2,
			current: null,
		});
	});

	it.each([
		['no state', undefined],
		['a state without batches', { recordLocks: true }],
		['an empty batch plan', { batchIds: [] }],
		['a malformed batch plan', { batchIds: 'b1' }],
	])('is null for %s', (_case, state) => {
		expect(batchProgress({ ...running, state })).toBeNull();
	});

	it.each(
		[
			['undoing', { status: 'UNDOING', phase: 'undo' }],
			['undone', { status: 'UNDONE', phase: 'undo' }],
			['abandoned', { status: 'ABANDONED', phase: 'finalize' }],
			['paused in undo', { status: 'PAUSED', phase: 'undo' }],
		] as const,
	)('names no current batch while %s', (_case, row) => {
		expect(batchProgress({ ...row, state: { batchIds: ['b1', 'b2', 'b3'], lastBatchFinished: 'b1' } })).toEqual({
			total: 3,
			finished: 1,
			current: null,
			currentId: null,
		});
	});
});

describe('stepRuns', () => {
	it.each([
		['batch', 'once'],
		['batch/waitForPeersToRelease', 'per batch'],
		['batch/drainBatch', 'per batch'],
		['batch/members', 'per batch'],
		['batch/members/requestUpdate', 'per member'],
		['batch/members/waitUntilRunning', 'per member'],
		['batch/markBatchDone', 'per batch'],
	])('%s runs %s', (path, runs) => {
		expect(stepRuns(plan.find((candidate) => candidate.path === path)!, plan)).toBe(runs);
	});
});

describe('describeStep', () => {
	const state = { batchIds: ['b1', 'b2'], batches: { b1: ['ins-1'], b2: ['ins-2', 'ins-3'] } };

	it.each([
		['batch/b2/members/ins-3/waitUntilRunning', 'batch 2 of 2, member 2 of 2: waitUntilRunning'],
		['batch/b1/drainBatch', 'batch 1 of 2: drainBatch'],
		['batch/b1/markBatchDone', 'batch 1 of 2: markBatchDone'],
	])('reads %s as %s', (step, words) => {
		expect(describeStep({ step, state })).toBe(words);
	});

	it.each([
		['a path outside the batch plan', 'cleanup', state],
		['a batch the plan does not list', 'batch/b9/drainBatch', state],
		['a workflow without a batch plan', 'batch/b1/drainBatch', undefined],
	])('keeps the raw path for %s', (_case, step, rowState) => {
		expect(describeStep({ step, state: rowState })).toBe(step);
	});

	it('is null without a step', () => {
		expect(describeStep({ step: null, state })).toBeNull();
	});
});

describe('itemTree', () => {
	it('marks only rows placed in the current plan with their definition paths', () => {
		const rows = itemTree({ plan, items: [...items, item('batch/b1/oldDrain', 'done')] });
		expect(rows.find((row) => row.path === 'batch/b1')?.definitionPath).toBe('batch');
		expect(rows.find((row) => row.path === 'batch/b1/members/ins-1/requestUpdate')?.definitionPath).toBe(
			'batch/members/requestUpdate',
		);
		expect(rows.find((row) => row.path === 'batch/b1/oldDrain')?.definitionPath).toBeUndefined();
	});

	const rows = () =>
		itemTree({ plan, items }).map(({ depth, kind, label, position, item }) =>
			`${'  '.repeat(depth)}${kind === 'group' ? `[${label} ${position}]` : label} ${item?.status ?? '-'}`
		);

	it('groups each batch with its steps, and each member under its batch', () => {
		expect(rows()).toEqual([
			'[batch b1 1 of 3] done',
			'  waitForPeersToRelease done',
			'  drainBatch done',
			'  [member ins-1 1 of 1] done',
			'    requestUpdate done',
			'    waitUntilRunning done',
			'  markBatchDone done',
			'[batch b2 2 of 3] running',
			'  waitForPeersToRelease done',
			'  drainBatch running',
			'  members -',
			'  markBatchDone -',
			'[batch b3 3 of 3] pending',
			'  waitForPeersToRelease -',
			'  drainBatch -',
			'  members -',
			'  markBatchDone -',
		]);
	});

	it('lists items the plan no longer has after the tree, under their raw paths', () => {
		const tree = itemTree({ plan, items: [...items, item('batch/b1/drain', 'done')] });
		expect(tree.at(-1)).toMatchObject({ path: 'batch/b1/drain', depth: 0, kind: 'step', label: 'batch/b1/drain' });
	});

	it('is a flat list without a plan', () => {
		expect(itemTree({ plan: null, items: [item('b', 'done'), item('a', 'done')] }).map((row) => row.path)).toEqual([
			'a',
			'b',
		]);
	});
});

describe('heldClusterIds', () => {
	it.each([
		['a host workflow', { clusterId: null, clusterIds: ['clu-a', 'clu-b'] }, ['clu-a', 'clu-b']],
		['a cluster workflow', { clusterId: 'clu-a', clusterIds: ['clu-a'] }, ['clu-a']],
		['a row from before clusterIds', { clusterId: 'clu-a' }, ['clu-a']],
		['an empty footprint', { clusterId: null, clusterIds: [] }, []],
		['a malformed footprint', { clusterId: 'clu-a', clusterIds: 'clu-b' as never }, ['clu-a']],
	])('%s', (_case, row, ids) => {
		expect(heldClusterIds(row)).toEqual(ids);
	});
});
