import { ExtraLibBudget, MAX_EXTRA_LIB_CHARS_TOTAL, MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { describe, expect, it } from 'vitest';

/**
 * Admit declarations up to exactly the aggregate cap, using the largest single
 * admissible file (`MAX_WORKER_MODEL_CHARS`) so it takes as few calls as
 * possible. Asserts every one lands and returns the budget at the brink — one
 * more char will overflow it.
 */
function fillToCap(budget: ExtraLibBudget): void {
	let total = 0;
	while (total + MAX_WORKER_MODEL_CHARS <= MAX_EXTRA_LIB_CHARS_TOTAL) {
		expect(budget.admit(MAX_WORKER_MODEL_CHARS).admitted).toBe(true);
		total += MAX_WORKER_MODEL_CHARS;
	}
	const remainder = MAX_EXTRA_LIB_CHARS_TOTAL - total;
	if (remainder > 0) {
		expect(budget.admit(remainder).admitted).toBe(true);
	}
}

describe('ExtraLibBudget (HarperFast/studio#1499)', () => {
	it('admits normal declarations and accumulates their size without sealing', () => {
		const budget = new ExtraLibBudget();
		expect(budget.admit(10_000)).toEqual({ admitted: true, justExhausted: false, oversize: false });
		expect(budget.admit(10_000)).toEqual({ admitted: true, justExhausted: false, oversize: false });
		expect(budget.isSpent).toBe(false);
	});

	it('admits declarations up to exactly the aggregate cap without sealing', () => {
		const budget = new ExtraLibBudget();
		fillToCap(budget);
		// The cap is a ceiling that can be reached, not crossed — reaching it exactly
		// does not spend the budget; only an overflow does.
		expect(budget.isSpent).toBe(false);
	});

	it('rejects a single oversized declaration without spending the budget', () => {
		const budget = new ExtraLibBudget();
		expect(budget.admit(MAX_WORKER_MODEL_CHARS + 1)).toEqual({
			admitted: false,
			justExhausted: false,
			oversize: true,
		});
		expect(budget.isSpent).toBe(false);
		// A file within the per-file limit still fits — an oversize file is not the aggregate cap.
		expect(budget.admit(10_000).admitted).toBe(true);
	});

	it('seals the budget on the first aggregate overflow and flags the transition once', () => {
		const budget = new ExtraLibBudget();
		fillToCap(budget);
		expect(budget.admit(1)).toEqual({ admitted: false, justExhausted: true, oversize: false });
		expect(budget.isSpent).toBe(true);
	});

	it('rejects everything once sealed — even a declaration that would have fit — without re-flagging', () => {
		const budget = new ExtraLibBudget();
		fillToCap(budget);
		budget.admit(1); // overflows and seals (justExhausted: true)
		// A tiny file is now turned away and the exhaustion transition is not re-reported.
		expect(budget.admit(1)).toEqual({ admitted: false, justExhausted: false, oversize: false });
		expect(budget.isSpent).toBe(true);
	});
});
