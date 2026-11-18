import { describe, expect, it } from 'vitest';
import { buildConfigSections, humanizeConfigKey, splitHarperDefault } from './configSchemaFields';
import { configRootSchema } from './harper-config/harperConfigSchema';

const sections = buildConfigSections(configRootSchema);
const fields = sections.flatMap(section => section.groups.flatMap(group => group.fields));
const field = (path: string) => fields.find(candidate => candidate.path.join('.') === path);

describe("buildConfigSections from Harper's schema", () => {
	it('has a form for the common settings, with the right control', () => {
		expect(field('logging.level')).toMatchObject({ kind: 'enum', label: 'Level', harperDefault: 'warn' });
		expect(field('logging.level')?.enumValues).toContain('debug');
		expect(field('http.cors')).toMatchObject({ kind: 'boolean', label: 'CORS', harperDefault: 'true' });
		expect(field('http.corsAccessList')).toMatchObject({
			kind: 'stringList',
			nullable: true,
			label: 'CORS access list',
		});
		expect(field('operationsApi.network.corsAccessList')).toMatchObject({ kind: 'stringList' });
		expect(field('http.headersTimeout')).toMatchObject({ kind: 'integer', harperDefault: '60000' });
		expect(field('logging.auditRetention')).toMatchObject({ kind: 'stringOrNumber', harperDefault: '3d' });
		expect(field('logging.rotation.maxSize')).toMatchObject({ kind: 'string', nullable: true });
		expect(field('status.healthChecks.intervalSeconds')).toMatchObject({ kind: 'number', harperDefault: '60' });
	});

	it("leaves out what Studio hides, and the settings a form shouldn't offer", () => {
		const offered = new Set(fields.map(candidate => candidate.path[0]));
		for (const hidden of ['threads', 'tls', 'storage', 'rootPath', 'componentsRoot', 'replication', 'databases']) {
			expect(offered.has(hidden)).toBe(false);
		}
		expect(field('logging.auditLog')).toBeUndefined();
		expect(field('logging.root')).toBeUndefined();
		expect(fields.some(candidate => candidate.path.includes('tls'))).toBe(false);
		expect(fields.some(candidate => ['port', 'securePort'].includes(candidate.path.at(-1)!))).toBe(false);
	});

	it('leaves settings that take more than one shape to the JSON editor', () => {
		expect(field('http.mtls')).toBeUndefined();
		expect(field('http.readRequestQueueLimit')).toBeUndefined();
		expect(field('agent.httpFetch')).toBeUndefined();
	});

	it('groups nested settings under their section', () => {
		const logging = sections.find(section => section.key === 'logging')!;
		expect(logging.label).toBe('Logging');
		expect(logging.groups.map(group => group.label)).toEqual([
			undefined,
			'Rotation',
			'Audit auth events',
			'External',
		]);
		expect(sections.find(section => section.key === 'operationsApi')?.label).toBe('Operations API');
	});

	it('reads settings that come from shared definitions', () => {
		expect(field('http.logging.level')).toMatchObject({ kind: 'enum' });
		expect(field('http.logging.timing')).toMatchObject({ kind: 'boolean' });
	});

	it('gives every field a unique id', () => {
		expect(new Set(fields.map(candidate => candidate.id)).size).toBe(fields.length);
	});
});

describe('humanizeConfigKey', () => {
	it.each([
		['corsAccessList', 'CORS access list'],
		['keepAliveTimeout', 'Keep alive timeout'],
		['enableRootCAs', 'Enable root CAs'],
		['cacheTTL', 'Cache TTL'],
		['http2', 'HTTP/2'],
		['v8Flags', 'V8 flags'],
		['stdStreams', 'Standard streams'],
		['maxCostUsd', 'Max cost USD'],
		['enabled', 'Enabled'],
	])('%s → %s', (key, label) => {
		expect(humanizeConfigKey(key)).toBe(label);
	});
});

describe('splitHarperDefault', () => {
	it('splits a closing default off the description', () => {
		expect(splitHarperDefault('Enable Cross Origin Resource Sharing. Default: true')).toEqual({
			description: 'Enable Cross Origin Resource Sharing.',
			harperDefault: 'true',
		});
		expect(splitHarperDefault("Header keys. Default: 'Accept, Content-Type'")).toMatchObject({
			harperDefault: 'Accept, Content-Type',
		});
	});

	it('leaves a description whose default is followed by more sentences', () => {
		const description = 'Delay. Default (also when null): 5000. 0 rejects every read.';
		expect(splitHarperDefault(description)).toEqual({ description });
		const another = 'Timeout. Default: 900000, or blobTimeout if greater. An explicit value overrides that default.';
		expect(splitHarperDefault(another)).toEqual({ description: another });
	});

	it('handles a description that is only a default, or none', () => {
		expect(splitHarperDefault('Default: 9926')).toEqual({ description: undefined, harperDefault: '9926' });
		expect(splitHarperDefault(undefined)).toEqual({});
	});
});

describe('section order', () => {
	it('opens on the sections customers change most', () => {
		expect(sections.slice(0, 3).map(section => section.key)).toEqual(['logging', 'http', 'operationsApi']);
		expect(sections.map(section => section.key)).toContain('localStudio');
	});
});
