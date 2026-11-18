import { describe, expect, it } from 'vitest';
import {
	findRefusedChanges,
	getIn,
	listConfigChanges,
	rebaseDraft,
	setIn,
	storedByHarper,
	toSetConfigurationParams,
} from './configDraft';

const HOSTED = { hosted: true, version: '5.4.0' };
const LOCAL = { hosted: false };

describe('getIn / setIn', () => {
	it('reads and writes nested settings without touching the original', () => {
		const config = { http: { cors: true, corsAccessList: ['a'] } };
		const next = setIn(config, ['http', 'cors'], false);
		expect(next).toEqual({ http: { cors: false, corsAccessList: ['a'] } });
		expect(config.http.cors).toBe(true);
		expect(getIn(next, ['http', 'cors'])).toBe(false);
	});

	it('creates the sections a new setting needs', () => {
		expect(setIn({}, ['mcp', 'operations', 'enabled'], true)).toEqual({ mcp: { operations: { enabled: true } } });
	});

	it('removes a setting set to undefined', () => {
		expect(setIn({ logging: { level: 'warn', file: true } }, ['logging', 'level'], undefined)).toEqual({
			logging: { file: true },
		});
	});

	it('reads only own keys', () => {
		expect(getIn({}, ['constructor'])).toBeUndefined();
		expect(getIn({ http: 1 }, ['http', 'cors'])).toBeUndefined();
	});
});

describe('listConfigChanges', () => {
	it('lists only the settings that changed, one per leaf', () => {
		const before = {
			http: { cors: true, corsAccessList: ['*'], keepAliveTimeout: 301000 },
			analytics: { aggregatePeriod: 60 },
		};
		const after = {
			http: { cors: false, corsAccessList: ['*'], keepAliveTimeout: 301000 },
			analytics: { aggregatePeriod: 60 },
		};
		expect(listConfigChanges(before, after)).toEqual([{ path: ['http', 'cors'], before: true, after: false }]);
	});

	it('is empty when nothing changed', () => {
		const config = { a: 1, b: { c: 2 } };
		expect(listConfigChanges(config, structuredClone(config))).toEqual([]);
	});

	it('compares lists whole and objects regardless of key order', () => {
		expect(listConfigChanges({ list: ['a', 'b'] }, { list: ['b', 'a'] })).toEqual([
			{ path: ['list'], before: ['a', 'b'], after: ['b', 'a'] },
		]);
		expect(listConfigChanges({ list: [{ a: 1, b: 2 }] }, { list: [{ b: 2, a: 1 }] })).toEqual([]);
	});

	it('lists each setting of an added section', () => {
		expect(listConfigChanges({ a: 1 }, { a: 1, mcp: { operations: { enabled: true }, port: 1 } })).toEqual([
			{ path: ['mcp', 'operations', 'enabled'], before: undefined, after: true },
			{ path: ['mcp', 'port'], before: undefined, after: 1 },
		]);
	});

	it('tells a removed setting from a null one', () => {
		expect(listConfigChanges({ a: null }, {})).toEqual([{ path: ['a'], before: null, after: undefined }]);
		expect(listConfigChanges({}, { a: null })).toEqual([{ path: ['a'], before: undefined, after: null }]);
	});

	it('lists a section replaced by a value as one change', () => {
		expect(listConfigChanges({ logging: { level: 'warn' } }, { logging: false })).toEqual([
			{ path: ['logging'], before: { level: 'warn' }, after: false },
		]);
	});
});

describe('rebaseDraft', () => {
	it('keeps the edits and takes everything else from the new base', () => {
		const oldBase = { http: { cors: true }, logging: { level: 'warn' } };
		const draft = { http: { cors: false }, logging: { level: 'warn' } };
		const newBase = { http: { cors: true }, logging: { level: 'debug' } };
		expect(rebaseDraft(oldBase, draft, newBase)).toEqual({ http: { cors: false }, logging: { level: 'debug' } });
	});

	it('is the new base when the edits are already in it', () => {
		const oldBase = { http: { cors: true } };
		const draft = { http: { cors: false } };
		expect(listConfigChanges({ http: { cors: false } }, rebaseDraft(oldBase, draft, { http: { cors: false } })))
			.toEqual([]);
	});
});

describe('storedByHarper, as harper castConfigValue stores what it is sent', () => {
	it.each([
		['3600', 3600],
		['0x10', 0],
		['1.5', 1.5],
		['true', true],
		['FALSE', false],
		['undefined', null],
		['null', null],
		['["a"]', ['a']],
		['[a]', '[a]'],
		['3d', '3d'],
		['', ''],
		[42, 42],
	])('%j → %j', (sent, stored) => {
		expect(storedByHarper(sent)).toEqual(stored);
	});

	it('lets a rebase see an edit Harper stored as another type as landed', () => {
		const rebased = rebaseDraft({ a: { t: '1d' } }, { a: { t: '3600' } }, { a: { t: 3600 } });
		expect(rebased).toEqual({ a: { t: 3600 } });
		expect(rebaseDraft({ a: { t: '1d' } }, { a: { t: '3600' } }, { a: { t: '2d' } })).toEqual({ a: { t: '3600' } });
	});
});

