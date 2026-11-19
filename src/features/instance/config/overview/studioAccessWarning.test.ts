import { describe, expect, it } from 'vitest';
import { listConfigChanges } from './configDraft';
import { corsAccessListAllows, describeStudioAccessWarnings } from './studioAccessWarning';

const ORIGIN = 'https://fabric.harper.fast';

describe('corsAccessListAllows', () => {
	it('matches the way Harper does', () => {
		expect(corsAccessListAllows(['*'], ORIGIN)).toBe(true);
		expect(corsAccessListAllows([ORIGIN], ORIGIN)).toBe(true);
		expect(corsAccessListAllows(ORIGIN, ORIGIN)).toBe(true);
		expect(corsAccessListAllows(['https://*.harper.fast'], ORIGIN)).toBe(true);
		expect(corsAccessListAllows(['https://*.harper.fast'], 'https://a.b.harper.fast')).toBe(false);
		expect(corsAccessListAllows(['http://*.harper.fast'], ORIGIN)).toBe(false);
		expect(corsAccessListAllows(['https://*.fast'], 'https://harper.fast')).toBe(false);
		expect(corsAccessListAllows([], ORIGIN)).toBe(false);
		expect(corsAccessListAllows(null, ORIGIN)).toBe(false);
	});
});

describe('describeStudioAccessWarnings', () => {
	const base = { operationsApi: { network: { cors: true, corsAccessList: [ORIGIN, 'https://other.example'] } } };
	const warn = (draft: typeof base) => describeStudioAccessWarnings(draft, listConfigChanges(base, draft), ORIGIN);

	it('warns when the list drops the origin Studio runs on', () => {
		expect(warn({ operationsApi: { network: { cors: true, corsAccessList: ['https://other.example'] } } }))
			.toEqual([expect.stringContaining(`no longer includes ${ORIGIN}`)]);
	});

	it('warns when CORS is turned off for the operations API', () => {
		expect(
			warn({ operationsApi: { network: { cors: false, corsAccessList: base.operationsApi.network.corsAccessList } } }),
		)
			.toEqual([expect.stringContaining('turns off CORS')]);
	});

	it('follows a list the operations API takes from http', () => {
		const inherits = { http: { corsAccessList: [ORIGIN] }, operationsApi: { network: { cors: true } } };
		const dropped = { http: { corsAccessList: ['https://other.example'] }, operationsApi: { network: { cors: true } } };
		expect(describeStudioAccessWarnings(dropped, listConfigChanges(inherits, dropped), ORIGIN))
			.toEqual([expect.stringContaining('no longer includes')]);
		// Studio hides the section when nothing in it is shown, but Harper's default config always has it.
		const hidden = { http: { corsAccessList: ['https://other.example'] } };
		const fromDefault = { http: { corsAccessList: [ORIGIN] } };
		expect(describeStudioAccessWarnings(hidden, listConfigChanges(fromDefault, hidden), ORIGIN))
			.toEqual([expect.stringContaining('no longer includes')]);
	});

	it('warns that an emptied list answers every origin, as the operations server treats it', () => {
		for (const cleared of [[], [null]]) {
			expect(warn({ operationsApi: { network: { cors: true, corsAccessList: cleared as never } } }))
				.toEqual([expect.stringContaining('every origin')]);
		}
	});

	it('stays quiet when Studio still gets in, or the list was not touched', () => {
		expect(warn({ operationsApi: { network: { cors: true, corsAccessList: ['*'] } } })).toEqual([]);
		expect(describeStudioAccessWarnings(
			{ ...base, http: { corsAccessList: [] } } as never,
			[{ path: ['http', 'corsAccessList'], before: [ORIGIN], after: [] }],
			ORIGIN,
		)).toEqual([]);
	});
});
