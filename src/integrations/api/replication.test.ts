import {
	acknowledgedReplicationNodes,
	isReplicatedResponseFailure,
	isReplicatedResponseSuccess,
	rejectReplicationFailures,
	type ReplicatedResponse,
	type ReplicatedResponseFailure,
	type ReplicatedResponseSuccess,
	replicationFailed,
} from '@/integrations/api/replication';
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

	it('names the failed share of peers when exactly 1 of 2 failed', async () => {
		const resp = makeAxiosResponse({
			message: 'partial',
			replicated: [success('a'), failure('b', 'network error')],
		});
		await expect(Promise.resolve(rejectReplicationFailures(resp))).rejects.toBe(
			'Failed to replicate to 1 of 2 peer nodes:\n'
				+ 'b: network error',
		);
	});

	it('names the failed share of peers when several failed', async () => {
		const resp = makeAxiosResponse({
			message: 'partial',
			replicated: [success('a'), failure('b', 'timeout'), failure('c', 'disk full')],
		});
		await expect(Promise.resolve(rejectReplicationFailures(resp))).rejects.toBe(
			'Failed to replicate to 2 of 3 peer nodes:\n'
				+ 'b: timeout\n'
				+ 'c: disk full',
		);
	});

	it('names the peer when the only peer failed', async () => {
		const resp = makeAxiosResponse({
			message: 'failed',
			replicated: [failure('solo', 'kernel panic')],
		});
		await expect(Promise.resolve(rejectReplicationFailures(resp))).rejects.toBe(
			'Failed to replicate to the peer node:\n'
				+ 'solo: kernel panic',
		);
	});

	it('names every peer when all of them failed', async () => {
		const resp = makeAxiosResponse({
			message: 'failed',
			replicated: [failure('n1', 'OOM'), failure('n2', 'quota exceeded'), failure('n3', 'permission denied')],
		});
		await expect(Promise.resolve(rejectReplicationFailures(resp))).rejects.toBe(
			'Failed to replicate to all 3 peer nodes:\n'
				+ 'n1: OOM\n'
				+ 'n2: quota exceeded\n'
				+ 'n3: permission denied',
		);
	});
});

describe('acknowledgedReplicationNodes', () => {
	it('names every peer that applied the operation, lower-cased', () => {
		expect(
			acknowledgedReplicationNodes({ message: 'ok', replicated: [answered('Node-A.example.com'), answered('node-b')] }),
		)
			.toEqual(new Set(['node-a.example.com', 'node-b']));
	});

	it('leaves out failed peers', () => {
		expect(
			acknowledgedReplicationNodes({ message: 'ok', replicated: [answered('node-a'), failure('node-b', 'timeout')] }),
		)
			.toEqual(new Set(['node-a']));
	});

	it.each([
		['no replicated array', { message: 'ok' }],
		['a non-array replicated', { message: 'ok', replicated: 'yes' }],
		['a bare string', 'Configuration successfully set.'],
		['undefined', undefined],
		['null', null],
		[
			'entries with no usable node name',
			{ message: 'ok', replicated: [null, 7, {}, { node: '', message: 'ok' }, { node: 42, message: 'ok' }] },
		],
		['entries with no answer from the peer', {
			message: 'ok',
			replicated: [{ node: 'node-a' }, { node: 'node-b', requestId: 1 }],
		}],
		['entries whose answer is not a message', {
			message: 'ok',
			replicated: [{ node: 'a', message: {} }, { node: 'b', message: 0 }, { node: 'c', message: true }, {
				node: 'd',
				message: '',
			}],
		}],
	])('reads %s as reaching no one', (_label, response) => {
		expect(acknowledgedReplicationNodes(response)).toEqual(new Set());
	});
});

function answered(node: string): ReplicatedResponseSuccess {
	return success(node, 1, 'Configuration successfully set.');
}

function success(node: string, requestId = 1, message: boolean | string = true): ReplicatedResponseSuccess {
	return { node, requestId, message };
}

function failure(node: string, reason: string): ReplicatedResponseFailure {
	return { node, reason, status: 'failed' };
}
