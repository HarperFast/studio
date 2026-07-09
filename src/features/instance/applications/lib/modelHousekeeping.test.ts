// Regression coverage for HarperFast/studio#1407 — Monaco model housekeeping.
// Unbounded/undisposed models are a listener leak (Monaco warns at 200 live
// models) and can OOM the language worker via eager model sync.
import { describe, expect, it } from 'vitest';
import {
	ApplicationModelLike,
	enforceModelCeiling,
	MAX_APPLICATION_MODEL_CHARS_TOTAL,
	MAX_LIVE_APPLICATION_MODELS,
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
	it('disposes detached file models outside the kept prefix', () => {
		const stale = fakeModel('file:///old-app/src/counter.ts');
		const kept = fakeModel('file:///my-app/src/index.ts');
		const swept = sweepStaleApplicationModels([stale, kept], 'file:///my-app/');
		expect(swept).toBe(1);
		expect(stale.disposed).toBe(true);
		expect(kept.disposed).toBe(false);
	});

	it('never disposes a model attached to an editor', () => {
		const attached = fakeModel('file:///old-app/src/counter.ts', true);
		expect(sweepStaleApplicationModels([attached], 'file:///my-app/')).toBe(0);
		expect(attached.disposed).toBe(false);
	});

	it('never touches non-file schemes (modals, the config editor)', () => {
		const config = fakeModel('inmemory://harper/config-root.json');
		const anonymous = fakeModel('inmemory://model/1');
		expect(sweepStaleApplicationModels([config, anonymous], undefined)).toBe(0);
		expect(config.disposed).toBe(false);
		expect(anonymous.disposed).toBe(false);
	});

	it('disposes every detached file model when no prefix is kept', () => {
		// The unmount case: nothing is owned any more.
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
		expect(sweepStaleApplicationModels([lookalike], 'file:///my-app/')).toBe(1);
		expect(lookalike.disposed).toBe(true);
	});

	it('matches percent-encoded prefixes the way model URIs are encoded', () => {
		// `uri.toString()` percent-encodes, so callers must build keepPrefix via
		// `monaco.Uri` (projectUriPrefix) — this documents the encoded contract.
		const kept = fakeModel('file:///my%20app/src/index.ts');
		expect(sweepStaleApplicationModels([kept], 'file:///my%20app/')).toBe(0);
		expect(kept.disposed).toBe(false);
	});
});

describe('selectFilesWithinModelBudget', () => {
	it('registers everything for a typical project', () => {
		const files = Array.from({ length: 40 }, (_, i) => ({ content: `export const x${i} = ${i};` }));
		const { selected, dropped } = selectFilesWithinModelBudget(files, 1, 100);
		expect(selected).toHaveLength(40);
		expect(dropped).toBe(0);
	});

	it('caps the model count, counting models already alive', () => {
		const files = Array.from({ length: MAX_LIVE_APPLICATION_MODELS + 50 }, () => ({ content: 'x' }));
		const alreadyLive = 10;
		const { selected, dropped } = selectFilesWithinModelBudget(files, alreadyLive, 0);
		expect(selected).toHaveLength(MAX_LIVE_APPLICATION_MODELS - alreadyLive);
		expect(dropped).toBe(files.length - selected.length);
	});

	it('keeps the model count below the 200-listener leak warning threshold', () => {
		expect(MAX_LIVE_APPLICATION_MODELS).toBeLessThan(200);
	});

	it('caps the total characters handed to the language worker', () => {
		const big = 'x'.repeat(MAX_APPLICATION_MODEL_CHARS_TOTAL / 2 + 1);
		const files = [{ content: big }, { content: big }, { content: 'small' }];
		const { selected, dropped } = selectFilesWithinModelBudget(files, 0, 0);
		// The second big file overflows the budget; the small one still fits.
		expect(selected).toEqual([files[0], files[2]]);
		expect(dropped).toBe(1);
	});

	it('counts characters already held by live models against the budget', () => {
		// Already-live models each under the per-file cap can still sum near the
		// total budget; a new batch must not stack another full budget on top.
		const files = [{ content: 'x'.repeat(1024) }];
		const { selected, dropped } = selectFilesWithinModelBudget(files, 1, MAX_APPLICATION_MODEL_CHARS_TOTAL - 10);
		expect(selected).toHaveLength(0);
		expect(dropped).toBe(1);
	});
});

describe('enforceModelCeiling', () => {
	it('does nothing while at or under the ceiling', () => {
		const models = [fakeModel('file:///my-app/a.ts'), fakeModel('file:///my-app/b.ts')];
		expect(enforceModelCeiling(models, 'file:///my-app/b.ts', 2)).toBe(0);
		expect(models.some(model => model.disposed)).toBe(false);
	});

	it('retires the oldest detached models when the ceiling is exceeded', () => {
		const oldest = fakeModel('file:///my-app/a.ts');
		const middle = fakeModel('file:///my-app/b.ts');
		const created = fakeModel('file:///my-app/c.ts');
		expect(enforceModelCeiling([oldest, middle, created], 'file:///my-app/c.ts', 2)).toBe(1);
		expect(oldest.disposed).toBe(true);
		expect(middle.disposed).toBe(false);
		expect(created.disposed).toBe(false);
	});

	it('never retires the just-created model or attached models', () => {
		// The just-created model is still detached when onDidCreateModel fires,
		// so it must be excluded explicitly.
		const attached = fakeModel('file:///my-app/open.ts', true);
		const created = fakeModel('file:///my-app/new.ts');
		expect(enforceModelCeiling([attached, created], 'file:///my-app/new.ts', 1)).toBe(0);
		expect(attached.disposed).toBe(false);
		expect(created.disposed).toBe(false);
	});

	it('ignores non-file schemes both for counting and retiring', () => {
		const config = fakeModel('inmemory://harper/config-root.json');
		const a = fakeModel('file:///my-app/a.ts');
		const b = fakeModel('file:///my-app/b.ts');
		expect(enforceModelCeiling([config, a, b], 'file:///my-app/b.ts', 2)).toBe(0);
		expect(config.disposed).toBe(false);
	});
});
