// Regression coverage for HarperFast/studio#1407 — Monaco model housekeeping.
// Unbounded/undisposed models are a listener leak (Monaco warns at 200 live
// models) and can OOM the language worker via eager model sync.
import { describe, expect, it } from 'vitest';
import {
	ApplicationModelLike,
	MAX_PROJECT_SIBLING_MODELS,
	MAX_SIBLING_MODEL_CHARS_TOTAL,
	selectFilesWithinModelBudget,
	sweepStaleApplicationModels,
} from './modelHousekeeping';

function fakeModel(uri: string, attached = false): ApplicationModelLike & { disposed: boolean } {
	const model = {
		uri: { toString: () => uri },
		isAttachedToEditor: () => attached,
		disposed: false,
		dispose() {
			model.disposed = true;
		},
	};
	return model;
}

describe('sweepStaleApplicationModels', () => {
	it('disposes detached file models outside the kept project', () => {
		const stale = fakeModel('file:///old-app/src/counter.ts');
		const kept = fakeModel('file:///my-app/src/index.ts');
		const swept = sweepStaleApplicationModels([stale, kept], 'my-app');
		expect(swept).toBe(1);
		expect(stale.disposed).toBe(true);
		expect(kept.disposed).toBe(false);
	});

	it('never disposes a model attached to an editor', () => {
		const attached = fakeModel('file:///old-app/src/counter.ts', true);
		expect(sweepStaleApplicationModels([attached], 'my-app')).toBe(0);
		expect(attached.disposed).toBe(false);
	});

	it('never touches non-file schemes (modals, the config editor)', () => {
		const config = fakeModel('inmemory://harper/config-root.json');
		const anonymous = fakeModel('inmemory://model/1');
		expect(sweepStaleApplicationModels([config, anonymous], undefined)).toBe(0);
		expect(config.disposed).toBe(false);
		expect(anonymous.disposed).toBe(false);
	});

	it('disposes every detached file model when no project is kept', () => {
		// The package-browsing / unmount case: nothing is owned any more.
		const models = [
			fakeModel('file:///my-app/src/index.ts'),
			fakeModel('file:///some-package/lib/index.d.ts'),
		];
		expect(sweepStaleApplicationModels(models, undefined)).toBe(2);
		expect(models.every(model => model.disposed)).toBe(true);
	});

	it('does not treat a project-name prefix as project membership', () => {
		// `my-app-2` must not survive a sweep that keeps `my-app`.
		const lookalike = fakeModel('file:///my-app-2/src/index.ts');
		expect(sweepStaleApplicationModels([lookalike], 'my-app')).toBe(1);
		expect(lookalike.disposed).toBe(true);
	});
});

describe('selectFilesWithinModelBudget', () => {
	it('registers everything for a typical project', () => {
		const files = Array.from({ length: 40 }, (_, i) => ({ content: `export const x${i} = ${i};` }));
		const { selected, dropped } = selectFilesWithinModelBudget(files, 1);
		expect(selected).toHaveLength(40);
		expect(dropped).toBe(0);
	});

	it('caps the model count, counting models already alive', () => {
		const files = Array.from({ length: MAX_PROJECT_SIBLING_MODELS + 50 }, () => ({ content: 'x' }));
		const alreadyLive = 10;
		const { selected, dropped } = selectFilesWithinModelBudget(files, alreadyLive);
		expect(selected).toHaveLength(MAX_PROJECT_SIBLING_MODELS - alreadyLive);
		expect(dropped).toBe(files.length - selected.length);
	});

	it('keeps the model count below the 200-listener leak warning threshold', () => {
		expect(MAX_PROJECT_SIBLING_MODELS).toBeLessThan(200);
	});

	it('caps the total characters handed to the language worker', () => {
		const big = 'x'.repeat(MAX_SIBLING_MODEL_CHARS_TOTAL / 2 + 1);
		const files = [{ content: big }, { content: big }, { content: 'small' }];
		const { selected, dropped } = selectFilesWithinModelBudget(files, 0);
		// The second big file overflows the budget; the small one still fits.
		expect(selected).toEqual([files[0], files[2]]);
		expect(dropped).toBe(1);
	});
});
