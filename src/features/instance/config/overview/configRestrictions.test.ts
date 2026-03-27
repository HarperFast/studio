import { describe, expect, it } from 'vitest';
import { flattenConfig, getChangedFields, isRestrictedConfigPath, omitRestrictedFields } from './configRestrictions';

describe('getChangedFields', () => {
	it('should return only changed fields', () => {
		const original = {
			http: { cors: true, corsAccessList: ['*'] },
			analytics: { enabled: true },
		};
		const edited = {
			http: { cors: false, corsAccessList: ['*'] },
			analytics: { enabled: true },
		};
		const changes = getChangedFields(original, edited);
		expect(changes).toEqual({
			http: { cors: false },
		});
	});

	it('should return empty object if nothing changed', () => {
		const config = { a: 1, b: { c: 2 } };
		expect(getChangedFields(config, config)).toEqual({});
	});

	it('should return only deep changed fields', () => {
		const original = {
			http: {
				compressionThreshold: 0,
				cors: false,
				corsAccessList: ['https://fabric.harper.fast'],
				keepAliveTimeout: 301000,
				mtls: false,
				http2: false,
				timeout: 120000,
			},
			authentication: {
				authorizeLocal: false,
				cacheTTL: 30000,
				operationTokenTimeout: '1d',
				refreshTokenTimeout: '30d',
				cookie: {
					domains: ['local-inference.dawson-org-2.dev.harperfabric.com'],
				},
			},
		};
		const edited = JSON.parse(JSON.stringify(original));
		edited.http.cors = true;

		const changes = getChangedFields(original, edited);
		expect(changes).toEqual({
			http: { cors: true },
		});
	});

	it('should detect additions', () => {
		const original = { a: 1 };
		const edited = { a: 1, b: 2 };
		expect(getChangedFields(original, edited)).toEqual({ b: 2 });
	});
});

describe('flattenConfig', () => {
	it('should flatten nested objects using underscores', () => {
		const config = {
			http: {
				cors: true,
				port: 9925,
			},
			logging: {
				level: 'info',
				rotation: {
					enabled: true,
				},
			},
			simple: 1,
		};
		const flattened = flattenConfig(config);
		expect(flattened).toEqual({
			http_cors: true,
			http_port: 9925,
			logging_level: 'info',
			logging_rotation_enabled: true,
			simple: 1,
		});
	});

	it('should handle arrays as values (not flatten them)', () => {
		const config = {
			http: {
				corsAccessList: ['a', 'b'],
			},
		};
		const flattened = flattenConfig(config);
		expect(flattened).toEqual({
			http_corsAccessList: ['a', 'b'],
		});
	});

	it('should handle empty objects', () => {
		expect(flattenConfig({})).toEqual({});
	});
});

describe('isRestrictedConfigPath', () => {
	it('should return false if value has not changed', () => {
		expect(isRestrictedConfigPath('http.port', 9925, 9925)).toBe(false);
		expect(isRestrictedConfigPath('threads', 4, 4)).toBe(false);
		expect(isRestrictedConfigPath('any.field', 'value', 'value')).toBe(false);
	});

	it('should return true for simple blocked fields when changed', () => {
		expect(isRestrictedConfigPath('threads', 5, 4)).toBe(true);
		expect(isRestrictedConfigPath('rootPath', '/new/path', '/old/path')).toBe(true);
		expect(isRestrictedConfigPath('storage', {}, { some: 'config' })).toBe(true);
	});

	it('should return true for nested blocked fields when changed', () => {
		expect(isRestrictedConfigPath('http.port', 9926, 9925)).toBe(true);
		expect(isRestrictedConfigPath('http.securePort', 9927, 9926)).toBe(true);
		expect(isRestrictedConfigPath('logging.auditLog', true, false)).toBe(true);
		expect(isRestrictedConfigPath('logging.rotation.path', '/new/log', '/old/log')).toBe(true);
		expect(isRestrictedConfigPath('mqtt.network.port', 1884, 1883)).toBe(true);
	});

	it('should return false for allowed fields', () => {
		expect(isRestrictedConfigPath('http.cors', true, false)).toBe(false);
		expect(isRestrictedConfigPath('analytics', { enabled: true }, { enabled: false })).toBe(false);
		expect(isRestrictedConfigPath('localStudio', true, false)).toBe(false);
		expect(isRestrictedConfigPath('logging.level', 'debug', 'info')).toBe(false);
	});

	it('should handle replication.databases specifically', () => {
		// replication is blocked_except_databases
		expect(isRestrictedConfigPath('replication.enabled', true, false)).toBe(true);
		expect(isRestrictedConfigPath('replication.databases', ['db1'], [])).toBe(false);
		// Currently replication object itself is NOT blocked because it's 'blocked_except_databases' and 'replication' !== 'databases'
		expect(isRestrictedConfigPath('replication', { databases: ['db1'] }, { databases: [] })).toBe(false);
	});

	it('should return true if a parent field is blocked', () => {
		// storage is blocked, so storage.anything should be blocked
		expect(isRestrictedConfigPath('storage.type', 's3', 'hdb')).toBe(true);
		// tls is blocked
		expect(isRestrictedConfigPath('tls.cert', '...', '...')).toBe(false); // not changed
		expect(isRestrictedConfigPath('tls.cert', 'new', 'old')).toBe(true);
	});

	it('should return false for unknown top-level fields', () => {
		expect(isRestrictedConfigPath('myNewField', 1, 0)).toBe(false);
	});
});

describe('omitRestrictedFields', () => {
	it('should omit simple blocked fields', () => {
		const config = {
			threads: 4,
			http: { port: 9925, cors: true },
			storage: { some: 'config' },
			analytics: { enabled: true },
		};
		const sanitized = omitRestrictedFields(config);
		expect(sanitized.threads).toBeUndefined();
		expect(sanitized.http.port).toBeUndefined();
		expect(sanitized.http.cors).toBe(true);
		expect(sanitized.storage).toBeUndefined();
		expect(sanitized.analytics.enabled).toBe(true);
	});

	it('should handle replication.databases specially', () => {
		const config = {
			replication: {
				enabled: true,
				databases: ['db1'],
				other: 'stuff',
			},
		};
		const sanitized = omitRestrictedFields(config);
		expect(sanitized.replication).toEqual({ databases: ['db1'] });
	});
});
