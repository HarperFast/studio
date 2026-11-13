import { describe, expect, it } from 'vitest';
import { readResponseRefusal } from './readResponseRefusal';

function answer(body: string): Response {
	return new Response(body, { status: 400 });
}

describe('readResponseRefusal', () => {
	it.each([
		['{"error":"no such project"}', 'no such project'],
		['{"message":"bad request"}', 'bad request'],
		['{"type":"about:blank","title":"Forbidden","detail":"not allowed"}', 'not allowed'],
		['{"title":"Forbidden"}', 'Forbidden'],
		['{"error":{"message":"nested"}}', 'nested'],
		['plain words', 'plain words'],
		['{"unrelated":1}', '{"unrelated":1}'],
	])('%s → %s', async (body, expected) => {
		expect(await readResponseRefusal(answer(body))).toBe(expected);
	});

	it('says nothing for an empty body', async () => {
		expect(await readResponseRefusal(answer('  '))).toBeUndefined();
	});

	it('caps a long answer', async () => {
		expect((await readResponseRefusal(answer('x'.repeat(5000))))?.length).toBe(1000);
	});
});
