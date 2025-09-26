import {
	isReplicatedResponseFailure,
	isReplicatedResponseSuccess,
	rejectReplicationFailures,
	type ReplicatedResponse,
	type ReplicatedResponseFailure,
	type ReplicatedResponseSuccess,
	replicationFailed,
} from '@/lib/api/replication';
import { describe, expect, it } from 'vitest';

describe('replication type guards', () => {
	it('isReplicatedResponseSuccess returns true for success object', () => {
		const s = success('node-a');
		expect(isReplicatedResponseSuccess(s)).toBe(true);
	});

	it('isReplicatedResponseSuccess returns false for failure object', () => {
		const f = failure('node-b', 'boom');
		expect(isReplicatedResponseSuccess(f)).toBe(false);
	});

	it('isReplicatedResponseFailure returns true for failure object', () => {
		const f = failure('node-c', 'nope');
		expect(isReplicatedResponseFailure(f)).toBe(true);
	});

	it('isReplicatedResponseFailure returns false for success object', () => {
		const s = success('node-d');
		expect(isReplicatedResponseFailure(s)).toBe(false);
	});
});

describe('replicationFailed', () => {
	it('returns false when replicated is missing', () => {
		const resp: ReplicatedResponse = { message: 'ok' };
		expect(replicationFailed(resp)).toBe(false);
	});

	it('returns false when replicated is empty', () => {
		const resp: ReplicatedResponse = { message: 'ok', replicated: [] };
		expect(replicationFailed(resp)).toBe(false);
	});

	it('returns false when all nodes succeeded', () => {
		const resp: ReplicatedResponse = {
			message: 'ok',
			replicated: [success('n1'), success('n2')],
		};
		expect(replicationFailed(resp)).toBe(false);
	});

	it('returns true when at least one node failed', () => {
		const resp: ReplicatedResponse = {
			message: 'partial',
			replicated: [success('n1'), failure('n2', 'disk full')],
		};
		expect(replicationFailed(resp)).toBe(true);
	});
});

describe('rejectReplicationFailures', () => {
	function makeAxiosResponse(data: ReplicatedResponse) {
		return {
			data,
		};
	}

	it('passes through when replicated is missing', async () => {
		const resp = makeAxiosResponse({ message: 'ok' });
		await expect(Promise.resolve(rejectReplicationFailures(resp))).resolves.toBe(resp);
	});

	it('passes through when all nodes succeeded', async () => {
		const resp = makeAxiosResponse({
			message: 'ok',
			replicated: [success('a'), success('b')],
		});
		await expect(Promise.resolve(rejectReplicationFailures(resp))).resolves.toBe(resp);
	});

	it('rejects with partial success message (singular) when exactly 1 node failed', async () => {
		const resp = makeAxiosResponse({
			message: 'partial',
			replicated: [success('a'), failure('b', 'network error')],
		});
		await expect(Promise.resolve(rejectReplicationFailures(resp))).rejects.toBe(
			'The operation partially succeeded, but 1 node failed:\n' +
			'b: network error',
		);
	});

	it('rejects with partial success message (plural) when multiple nodes failed', async () => {
		const resp = makeAxiosResponse({
			message: 'partial',
			replicated: [success('a'), failure('b', 'timeout'), failure('c', 'disk full')],
		});
		await expect(Promise.resolve(rejectReplicationFailures(resp))).rejects.toBe(
			'The operation partially succeeded, but 2 nodes failed:\n' +
			'b: timeout\n' +
			'c: disk full',
		);
	});

	it('rejects with single-node failure message when only one node and it failed', async () => {
		const resp = makeAxiosResponse({
			message: 'failed',
			replicated: [failure('solo', 'kernel panic')],
		});
		await expect(Promise.resolve(rejectReplicationFailures(resp))).rejects.toBe(
			'The operation failed on the single node:\n' +
			'solo: kernel panic',
		);
	});

	it('rejects with all-nodes failure message when all nodes failed', async () => {
		const resp = makeAxiosResponse({
			message: 'failed',
			replicated: [failure('n1', 'OOM'), failure('n2', 'quota exceeded'), failure('n3', 'permission denied')],
		});
		await expect(Promise.resolve(rejectReplicationFailures(resp))).rejects.toBe(
			'The operation failed on all 3 nodes:\n' +
			'n1: OOM\n' +
			'n2: quota exceeded\n' +
			'n3: permission denied',
		);
	});
});

function success(node: string, requestId = 1, message = true): ReplicatedResponseSuccess {
	return { node, requestId, message };
}

function failure(node: string, reason: string): ReplicatedResponseFailure {
	return { node, reason, status: 'failed' };
}
