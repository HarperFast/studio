import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { describe, expect, it } from 'vitest';
import { describeRecordJsonError, formatRecordJson, tryParseRecordJson } from './recordEditorJson';

describe('tryParseRecordJson', () => {
	it('returns an error rather than throwing for malformed JSON', () => {
		const parsed = tryParseRecordJson('{"id":1,}');
		expect(parsed.ok).toBe(false);
		expect(parsed.ok === false && parsed.error.message).toBeTruthy();
	});

	it('rejects an oversized malformed buffer without throwing', () => {
		// Nothing validates the buffer as it is typed, so a large malformed paste reaches the
		// submit-time parse — which has to catch it rather than throw an uncaught SyntaxError.
		const huge = `{"blob":"${'x'.repeat(MAX_WORKER_MODEL_CHARS)}`; // unterminated
		expect(huge.length).toBeGreaterThan(MAX_WORKER_MODEL_CHARS);
		expect(tryParseRecordJson(huge).ok).toBe(false);
	});

	it('locates the syntax error, so the editor can mark it', () => {
		const record = '[\n    {\n        "name": "Ada",\n        "city" "London"\n    }\n]';
		const parsed = tryParseRecordJson(record);

		expect(parsed.ok).toBe(false);
		// The offending `"London"` is on line 4; the engine may report the spot as a line/column
		// pair or as a character offset, and both must land on the same line.
		expect(parsed.ok === false && parsed.error.location?.lineNumber).toBe(4);
	});

	it('drops the position the engine already put in its message, so it is not said twice', () => {
		const parsed = tryParseRecordJson('[\n    {\n        "a": 1,\n    }\n]');

		expect(parsed.ok).toBe(false);
		expect(parsed.ok === false && parsed.error.message).not.toMatch(/position|line \d+ column/i);
	});

	it('drops it from trailing-content errors too, which V8 words "after JSON at position"', () => {
		const parsed = tryParseRecordJson('{"a": 1}}');

		expect(parsed.ok === false && parsed.error.message).toBe('Unexpected non-whitespace character after JSON');
		expect(parsed.ok === false && parsed.error.location).toEqual({ lineNumber: 1, column: 9 });
	});

	// These go to the ops API as `records`, so a primitive parses cleanly and then fails on the
	// wire in the server's wording. Say it here, where the user can act on it.
	it('rejects JSON that is well-formed but could never be a record', () => {
		for (const notARecord of ['42', 'true', 'null', '"a string"']) {
			const parsed = tryParseRecordJson(notARecord);
			expect(parsed.ok).toBe(false);
			expect(parsed.ok === false && parsed.error.message).toContain('JSON object');
		}
	});

	it('names which item of an array is not a record', () => {
		const parsed = tryParseRecordJson('[{"id":1},7]');

		expect(parsed.ok).toBe(false);
		expect(parsed.ok === false && parsed.error.message).toContain('Item 2');
	});

	it('takes a lone record as well as a list of them', () => {
		expect(tryParseRecordJson('{"id":1}')).toEqual({ ok: true, value: { id: 1 } });
		expect(tryParseRecordJson('[{"id":1},{"id":2}]')).toEqual({ ok: true, value: [{ id: 1 }, { id: 2 }] });
		// Nothing to update, but nothing malformed either.
		expect(tryParseRecordJson('[]')).toEqual({ ok: true, value: [] });
	});

	it('explains an emptied editor instead of reporting truncated JSON', () => {
		// `JSON.parse('')` says "Unexpected end of JSON input", which reads like a cut-off record.
		for (const empty of ['', '   \n  ']) {
			const parsed = tryParseRecordJson(empty);
			expect(parsed.ok).toBe(false);
			expect(parsed.ok === false && parsed.error.message).toContain('empty');
			expect(parsed.ok === false && parsed.error.location).toBeUndefined();
		}
	});
});

describe('describeRecordJsonError', () => {
	it('names the location when there is one', () => {
		expect(describeRecordJsonError({ message: 'Unterminated string', location: { lineNumber: 4, column: 12 } }))
			.toBe('Line 4, column 12: Unterminated string');
	});

	it('falls back to the reason alone when the engine reported no position', () => {
		expect(describeRecordJsonError({ message: 'Unexpected end of JSON input' }))
			.toBe('Unexpected end of JSON input');
	});
});

describe('formatRecordJson', () => {
	// The contract is JSON.stringify's own (which writes -0 as 0), not the value's.
	const roundTrips = (value: unknown) =>
		expect(JSON.parse(formatRecordJson(value))).toEqual(JSON.parse(JSON.stringify(value)));

	it('puts an array of numbers on one line, and indents everything else as JSON.stringify does', () => {
		const records = [{ id: 'a', embedding: [0.1, -2, 3], tags: ['x', 'y'], nested: { at: [1] } }];
		expect(formatRecordJson(records)).toBe(
			[
				'[',
				'    {',
				'        "id": "a",',
				'        "embedding": [0.1, -2, 3],',
				'        "tags": [',
				'            "x",',
				'            "y"',
				'        ],',
				'        "nested": {',
				'            "at": [1]',
				'        }',
				'    }',
				']',
			].join('\n'),
		);
		roundTrips(records);
	});

	it('keeps every number exactly, in the form JSON.stringify writes it', () => {
		const embedding = [1.1e-7, 1e21, -0, 0, -1.5e-300, 123456789.123, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE];
		const formatted = formatRecordJson([{ embedding }]);
		expect(formatted).toContain(
			'"embedding": [1.1e-7, 1e+21, 0, 0, -1.5e-300, 123456789.123, 9007199254740991, 5e-324]',
		);
		roundTrips([{ embedding }]);
	});

	it('leaves alone an array that holds anything but numbers, nested arrays included', () => {
		const records = [{ mixed: [1, 'two', 3], withNull: [1, null], matrix: [[1, 2], [3, 4]], empty: [] }];
		const formatted = formatRecordJson(records);
		expect(formatted).toContain('"mixed": [\n            1,\n            "two",\n            3\n        ]');
		expect(formatted).toContain('"withNull": [\n            1,\n            null\n        ]');
		// Each row of a matrix is an array of numbers, so the rows fold and the matrix doesn't.
		expect(formatted).toContain('"matrix": [\n            [1, 2],\n            [3, 4]\n        ]');
		expect(formatted).toContain('"empty": []');
		roundTrips(records);
	});

	it('never rewrites a string, or a key, that holds brackets and numbers', () => {
		const records = [{
			'a[1,2]': 'see [1,2] and [3,\t4]',
			quoted: 'ends with a [',
			numbers: [5, 6],
			closing: '] 7, 8 [',
			'k]': [9],
		}];
		const formatted = formatRecordJson(records);
		expect(formatted).toContain('"a[1,2]": "see [1,2] and [3,\\t4]"');
		expect(formatted).toContain('"quoted": "ends with a ["');
		expect(formatted).toContain('"numbers": [5, 6]');
		expect(formatted).toContain('"closing": "] 7, 8 ["');
		expect(formatted).toContain('"k]": [9]');
		roundTrips(records);
	});

	it('stays linear on a long vector that turns out not to be all numbers', () => {
		const almost = [...Array.from({ length: 20_000 }, (_, index) => index / 7), null];
		const started = performance.now();
		const formatted = formatRecordJson([{ almost }]);
		expect(performance.now() - started).toBeLessThan(500);
		expect(formatted.split('\n').length).toBeGreaterThan(20_000);
		roundTrips([{ almost }]);
	});
});
