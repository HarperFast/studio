import { Deployment } from '@/integrations/api/instance/deployments/types';
import { describe, expect, it } from 'vitest';
import { stagedReleaseHistoryStarts, stagedReleaseState } from './stagedRelease';

const STAGED_ID = '4ac92da3-d8a0-423e-b145-5df107957dd4';

function record(id: string, started_at: number, extra: Partial<Deployment> = {}): Deployment {
	return { deployment_id: id, project: 'hello', status: 'success', started_at, ...extra };
}

const staged = record(STAGED_ID, 100, { status: 'staged' });
const activation = record('5c12b89e-0000-4000-8000-000000000001', 200, { activated_from: STAGED_ID });

describe('stagedReleaseState', () => {
	it('is waiting while nothing activated it', () => {
		expect(stagedReleaseState(staged, [staged, record('other', 150)])).toEqual({ kind: 'waiting' });
	});

	// Harper leaves the staged record as `staged` and writes the activation as a record of its own.
	it('is live once an activation that names it succeeded and nothing came after', () => {
		expect(stagedReleaseState(staged, [activation, staged])).toEqual({ kind: 'live', activation });
	});

	// A failed activation can have swapped in on the node that received it before replication failed.
	it('cannot call it waiting, or live, when its activation failed', () => {
		const failed = { ...activation, status: 'failed' } as Deployment;
		expect(stagedReleaseState(staged, [staged, failed])).toEqual({ kind: 'uncertain', failed });
	});

	it('stays uncertain after its failed activation when a later deploy went live on only some nodes', () => {
		const failed = { ...activation, status: 'failed' } as Deployment;
		const partial = record('9f00aa11-0000-4000-8000-000000000002', 300, { status: 'partial' });
		expect(stagedReleaseState(staged, [staged, failed, partial])).toEqual({ kind: 'uncertain', failed });
	});

	it('is waiting again once a deploy succeeded after its failed activation', () => {
		const failed = { ...activation, status: 'failed' } as Deployment;
		expect(stagedReleaseState(staged, [staged, failed, record('9f00aa11-0000-4000-8000-000000000002', 300)]))
			.toEqual({ kind: 'waiting' });
	});

	it('cannot claim it is live everywhere when its activation records a node that failed', () => {
		const partial = {
			...activation,
			peer_results: [{ node: 'b', status: 'failed' }, { node: 'c', status: 'success' }],
		};
		expect(stagedReleaseState(staged, [staged, partial])).toEqual({
			kind: 'uncertain',
			activation: partial,
			failed: partial,
		});
	});

	it('cannot claim it is live everywhere, or still waiting, when its rolling activation ended partial', () => {
		const partial = { ...activation, status: 'partial' } as Deployment;
		expect(stagedReleaseState(staged, [staged, partial])).toEqual({
			kind: 'uncertain',
			activation: partial,
			failed: partial,
		});
	});

	it('is replaced once a deploy succeeded after its partial activation', () => {
		const partial = { ...activation, status: 'partial' } as Deployment;
		const later = record('9f00aa11-0000-4000-8000-000000000002', 300);
		expect(stagedReleaseState(staged, [staged, partial, later])).toEqual({
			kind: 'replaced',
			activation: partial,
			replacedBy: later,
		});
	});

	it('reports a partial activation over an older activation that never finished', () => {
		const stranded = { ...activation, deployment_id: 'stranded', status: 'rolling_out', started_at: 150 } as Deployment;
		const partial = { ...activation, status: 'partial' } as Deployment;
		expect(stagedReleaseState(staged, [staged, stranded, partial])).toEqual({
			kind: 'uncertain',
			activation: partial,
			failed: partial,
		});
	});

	it('is being activated while its rolling activation is still rolling out', () => {
		const rolling = { ...activation, status: 'rolling_out' } as Deployment;
		expect(stagedReleaseState(staged, [staged, rolling])).toEqual({ kind: 'activating', activation: rolling });
	});

	it('is being activated while an activation of it has not finished', () => {
		const running = {
			...activation,
			deployment_id: 'c0c0c0c0-0000-4000-8000-000000000008',
			status: 'restarting',
		} as Deployment;
		expect(stagedReleaseState(staged, [staged, running])).toEqual({ kind: 'activating', activation: running });
		expect(stagedReleaseState(staged, [staged, activation, { ...running, started_at: 300 }])).toEqual({
			kind: 'activating',
			activation: { ...running, started_at: 300 },
		});
	});

	it('ignores an unfinished activation that a later deploy has already come after', () => {
		const stranded = { ...activation, status: 'replicating', started_at: 150 } as Deployment;
		expect(stagedReleaseState(staged, [staged, stranded, activation])).toEqual({ kind: 'live', activation });
	});

	it('is replaced by a later successful deploy, which a re-activation would roll back', () => {
		const later = record('9f00aa11-0000-4000-8000-000000000002', 300);
		expect(stagedReleaseState(staged, [later, staged, activation])).toEqual({
			kind: 'replaced',
			activation,
			replacedBy: later,
		});
	});

	it('is live again once it was activated after the deploy that replaced it', () => {
		const later = record('9f00aa11-0000-4000-8000-000000000002', 300);
		const rollback = record('b0b0b0b0-0000-4000-8000-000000000003', 400, { activated_from: STAGED_ID });
		expect(stagedReleaseState(staged, [activation, later, rollback, staged])).toEqual({
			kind: 'live',
			activation: rollback,
		});
	});

	it('cannot claim it is live everywhere when a later deploy failed', () => {
		const failed = record('fa11ed00-0000-4000-8000-000000000004', 300, { status: 'failed' });
		expect(stagedReleaseState(staged, [staged, activation, failed])).toEqual({
			kind: 'uncertain',
			activation,
			failed,
		});
	});

	it('cannot claim it is live everywhere when a later deploy ended partial', () => {
		const partial = record('fa11ed00-0000-4000-8000-000000000004', 300, { status: 'partial' });
		expect(stagedReleaseState(staged, [staged, activation, partial])).toEqual({
			kind: 'uncertain',
			activation,
			failed: partial,
		});
	});

	// From 5.4 a certified rolling deploy reads `rolling_out` once it is live on the node that received it.
	it('is being replaced, not live, while a later deploy rolls out', () => {
		const rolling = record('ab0de000-0000-4000-8000-000000000009', 300, { status: 'rolling_out' });
		expect(stagedReleaseState(staged, [staged, activation, rolling])).toEqual({
			kind: 'being-replaced',
			activation,
			replacedBy: rolling,
		});
		const other = { ...rolling, activated_from: '57a6ed00-0000-4000-8000-000000000005' };
		expect(stagedReleaseState(staged, [staged, activation, other])).toEqual({
			kind: 'being-replaced',
			activation,
			replacedBy: other,
		});
	});

	// Harper counts a record as live on the node that received it only from `rolling_out`, `success` or `partial`.
	it('stays live while a later deploy is still running, short of rolling out', () => {
		for (const status of ['pending', 'extracting', 'installing', 'loading', 'replicating', 'restarting'] as const) {
			const running = record('ab0de000-0000-4000-8000-000000000009', 300, { status });
			expect(stagedReleaseState(staged, [staged, activation, running])).toEqual({ kind: 'live', activation });
		}
	});

	it('is replaced once a deploy after it succeeded, whether that came before or after a rollout', () => {
		const success = record('9f00aa11-0000-4000-8000-000000000002', 400);
		for (const rollingAt of [300, 500]) {
			const rolling = record('ab0de000-0000-4000-8000-000000000009', rollingAt, { status: 'rolling_out' });
			expect(stagedReleaseState(staged, [staged, activation, rolling, success])).toEqual({
				kind: 'replaced',
				activation,
				replacedBy: success,
			});
		}
	});

	it('is being replaced rather than uncertain while a deploy rolls out, whichever failure came first', () => {
		const rolling = record('ab0de000-0000-4000-8000-000000000009', 300, { status: 'rolling_out' });
		const beingReplaced = (on: Deployment) => ({ kind: 'being-replaced', activation: on, replacedBy: rolling });
		const partialActivation = { ...activation, status: 'partial' } as Deployment;
		expect(stagedReleaseState(staged, [staged, partialActivation, rolling])).toEqual(beingReplaced(partialActivation));
		for (const failedAt of [250, 400]) {
			const failed = record('fa11ed00-0000-4000-8000-000000000004', failedAt, { status: 'failed' });
			expect(stagedReleaseState(staged, [staged, activation, rolling, failed])).toEqual(beingReplaced(activation));
		}
	});

	it('ignores a rollout that started before its activation', () => {
		const rolling = record('ab0de000-0000-4000-8000-000000000009', 150, { status: 'rolling_out' });
		expect(stagedReleaseState(staged, [staged, rolling, activation])).toEqual({ kind: 'live', activation });
	});

	// An unfinished activation of it that a later deploy came after is no longer `activating`.
	it('does not read its own re-activation, still rolling out, as another deploy taking over', () => {
		const again = record('ab0de000-0000-4000-8000-000000000009', 300, {
			status: 'rolling_out',
			activated_from: STAGED_ID,
		});
		const partial = record('fa11ed00-0000-4000-8000-000000000004', 400, { status: 'partial' });
		expect(stagedReleaseState(staged, [staged, activation, again, partial]))
			.toEqual({ kind: 'uncertain', activation, failed: partial });
	});

	it('ignores a failure from before its activation, a later stage, and other components', () => {
		const records = [
			staged,
			record('fa11ed00-0000-4000-8000-000000000004', 150, { status: 'failed' }),
			activation,
			record('57a6ed00-0000-4000-8000-000000000005', 300, { status: 'staged' }),
			record('0e0e0e0e-0000-4000-8000-000000000006', 400, { project: 'other' }),
			record('0f0f0f0f-0000-4000-8000-000000000007', 500, { project: 'other', status: 'failed' }),
			record('0d0d0d0d-0000-4000-8000-000000000010', 600, { project: 'other', status: 'rolling_out' }),
		];
		expect(stagedReleaseState(staged, records)).toEqual({ kind: 'live', activation });
	});
});

describe('stagedReleaseHistoryStarts', () => {
	it('starts each component at its earliest staged record, and ignores the rest', () => {
		expect(
			stagedReleaseHistoryStarts([
				record('a', 300, { status: 'staged' }),
				record('b', 100, { status: 'staged' }),
				record('c', 50),
				record('d', 200, { project: 'other', status: 'staged' }),
			]),
		).toEqual(new Map([['hello', 100], ['other', 200]]));
	});

	it('asks for the whole history when a staged record has no start time', () => {
		const starts = stagedReleaseHistoryStarts([
			record('a', 300, { status: 'staged' }),
			record('b', 0, { status: 'staged', started_at: undefined }),
			record('c', 100, { status: 'staged' }),
		]);
		expect(starts.has('hello')).toBe(true);
		expect(starts.get('hello')).toBeUndefined();
	});
});
