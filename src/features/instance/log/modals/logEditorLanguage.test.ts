import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { describe, expect, it } from 'vitest';
import { chooseLogEditorLanguage } from './logEditorLanguage';

describe('chooseLogEditorLanguage', () => {
	it('uses json highlighting for a small JSON message', () => {
		expect(chooseLogEditorLanguage('{"level":"info","msg":"started"}')).toBe('json');
	});

	it('falls back to plaintext for non-JSON messages', () => {
		expect(chooseLogEditorLanguage('plain log line, not json')).toBe('plaintext');
	});

	it('treats an empty or nullish message as plaintext', () => {
		expect(chooseLogEditorLanguage('')).toBe('plaintext');
		expect(chooseLogEditorLanguage(undefined)).toBe('plaintext');
		expect(chooseLogEditorLanguage(null)).toBe('plaintext');
	});

	it('renders an oversized JSON message as plaintext to avoid the worker OOM', () => {
		// Valid JSON that exceeds the worker clone limit: a string literal padded
		// past MAX_WORKER_MODEL_CHARS. Without the size guard this would be sent to
		// the json worker and can crash it with a DataCloneError.
		const huge = JSON.stringify({ msg: 'x'.repeat(MAX_WORKER_MODEL_CHARS + 1) });
		expect(huge.length).toBeGreaterThan(MAX_WORKER_MODEL_CHARS);
		expect(isJson(huge)).toBe(true);
		expect(chooseLogEditorLanguage(huge)).toBe('plaintext');
	});

	it('keeps json highlighting right up to the size limit', () => {
		// A JSON message whose length is exactly the limit is still safe.
		const padTarget = MAX_WORKER_MODEL_CHARS - '{"msg":""}'.length;
		const atLimit = JSON.stringify({ msg: 'x'.repeat(padTarget) });
		expect(atLimit.length).toBe(MAX_WORKER_MODEL_CHARS);
		expect(chooseLogEditorLanguage(atLimit)).toBe('json');
	});
});

function isJson(value: string): boolean {
	try {
		JSON.parse(value);
		return true;
	} catch {
		return false;
	}
}
