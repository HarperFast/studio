import { describe, expect, it } from 'vitest';
import {
	describeFabricDefault,
	describeFabricSetSetting,
	fabricDefaultFor,
	fabricDefaultSettings,
	fabricSetSettingFor,
	fabricSetSettings,
} from './fabricManagedConfig';

const HOSTED = { hosted: true, version: '5.4.0' };

describe('fabricSetSettingFor', () => {
	it.each([
		// HARPER_SET_CONFIG in host-manager's compose.yaml
		['threads.count', 'HARPER_SET_CONFIG'],
		['operationsApi.sysInfo.disk', 'HARPER_SET_CONFIG'],
		['operationsApi.network.http2', 'HARPER_SET_CONFIG'],
		['logging.stdStreams', 'HARPER_SET_CONFIG'],
		['logging.file', 'HARPER_SET_CONFIG'],
		['logging.path', 'HARPER_SET_CONFIG'],
		['logging.colors', 'HARPER_SET_CONFIG'],
		['logging.external.path', 'HARPER_SET_CONFIG'],
		['logging.external.stdStreams', 'HARPER_SET_CONFIG'],
		['analytics.replicate', 'HARPER_SET_CONFIG'],
		['tls.certificate', 'HARPER_SET_CONFIG'],
		// its individual environment variables
		['threads.maxHeapMemory', 'environment'],
		['threads.debug.startingPort', 'environment'],
		['operationsApi.network.timeout', 'environment'],
		['http.keepAliveTimeout', 'environment'],
		['replication.hostname', 'environment'],
		['replication.securePort', 'environment'],
		['replication.enableRootCAs', 'environment'],
		['node.hostname', 'environment'],
		['authentication.cookie.domains', 'environment'],
		['logging.rotation.enabled', 'environment'],
		['logging.rotation.maxSize', 'environment'],
		['logging.rotation.compress', 'environment'],
	])('marks %s, which Fabric sets through %s', (path, source) => {
		expect(fabricSetSettingFor(path, HOSTED)?.source).toBe(source);
	});

	it.each(['logging.level', 'logging.external.level', 'http.cors', 'http.corsAccessList', 'agent.enabled'])(
		'leaves %s to the customer',
		path => {
			expect(fabricSetSettingFor(path, HOSTED)).toBeUndefined();
		},
	);

	it('marks nothing off Fabric', () => {
		expect(fabricSetSettingFor('logging.file', { hosted: false })).toBeUndefined();
		expect(fabricSetSettings({ hosted: false })).toEqual([]);
	});

	it('covers a section that holds a Fabric setting only when asked to', () => {
		expect(fabricSetSettingFor('logging', HOSTED)).toBeUndefined();
		expect(fabricSetSettingFor('logging', HOSTED, { includeChildren: true })?.path).toBe('logging.stdStreams');
	});

	it('matches whole path segments', () => {
		expect(fabricSetSettingFor('logging.fileName', HOSTED)).toBeUndefined();
		expect(fabricSetSettingFor('tlsOther', HOSTED)).toBeUndefined();
	});

	it('marks models only where host manager sets them, below 5.3, or when the version is unknown', () => {
		expect(fabricSetSettingFor('models.generative', { hosted: true, version: '5.2.4' })?.path).toBe('models');
		expect(fabricSetSettingFor('models.generative', { hosted: true })?.path).toBe('models');
		expect(fabricSetSettingFor('models.generative', { hosted: true, version: '5.3.0' })).toBeUndefined();
	});

	it('names the environment variable in its reason', () => {
		expect(describeFabricSetSetting(fabricSetSettingFor('http.keepAliveTimeout', HOSTED)!)).toBe(
			'Fabric sets this every time the instance starts (through the HTTP_KEEPALIVETIMEOUT environment variable), so a change here would be undone at the next restart.',
		);
	});
});

describe('fabricDefaultFor', () => {
	it('gives the defaults host manager starts an instance with', () => {
		expect(fabricDefaultFor('logging.external.level', HOSTED)?.value).toBe('info');
		expect(fabricDefaultFor('logging.external.console', HOSTED)?.value).toBe(true);
		expect(fabricDefaultFor('http.corsAccessList', HOSTED)?.valueDescription).toBeDefined();
		expect(fabricDefaultFor('operationsApi.network.corsAccessList', HOSTED)?.valueDescription).toBeDefined();
		expect(fabricDefaultFor('agent.maxTurns', HOSTED)?.value).toBe(12);
	});

	it("names the agent's and the firewall's only on 5.2 and later, and not on an unknown version", () => {
		expect(fabricDefaultFor('agent.enabled', { hosted: true, version: '5.1.9' })).toBeUndefined();
		expect(fabricDefaultFor('agent.enabled', { hosted: true, version: '5.2.0-beta.1' })).toBeUndefined();
		expect(fabricDefaultFor('agent.enabled', { hosted: true })).toBeUndefined();
		expect(fabricDefaultFor('waf.enabled', { hosted: true, version: '5.2.0' })?.value).toBe(true);
		expect(fabricDefaultSettings({ hosted: true, version: '5.1.9' }).map(setting => setting.path)).toEqual([
			'logging.external.level',
			'logging.external.console',
			'http.corsAccessList',
			'operationsApi.network.corsAccessList',
		]);
	});

	it('gives none off Fabric', () => {
		expect(fabricDefaultFor('logging.external.level', { hosted: false, version: '5.4.0' })).toBeUndefined();
	});

	it('says the customer keeps their own value', () => {
		expect(describeFabricDefault(fabricDefaultFor('logging.external.level', HOSTED)!)).toBe(
			'Fabric starts this at "info". You can change it, and your value is kept.',
		);
	});
});
