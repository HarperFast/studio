import {
	getRestartState,
	holdsRequests,
	markContainerOpAccepted,
	markRestarting,
	nextObservationStamp,
	onRestartSettled,
	resetRestartTracker,
	subscribeToRestarts,
	syncRestartsFromCluster,
	waitUntilReachable,
} from '@/lib/restart/restartTracker';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TTL = 60_000;

describe('restartTracker', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetRestartTracker();
	});
	afterEach(() => {
		resetRestartTracker();
		vi.useRealTimers();
	});

	describe('markRestarting', () => {
		it('tracks the entity until released, then reports it settled', async () => {
			const settled = vi.fn();
			const unsubscribe = onRestartSettled(settled);
			const release = markRestarting(['ins-1'], { reach: 'down', ttlMs: TTL });

			expect(getRestartState('ins-1')).toEqual({ reach: 'down', proxyRefuses: false, label: 'Restarting' });
			release();
			expect(getRestartState('ins-1')).toBeUndefined();
			// Deferred a tick, so a listener can't cancel the fetch that reported the recovery.
			expect(settled).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(0);
			expect(settled).toHaveBeenCalledWith('ins-1');
			unsubscribe();
		});

		it('keeps overlapping marks independent, with down winning over rolling', () => {
			const releaseRolling = markRestarting(['clu-1'], { reach: 'rolling', ttlMs: TTL });
			const releaseDown = markRestarting(['clu-1'], { reach: 'down', ttlMs: TTL });
			expect(getRestartState('clu-1')?.reach).toBe('down');

			releaseDown();
			expect(getRestartState('clu-1')?.reach).toBe('rolling');
			releaseRolling();
			expect(getRestartState('clu-1')).toBeUndefined();
		});

		it("notifies only when an entity's effective state changes, not when a poll extends it", () => {
			const listener = vi.fn();
			const unsubscribe = subscribeToRestarts(listener);
			const restarting = { id: 'clu-1', status: 'RESTARTING', instances: [{ id: 'ins-1', status: 'RESTARTING' }] };
			const running = { id: 'clu-1', status: 'RUNNING', instances: [{ id: 'ins-1', status: 'RUNNING' }] };

			syncRestartsFromCluster(running);
			expect(listener).not.toHaveBeenCalled();
			syncRestartsFromCluster(restarting);
			expect(listener).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(5_000);
			syncRestartsFromCluster(restarting);
			expect(listener).toHaveBeenCalledTimes(1);
			syncRestartsFromCluster(running);
			expect(listener).toHaveBeenCalledTimes(2);
			unsubscribe();
		});

		it('lapses on its own when the owner never releases it', async () => {
			const settled = vi.fn();
			const unsubscribe = onRestartSettled(settled);
			markRestarting(['ins-1'], { reach: 'down', ttlMs: TTL });

			await vi.advanceTimersByTimeAsync(TTL - 1);
			expect(getRestartState('ins-1')).toBeDefined();
			await vi.advanceTimersByTimeAsync(1);
			expect(getRestartState('ins-1')).toBeUndefined();
			await vi.advanceTimersByTimeAsync(5);
			expect(settled).toHaveBeenCalledWith('ins-1');
			unsubscribe();
		});
	});

	describe('waitUntilReachable', () => {
		it('resolves at once for an entity that is not down', async () => {
			markRestarting(['clu-1'], { reach: 'rolling', ttlMs: TTL });
			await expect(waitUntilReachable('clu-1', { proxied: false })).resolves.toBeUndefined();
			await expect(waitUntilReachable('ins-untracked', { proxied: false })).resolves.toBeUndefined();
		});

		it('waits for the release', async () => {
			const release = markRestarting(['ins-1'], { reach: 'down', ttlMs: TTL });
			const done = vi.fn();
			void waitUntilReachable('ins-1', { proxied: false }).then(done);

			await vi.advanceTimersByTimeAsync(30_000);
			expect(done).not.toHaveBeenCalled();
			release();
			await vi.advanceTimersByTimeAsync(0);
			expect(done).toHaveBeenCalled();
		});

		it('gives up when the mark expires, so a lost release cannot hold requests forever', async () => {
			markRestarting(['ins-1'], { reach: 'down', ttlMs: TTL });
			const done = vi.fn();
			void waitUntilReachable('ins-1', { proxied: false }).then(done);

			await vi.advanceTimersByTimeAsync(TTL);
			expect(done).toHaveBeenCalled();
		});

		it('rejects at once for a request that was already aborted', async () => {
			markRestarting(['ins-1'], { reach: 'down', ttlMs: TTL });
			const controller = new AbortController();
			controller.abort(new Error('already cancelled'));
			await expect(waitUntilReachable('ins-1', { proxied: false, signal: controller.signal })).rejects.toThrow(
				'already cancelled',
			);
		});

		it('rejects with the abort reason when the caller gives up first', async () => {
			markRestarting(['ins-1'], { reach: 'down', ttlMs: TTL });
			const controller = new AbortController();
			const waiting = waitUntilReachable('ins-1', { proxied: false, signal: controller.signal });
			controller.abort(new Error('query cancelled'));
			await expect(waiting).rejects.toThrow('query cancelled');
		});
	});

	describe('syncRestartsFromCluster', () => {
		it('marks a parallel restart down at both levels', () => {
			syncRestartsFromCluster({
				id: 'clu-1',
				status: 'RESTARTING',
				instances: [{ id: 'ins-1', status: 'RESTARTING' }, { id: 'ins-2', status: 'RESTARTING' }],
			});
			expect(getRestartState('clu-1')).toEqual({ reach: 'down', proxyRefuses: true, label: 'Restarting' });
			expect(getRestartState('ins-1')?.reach).toBe('down');
			expect(getRestartState('ins-2')?.reach).toBe('down');
		});

		it('keeps a rolling restart reachable at the cluster and down only for the member restarting', () => {
			syncRestartsFromCluster({
				id: 'clu-1',
				status: 'RESTARTING',
				instances: [
					{ id: 'ins-1', status: 'RUNNING' },
					{ id: 'ins-2', status: 'RESTARTING' },
					{ id: 'ins-gone', status: 'TERMINATED' },
				],
			});
			expect(getRestartState('clu-1')?.reach).toBe('rolling');
			expect(getRestartState('ins-1')).toBeUndefined();
			expect(getRestartState('ins-2')?.reach).toBe('down');
		});

		it('holds a rolling container restart for proxied clients only — CM refuses the cluster until it settles', () => {
			syncRestartsFromCluster({
				id: 'clu-1',
				status: 'RESTARTING',
				instances: [{ id: 'ins-1', status: 'RUNNING' }, { id: 'ins-2', status: 'RESTARTING' }],
			});
			const state = getRestartState('clu-1');
			expect(holdsRequests(state, { proxied: true })).toBe(true);
			expect(holdsRequests(state, { proxied: false })).toBe(false);
		});

		it('clears once central manager reports the cluster settled', () => {
			syncRestartsFromCluster({ id: 'clu-1', status: 'STARTING', instances: [{ id: 'ins-1', status: 'STARTING' }] });
			expect(getRestartState('clu-1')?.label).toBe('Starting');

			syncRestartsFromCluster({ id: 'clu-1', status: 'RUNNING', instances: [{ id: 'ins-1', status: 'RUNNING' }] });
			expect(getRestartState('clu-1')).toBeUndefined();
			expect(getRestartState('ins-1')).toBeUndefined();
		});

		it('does not hold requests for a cluster that is stopping', () => {
			syncRestartsFromCluster({ id: 'clu-1', status: 'STOPPING', instances: [{ id: 'ins-1', status: 'STOPPING' }] });
			expect(getRestartState('clu-1')).toBeUndefined();
			expect(getRestartState('ins-1')).toBeUndefined();
		});

		it('lets proxied clients through a rolling restart Studio drives itself, since CM keeps routing', () => {
			markRestarting(['clu-1'], { reach: 'rolling', ttlMs: TTL });
			expect(holdsRequests(getRestartState('clu-1'), { proxied: true })).toBe(false);
		});

		it('never clears a restart Studio is driving itself', () => {
			markRestarting(['ins-1'], { reach: 'down', ttlMs: TTL });
			syncRestartsFromCluster({ id: 'clu-1', status: 'RUNNING', instances: [{ id: 'ins-1', status: 'RUNNING' }] });
			expect(getRestartState('ins-1')?.reach).toBe('down');
		});

		it('ignores a record fetched before the container op was accepted', () => {
			const requestedBeforeOp = Date.now();
			vi.advanceTimersByTime(10);
			markContainerOpAccepted({ clusterId: 'clu-1', instanceIds: ['ins-1'], label: 'Restarting', allAtOnce: true });

			// A poll that was already in flight lands with the pre-op RUNNING status.
			syncRestartsFromCluster(
				{ id: 'clu-1', status: 'RUNNING', instances: [{ id: 'ins-1', status: 'RUNNING' }] },
				requestedBeforeOp,
			);
			expect(getRestartState('clu-1')?.reach).toBe('down');
			expect(getRestartState('ins-1')?.reach).toBe('down');

			// A read sent within the grace window can still be a lagging CM node's pre-op status.
			vi.advanceTimersByTime(1_000);
			syncRestartsFromCluster({ id: 'clu-1', status: 'RUNNING', instances: [{ id: 'ins-1', status: 'RUNNING' }] });
			expect(getRestartState('clu-1')?.reach).toBe('down');

			// One sent after it is authoritative.
			vi.advanceTimersByTime(5_000);
			syncRestartsFromCluster({ id: 'clu-1', status: 'RUNNING', instances: [{ id: 'ins-1', status: 'RUNNING' }] });
			expect(getRestartState('clu-1')).toBeUndefined();
		});

		it('does not let a slower, older response resurrect a restart a newer one cleared', () => {
			const olderRequest = Date.now();
			vi.advanceTimersByTime(10);
			const newerRequest = Date.now();
			syncRestartsFromCluster(
				{ id: 'clu-1', status: 'RUNNING', instances: [{ id: 'ins-1', status: 'RUNNING' }] },
				newerRequest,
			);
			syncRestartsFromCluster(
				{ id: 'clu-1', status: 'RESTARTING', instances: [{ id: 'ins-1', status: 'RESTARTING' }] },
				olderRequest,
			);
			expect(getRestartState('clu-1')).toBeUndefined();
			expect(getRestartState('ins-1')).toBeUndefined();
		});

		it('orders two reads sent in the same millisecond by when they were sent', () => {
			const sentFirst = nextObservationStamp();
			const sentSecond = nextObservationStamp();
			syncRestartsFromCluster(
				{ id: 'clu-1', status: 'RUNNING', instances: [{ id: 'ins-1', status: 'RUNNING' }] },
				sentSecond,
			);
			syncRestartsFromCluster(
				{ id: 'clu-1', status: 'RESTARTING', instances: [{ id: 'ins-1', status: 'RESTARTING' }] },
				sentFirst,
			);
			expect(getRestartState('clu-1')).toBeUndefined();
			expect(getRestartState('ins-1')).toBeUndefined();
		});

		it('does not let an older response overwrite a newer restart', () => {
			const olderRequest = Date.now();
			vi.advanceTimersByTime(10);
			markContainerOpAccepted({
				clusterId: 'clu-1',
				instanceIds: ['ins-1', 'ins-2'],
				label: 'Restarting',
				allAtOnce: true,
			});
			syncRestartsFromCluster(
				{
					id: 'clu-1',
					status: 'RESTARTING',
					instances: [{ id: 'ins-1', status: 'RUNNING' }, { id: 'ins-2', status: 'RESTARTING' }],
				},
				olderRequest,
			);
			expect(getRestartState('clu-1')?.reach).toBe('down');
			expect(getRestartState('ins-1')?.reach).toBe('down');
		});
	});

	describe('markContainerOpAccepted', () => {
		it("holds a rolling op's instances for proxied clients until the sync says which one is restarting", () => {
			markContainerOpAccepted({
				clusterId: 'clu-1',
				instanceIds: ['ins-1', 'ins-2'],
				label: 'Restarting',
				allAtOnce: false,
			});
			expect(getRestartState('clu-1')?.reach).toBe('rolling');
			expect(holdsRequests(getRestartState('ins-1'), { proxied: true })).toBe(true);
			expect(holdsRequests(getRestartState('ins-1'), { proxied: false })).toBe(false);

			vi.advanceTimersByTime(5_000);
			syncRestartsFromCluster({
				id: 'clu-1',
				status: 'RESTARTING',
				instances: [{ id: 'ins-1', status: 'RUNNING' }, { id: 'ins-2', status: 'RESTARTING' }],
			});
			expect(getRestartState('ins-1')).toBeUndefined();
			expect(getRestartState('ins-2')?.reach).toBe('down');
		});
	});
});
