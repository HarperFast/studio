import type { WorkflowItem, WorkflowPlanStep } from '@/features/admin/workflows/workflowAdminApi';
import { describe, expect, it } from 'vitest';
import { batchProgress, itemDefinitionPath, statusCountsByStep } from './workflowProgress';

const step = (path: string, kind: WorkflowPlanStep['kind'] = 'step'): WorkflowPlanStep => ({
	path,
	kind,
	parallel: false,
	pointOfNoReturn: false,
	undo: 'function',
	maxDuration: null,
	status: 'pending',
});

// central manager's upgrade table (updateHarperVersion.js), as describeWorkflow lists it.
const plan = [
	step('batch', 'forEach-steps'),
	step('batch/awaitPeers'),
	step('batch/drain'),
	step('batch/instance', 'forEach-steps'),
	step('batch/instance/requestUpdate'),
	step('batch/instance/awaitRunning'),
	step('batch/settle'),
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
	item('batch/b1/awaitPeers', 'done'),
	item('batch/b1/drain', 'done'),
	item('batch/b1/instance', 'done', { items: ['ins-1'] }),
	item('batch/b1/instance/ins-1', 'done'),
	item('batch/b1/instance/ins-1/requestUpdate', 'done'),
	item('batch/b1/instance/ins-1/awaitRunning', 'done'),
	item('batch/b1/settle', 'done'),
	item('batch/b2', 'running'),
	item('batch/b2/awaitPeers', 'done'),
	item('batch/b2/drain', 'running'),
	item('batch/b3', 'pending'),
];

describe('itemDefinitionPath', () => {
	it.each([
		['batch', 'batch'],
		['batch/b1', 'batch'],
		['batch/b1/drain', 'batch/drain'],
		['batch/b1/instance/ins-1', 'batch/instance'],
		['batch/b1/instance/ins-1/requestUpdate', 'batch/instance/requestUpdate'],
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
		expect(counts.get('batch/awaitPeers')).toEqual({ done: 2 });
		expect(counts.get('batch/drain')).toEqual({ done: 1, running: 1 });
		expect(counts.get('batch/instance/requestUpdate')).toEqual({ done: 1 });
		expect(counts.has('batch/settle')).toBe(true);
	});

	it('is empty without a plan', () => {
		expect(statusCountsByStep({ plan: null, items }).size).toBe(0);
	});
});

describe('batchProgress', () => {
	const running = { status: 'RUNNING', phase: 'run' } as const;

	it('reads the batch plan and the last batch settle stamped', () => {
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
