import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { describe, expect, it } from 'vitest';
import { isRecordJsonProbablyValid, tryParseRecordJson } from './recordEditorJson';

describe('isRecordJsonProbablyValid', () => {
	it('is true for well-formed JSON', () => {
		expect(isRecordJsonProbablyValid('{"id":1,"name":"widget"}')).toBe(true);
		expect(isRecordJsonProbablyValid('[{"id":1},{"id":2}]')).toBe(true);
	});

	it('is false for malformed JSON', () => {
		expect(isRecordJsonProbablyValid('{"id":1,}')).toBe(false);
		expect(isRecordJsonProbablyValid('not json')).toBe(false);
	});

	it('is false for empty or nullish content (nothing to save)', () => {
		expect(isRecordJsonProbablyValid('')).toBe(false);
		expect(isRecordJsonProbablyValid(undefined)).toBe(false);
		expect(isRecordJsonProbablyValid(null)).toBe(false);
	});

	it('does not parse oversized content — defers to the submit-time parse', () => {
		// A malformed buffer past the size limit: parsing it on every keystroke is the
		// cost we avoid, so it is optimistically valid here and left to submit time.
		const huge = `{"blob":"${'x'.repeat(MAX_WORKER_MODEL_CHARS)}`; // deliberately unterminated
		expect(huge.length).toBeGreaterThan(MAX_WORKER_MODEL_CHARS);
		expect(isRecordJsonProbablyValid(huge)).toBe(true);
	});
});

describe('tryParseRecordJson', () => {
	it('returns the parsed value for well-formed JSON', () => {
		expect(tryParseRecordJson('{"id":1}')).toEqual({ ok: true, value: { id: 1 } });
		expect(tryParseRecordJson('[1,2,3]')).toEqual({ ok: true, value: [1, 2, 3] });
	});

	it('returns { ok: false } for malformed JSON rather than throwing', () => {
		expect(tryParseRecordJson('{"id":1,}')).toEqual({ ok: false });
		expect(tryParseRecordJson('')).toEqual({ ok: false });
	});

	it('rejects an oversized malformed buffer without throwing', () => {
		const huge = `{"blob":"${'x'.repeat(MAX_WORKER_MODEL_CHARS)}`; // unterminated
		expect(tryParseRecordJson(huge)).toEqual({ ok: false });
	});
});
