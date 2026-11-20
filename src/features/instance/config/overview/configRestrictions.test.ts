import { describe, expect, it } from 'vitest';
import { isHiddenConfigPath, isRestrictedConfigPath, omitRestrictedFields } from './configRestrictions';

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

	it('should omit the models block, which holds provider keys and Fabric tokens', () => {
		const config = {
			models: { generative: { default: { backend: 'openai', apiKey: 'sk-secret' } } },
			modelsGateway: { enabled: true },
		};
		expect(omitRestrictedFields(config)).toEqual({ modelsGateway: { enabled: true } });
		expect(isRestrictedConfigPath('models', { generative: {} }, undefined)).toBe(true);
		expect(isRestrictedConfigPath('modelsGateway.enabled', false, true)).toBe(false);
	});
});

describe('isHiddenConfigPath', () => {
	it('hides what omitRestrictedFields drops, and nothing else', () => {
		expect(isHiddenConfigPath(['threads', 'count'])).toBe(true);
		expect(isHiddenConfigPath(['http', 'port'])).toBe(true);
		expect(isHiddenConfigPath(['http', 'cors'])).toBe(false);
		expect(isHiddenConfigPath(['replication', 'hostname'])).toBe(true);
		expect(isHiddenConfigPath(['replication', 'databases'])).toBe(false);
		expect(isHiddenConfigPath(['logging', 'rotation', 'path'])).toBe(true);
		expect(isHiddenConfigPath(['logging', 'rotation', 'enabled'])).toBe(false);
	});

	it('reads only its own keys, not the prototype chain', () => {
		expect(isHiddenConfigPath(['constructor'])).toBe(false);
		expect(isHiddenConfigPath(['http', 'toString'])).toBe(false);
	});
});
