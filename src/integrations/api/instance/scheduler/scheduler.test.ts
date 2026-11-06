import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { getSchedulerLogQueryOptions, readOnFrom, SCHEDULER_LOG_LIMIT } from './scheduler';

function lines(count: number, firstSecond: number, node?: string): ReadLogItem[] {
	return Array.from({ length: count }, (_, index) => ({
		timestamp: new Date(Date.UTC(2026, 10, 5) + (firstSecond + index) * 1000).toISOString(),
		level: 'warn',
		thread: 'main/0',
		tags: ['scheduler'],
		node: node as string,
		message: `Job job:app:a failed after 1ms: run ${firstSecond + index}`,
	}));
}

const newest = (items: readonly ReadLogItem[]) =>
	items.reduce((at, line) => (line.timestamp > at ? line.timestamp : at), '');

async function readLog(answers: (from: string | undefined) => ReadLogItem[]) {
	const post = vi.fn(async (_url: string, body: { from?: string }) => ({ data: answers(body.from) }));
	const options = getSchedulerLogQueryOptions({
		instanceClient: { post } as never,
		entityId: 'instance-1',
		entityType: 'instance',
		enabled: true,
	});
	const result = await new QueryClient().fetchQuery(options);
	return { result, froms: post.mock.calls.map(([, body]) => body.from) };
}

describe('the scheduler log read', () => {
	it('reads on from the newest line when Harper stops at the limit before the end of its tail', async () => {
		// Harper hands back the oldest SCHEDULER_LOG_LIMIT matches of its tail, and the 600 newer ones only on a read from.
		const tail = lines(SCHEDULER_LOG_LIMIT + 600, 0);
		const first = tail.slice(0, SCHEDULER_LOG_LIMIT);
		const { result, froms } = await readLog((from) =>
			from === undefined ? first : tail.filter((line) => line.timestamp >= from).slice(0, SCHEDULER_LOG_LIMIT)
		);
		expect(froms).toEqual([undefined, newest(first)]);
		expect(newest(result)).toBe(newest(tail));
	});

	it('makes one read when Harper ran out of lines first', async () => {
		const { froms } = await readLog(() => lines(SCHEDULER_LOG_LIMIT - 1, 0));
		expect(froms).toEqual([undefined]);
	});

	it('stops when a read on brings back the same lines', async () => {
		const sameSecond = lines(SCHEDULER_LOG_LIMIT, 0).map((line) => ({ ...line, timestamp: lines(1, 0)[0].timestamp }));
		const { froms } = await readLog(() => sameSecond);
		expect(froms).toEqual([undefined, sameSecond[0].timestamp]);
	});
});

describe('the scheduler log query', () => {
	const params = { entityId: 'instance-1', entityType: 'instance' as const, enabled: true };

	it('hands its signal to every read, so a cancelled refresh doesn’t go on scanning the log', async () => {
		let finishFirst!: (data: ReadLogItem[]) => void;
		const post = vi.fn((_url: string, body: { from?: string }, _config?: { signal?: AbortSignal }) =>
			body.from === undefined
				? new Promise((resolve) => {
					finishFirst = (data) => resolve({ data });
				})
				: Promise.resolve({ data: [] })
		);
		const client = new QueryClient();
		const options = getSchedulerLogQueryOptions({ ...params, instanceClient: { post } as never });
		const fetching = client.fetchQuery(options).catch(() => undefined);
		await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
		await client.cancelQueries({ queryKey: options.queryKey });
		finishFirst(lines(SCHEDULER_LOG_LIMIT, 0));
		await fetching;
		await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
		expect(post.mock.calls[1][2]?.signal?.aborted).toBe(true);
	});
});

describe('readOnFrom', () => {
	it('reads on from the node furthest behind among those that filled the limit', () => {
		const ahead = lines(SCHEDULER_LOG_LIMIT, 500, 'node-a');
		const behind = lines(SCHEDULER_LOG_LIMIT, 0, 'node-b');
		const done = lines(10, 0, 'node-c');
		expect(readOnFrom([...ahead, ...behind, ...done])).toBe(newest(behind));
		expect(readOnFrom([...ahead.slice(1), ...behind.slice(1), ...done])).toBeUndefined();
	});
});
