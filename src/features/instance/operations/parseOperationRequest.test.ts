import { parseOperationRequest } from '@/features/instance/operations/parseOperationRequest';
import { describe, expect, it } from 'vitest';

describe('parseOperationRequest', () => {
	it('keeps the typed text, not a re-serialization of it', () => {
		const text = '{ "operation": "search_by_id", "ids": [9007199254740993] }';
		const parsed = parseOperationRequest(text);

		expect(parsed).toEqual({ ok: true, request: { text, operation: 'search_by_id' } });
	});

	it('names where the JSON stopped parsing', () => {
		const parsed = parseOperationRequest('{\n\t"operation": "describe_all",\n}');

		expect(parsed.ok).toBe(false);
		expect(!parsed.ok && parsed.error.location?.lineNumber).toBe(3);
	});

	it.each(['', '   \n\t'])('refuses an empty editor (%j)', (text) => {
		const parsed = parseOperationRequest(text);

		expect(parsed).toEqual({ ok: false, error: { message: 'The editor is empty, so there is nothing to send.' } });
	});

	it.each(['[{"operation":"describe_all"}]', '"describe_all"', 'null', '42'])(
		'refuses %s, which is not a single object',
		(text) => {
			const parsed = parseOperationRequest(text);

			expect(parsed).toEqual({ ok: false, error: { message: 'A request has to be a single JSON object.' } });
		},
	);

	it.each(['{}', '{"operation": 1}', '{"operation": "  "}', '{"op": "describe_all"}'])(
		'refuses %s, which names no operation',
		(text) => {
			const parsed = parseOperationRequest(text);

			expect(parsed.ok).toBe(false);
			expect(!parsed.ok && parsed.error.message).toMatch(/needs an "operation"/);
		},
	);
});
