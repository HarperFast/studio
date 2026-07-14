import { canAdmitExtraLib, MAX_EXTRA_LIB_CHARS_TOTAL, MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { describe, expect, it } from 'vitest';

describe('canAdmitExtraLib (HarperFast/studio#1499)', () => {
	it('admits a normal declaration when the budget is empty', () => {
		expect(canAdmitExtraLib(0, 10_000)).toBe(true);
	});

	it('admits a declaration that exactly fills the remaining budget', () => {
		expect(canAdmitExtraLib(MAX_EXTRA_LIB_CHARS_TOTAL - 100, 100)).toBe(true);
	});

	it('rejects a single oversized declaration even into an empty budget', () => {
		// A lib past the per-file worker limit would itself risk the clone crash.
		expect(canAdmitExtraLib(0, MAX_WORKER_MODEL_CHARS + 1)).toBe(false);
	});

	it('rejects a declaration that would push the running total past the budget', () => {
		// The accumulation case: each file is individually fine, but the session
		// total has reached the cap — the next one must be turned away rather than
		// cloned to the worker.
		expect(canAdmitExtraLib(MAX_EXTRA_LIB_CHARS_TOTAL - 50, 51)).toBe(false);
	});

	it('rejects everything once the budget is already spent', () => {
		expect(canAdmitExtraLib(MAX_EXTRA_LIB_CHARS_TOTAL, 1)).toBe(false);
	});
});
