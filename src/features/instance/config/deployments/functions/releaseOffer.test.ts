import { describe, expect, it } from 'vitest';
import { releaseOffer } from './releaseOffer';

const fromRecords = { intent: 'rollback' as const, offer: true };

describe('releaseOffer', () => {
	it('goes by the records alone where Harper cannot be asked, and otherwise offers nothing', () => {
		for (const check of [{ kind: 'unsupported' as const }, { kind: 'unreadable' as const, message: 'x' }]) {
			expect(releaseOffer(check, fromRecords, true)).toEqual({ ...fromRecords, disabled: false });
			expect(releaseOffer(check, fromRecords, false)).toMatchObject({ offer: false });
		}
	});

	it('holds the action back while it asks, and shows none it may not offer', () => {
		expect(releaseOffer({ kind: 'checking' }, fromRecords, true)).toEqual({ ...fromRecords, disabled: true });
		expect(releaseOffer({ kind: 'checking' }, fromRecords, false)).toMatchObject({ offer: false, disabled: true });
	});

	it('offers nothing for a release live on every node, whatever the records say', () => {
		expect(releaseOffer({ kind: 'live-everywhere' }, fromRecords, true).offer).toBe(false);
	});

	it('activates again a release live on some nodes, and keeps the intent where it is live on none', () => {
		expect(releaseOffer({ kind: 'available', liveOn: ['a'] }, { intent: 'activate', offer: false }, true)).toEqual({
			intent: 'again',
			offer: true,
			disabled: false,
		});
		expect(releaseOffer({ kind: 'available', liveOn: [] }, fromRecords, false)).toEqual({
			...fromRecords,
			disabled: false,
		});
	});

	it('shows, but refuses, a release some node holds no copy of', () => {
		expect(releaseOffer({ kind: 'missing', liveOn: [], missing: ['c'], unreadable: [] }, fromRecords, true)).toEqual({
			...fromRecords,
			disabled: true,
		});
	});
});
