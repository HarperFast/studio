import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { describe, expect, it } from 'vitest';
import { describeRecordJsonError, tryParseRecordJson } from './recordEditorJson';

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
