import type { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import { describe, expect, it } from 'vitest';
import { appsServeRest, restApps } from './restServed';

const tree: APIDirectoryEntry = {
	name: 'components',
	entries: [
		{ name: 'bare', entries: [{ name: 'resources.js' }] },
		{
			name: 'configured',
			entries: [{ name: 'config.yaml' }, { name: 'src', entries: [{ name: 'harper-config.yaml' }] }],
		},
		{ name: 'both', entries: [{ name: 'config.yaml' }, { name: 'harper-config.yaml' }] },
		{ name: 'stray-file.txt' },
	],
};

describe('restApps', () => {
	it("lists each app with the config file Harper would load, by Harper's own preference", () => {
		expect(restApps(tree)).toEqual([
			{ name: 'bare', configFile: undefined },
			{ name: 'configured', configFile: 'config.yaml' },
			{ name: 'both', configFile: 'harper-config.yaml' },
		]);
		expect(restApps(undefined)).toEqual([]);
	});
});

describe('appsServeRest', () => {
	const configured = [{ name: 'a', configFile: 'config.yaml' }, { name: 'b', configFile: 'config.yaml' }];

	it('is on when an app has no config file, since Harper then loads its default config', () => {
		expect(appsServeRest([{ name: 'bare' }], new Map())).toBe(true);
	});

	it('is on when an app names rest in its config', () => {
		const texts = new Map([['a', 'static:\n  files: web/**\n'], ['b', 'rest: true\n']]);
		expect(appsServeRest(configured, texts)).toBe(true);
		expect(appsServeRest(configured, new Map([['a', 'REST:\n  webSocket: false\n']]))).toBe(true);
	});

	it('is off when every app has a config and none names rest', () => {
		const texts = new Map([['a', 'static:\n  files: web/**\n'], ['b', 'rest: false\n']]);
		expect(appsServeRest(configured, texts)).toBe(false);
		expect(appsServeRest([], new Map())).toBe(false);
	});

	it('reads a config that is only comments as loading nothing', () => {
		expect(appsServeRest([configured[0]], new Map([['a', '# nothing here\n']]))).toBe(false);
	});

	it('gives no answer while a config that could decide it is unread or unparseable', () => {
		expect(appsServeRest(configured, new Map([['a', 'static: {}\n']]))).toBeUndefined();
		expect(appsServeRest(configured, new Map([['a', 'static: {}\n'], ['b', 'rest: [unclosed\n']]))).toBeUndefined();
	});
});
