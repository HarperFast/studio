import { expect, test } from '@playwright/test';
import { deleteMessagesSentTo } from './mail';

function fakeMessages(ids: string[], { failingIds = [] as string[] } = {}) {
	const calls: unknown[][] = [];
	const messages = {
		search: async (...args: unknown[]) => {
			calls.push(['search', ...args]);
			return { items: ids.map((id) => ({ id, type: 'Email' as const })) };
		},
		del: async (id: string) => {
			calls.push(['del', id]);
			if (failingIds.includes(id)) { throw new Error(`delete ${id} failed`); }
		},
	} satisfies Parameters<typeof deleteMessagesSentTo>[0];
	return { messages, calls };
}

test('deletes exactly the messages sent to the address', async () => {
	const { messages, calls } = fakeMessages(['msg-1', 'msg-2']);

	await expect(deleteMessagesSentTo(messages, 'abcd1234', 'run-1@abcd1234.mailosaur.net')).resolves.toBe(2);
	expect(calls).toEqual([
		[
			'search',
			'abcd1234',
			{ sentTo: 'run-1@abcd1234.mailosaur.net' },
			expect.not.objectContaining({ timeout: expect.anything() }),
		],
		['del', 'msg-1'],
		['del', 'msg-2'],
	]);
});

test('deletes nothing when no mail reached the address', async () => {
	const { messages, calls } = fakeMessages([]);

	await expect(deleteMessagesSentTo(messages, 'abcd1234', 'run-2@abcd1234.mailosaur.net')).resolves.toBe(0);
	expect(calls).toHaveLength(1);
});

test('still deletes the rest when one delete fails, then reports it', async () => {
	const { messages, calls } = fakeMessages(['msg-1', 'msg-2'], { failingIds: ['msg-1'] });

	await expect(deleteMessagesSentTo(messages, 'abcd1234', 'run-3@abcd1234.mailosaur.net')).rejects.toThrow(
		'1 of 2 messages sent to run-3@abcd1234.mailosaur.net were not deleted',
	);
	expect(calls).toContainEqual(['del', 'msg-2']);
});