describe('toSetConfigurationParams', () => {
	it('joins each path with underscores, as set_configuration names settings', () => {
		const changes = listConfigChanges(
			{ http: { cors: true, corsAccessList: ['a'] }, logging: { rotation: { enabled: true } } },
			{ http: { cors: false, corsAccessList: ['a', 'b'] }, logging: { rotation: { enabled: false } } },
		);
		expect(toSetConfigurationParams(changes)).toEqual({
			http_cors: false,
			http_corsAccessList: ['a', 'b'],
			logging_rotation_enabled: false,
		});
	});

	it('sends a null, and flattens an object that replaced a value', () => {
		expect(toSetConfigurationParams([
			{ path: ['logging', 'rotation', 'maxSize'], before: '1G', after: null },
			{ path: ['analytics'], before: true, after: { aggregatePeriod: 30 } },
		])).toEqual({ logging_rotation_maxSize: null, analytics_aggregatePeriod: 30 });
	});

	it('sends nothing for a removal', () => {
		expect(toSetConfigurationParams([{ path: ['a'], before: 1, after: undefined }])).toEqual({});
	});
});

describe('findRefusedChanges', () => {
	it('refuses a setting Fabric sets at every start, and says how', () => {
		const [refused] = findRefusedChanges(
			listConfigChanges({ http: { keepAliveTimeout: 301000 } }, { http: { keepAliveTimeout: 5000 } }),
			HOSTED,
		);
		expect(refused).toMatchObject({ path: ['http', 'keepAliveTimeout'], reason: 'fabric' });
		expect(refused.message).toContain('HTTP_KEEPALIVETIMEOUT');
	});

	it('refuses replacing a section that holds settings Fabric sets', () => {
		expect(findRefusedChanges([{ path: ['logging'], before: { file: true }, after: false }], HOSTED)).toMatchObject([
			{ reason: 'fabric' },
		]);
	});

	it('takes the same changes off Fabric', () => {
		expect(findRefusedChanges(
			listConfigChanges({ http: { keepAliveTimeout: 301000 } }, { http: { keepAliveTimeout: 5000 } }),
			LOCAL,
		)).toEqual([]);
	});

	it('refuses what Studio never changes, on Fabric or off', () => {
		for (const context of [HOSTED, LOCAL]) {
			expect(findRefusedChanges([{ path: ['storage', 'path'], before: undefined, after: '/x' }], context))
				.toMatchObject([{ reason: 'studio' }]);
			expect(findRefusedChanges([{ path: ['componentsRoot'], before: undefined, after: '/x' }], context))
				.toMatchObject([{ reason: 'studio' }]);
		}
		// Replacing a section whole replaces the restricted settings in it.
		expect(findRefusedChanges([{ path: ['replication'], before: undefined, after: false }], LOCAL))
			.toMatchObject([{ reason: 'studio' }]);
		expect(findRefusedChanges([{ path: ['http'], before: { cors: true }, after: 5 }], LOCAL))
			.toMatchObject([{ reason: 'studio' }]);
		expect(findRefusedChanges([{ path: ['replication', 'databases'], before: '*', after: ['data'] }], LOCAL))
			.toEqual([]);
	});

	it('refuses an empty object, which set_configuration would get as nothing', () => {
		expect(findRefusedChanges([{ path: ['http', 'mtls'], before: false, after: {} }], LOCAL))
			.toMatchObject([{ reason: 'empty' }]);
		expect(listConfigChanges({}, { mcp: {} })).toEqual([]);
		expect(findRefusedChanges([{ path: ['http', 'mtls'], before: false, after: { ca: {} } }], LOCAL))
			.toMatchObject([{ reason: 'empty' }]);
	});

	it('checks each setting of an object that replaced a value, since each one is sent', () => {
		expect(findRefusedChanges([{ path: ['logging'], before: false, after: { root: '/x' } }], LOCAL))
			.toMatchObject([{ reason: 'studio' }]);
		expect(findRefusedChanges([{ path: ['http'], before: 5, after: { keepAliveTimeout: 1 } }], HOSTED))
			.toMatchObject([{ reason: 'fabric' }]);
		expect(findRefusedChanges([{ path: ['analytics'], before: true, after: { aggregatePeriod: 30 } }], HOSTED))
			.toEqual([]);
	});

	it("refuses a removal, which set_configuration can't make", () => {
		expect(findRefusedChanges([{ path: ['logging', 'level'], before: 'warn', after: undefined }], LOCAL))
			.toMatchObject([{ reason: 'removed' }]);
	});

	it('lets an ordinary change through', () => {
		expect(findRefusedChanges([{ path: ['logging', 'level'], before: 'warn', after: 'debug' }], HOSTED)).toEqual([]);
		expect(findRefusedChanges([{ path: ['http', 'corsAccessList'], before: ['a'], after: ['b'] }], HOSTED))
			.toEqual([]);
	});
});
