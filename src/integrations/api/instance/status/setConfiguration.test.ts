import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
	describePeerRefusal,
	isConfigurationRefusalStatus,
	refusingReplicationPeers,
	setConfiguration,
	shouldFanOutSetConfiguration,
} from './setConfiguration';

// In the format harper-pro's built error classes give through `new Error(errorToString(error)).toString()`.
const REFUSED = {
	validation: 'Error: HdbError: Harper config file validation error: "logging.level" must be one of [trace, debug]',
	unrecognized: 'Error: HdbError: Unable to update config, unrecognized config parameter: logging_levle',
	reserved:
		"Error: HdbError: Unable to update config, cannot configure a component whose name is reserved for Harper's own configuration section: http",
	studioSetting: 'Error: ClientError: Unable to update config: studio.landing must name a tab',
	pinned: 'Error: ClientError: Cannot set studio_landing: HARPER_SET_CONFIG defines it. Change that variable first.',
	pinnedModels: 'Error: ClientError: Cannot set models: HARPER_CONFIG defines models. Change that variable first.',
};

const NOT_REFUSED = {
	refusedConnection: 'Error: connect ECONNREFUSED 10.0.3.7:9933',
	closedFirst:
		'Error: The connection to wss://ins-b.example.com:9933 closed (1006) before set_configuration was answered; its outcome there is unknown',
	timedOut:
		'Error: set_configuration to wss://ins-b.example.com:9933 did not answer within 30000ms; its outcome there is unknown',
	closed: 'Error: Connection closed  1006',
	badUrl: 'TypeError: Invalid URL: Expected a string URL for node "ins-b" but received undefined',
	refusedHandshake401: 'Error: Unexpected server response: 401',
	refusedHandshake403: 'Error: Unexpected server response: 403',
	refusedHandshakeUnwrapped: 'Unexpected server response: 403',
	unparsableConfig: 'Error: HdbError: Error parsing harperdb-config.yaml YAMLParseError',
	unparsableConfigUnwrapped: 'HdbError: Error parsing harperdb-config.yaml YAMLParseError',
	clientErrorServerSide: 'Error: ClientError: secrets custody is not initialized on this node',
	clientErrorServerSideUnwrapped: 'ClientError: Record locks are not supported on LMDB',
	fileSystem: "Error: Error: EACCES: permission denied, open '/home/harperdb/harper/harperdb-config.yaml'",
	forbidden: 'Error: AccessViolation: Unauthorized access to resource',
	thrownString: 'Error: HdbError: something else went wrong',
	unprefixed: 'Unable to update config, unrecognized config parameter: logging_levle',
	empty: '',
};

describe('setConfiguration', () => {
	function fakeClient() {
		const post = vi.fn().mockResolvedValue({ data: { message: 'ok' } });
		return { post, instanceClient: { post } as unknown as AxiosInstance };
	}

	it('sends the changes as the body, and no request options by default', async () => {
		const { post, instanceClient } = fakeClient();

		await setConfiguration({ instanceClient, logging_level: 'debug', replicated: true });

		expect(post).toHaveBeenCalledExactlyOnceWith('/', {
			operation: 'set_configuration',
			logging_level: 'debug',
			replicated: true,
		});
	});

	it('asks the client to keep failed peers as a request option, never in the body', async () => {
		const { post, instanceClient } = fakeClient();

		await setConfiguration({ instanceClient, logging_level: 'debug', replicated: true }, {
			keepReplicationFailures: true,
		});

		expect(post).toHaveBeenCalledExactlyOnceWith(
			'/',
			{ operation: 'set_configuration', logging_level: 'debug', replicated: true },
			{ keepReplicationFailures: true },
		);
	});
});

describe('isConfigurationRefusalStatus', () => {
	it.each([400, 409])('counts %s', status => {
		expect(isConfigurationRefusalStatus(status)).toBe(true);
	});

	it.each([undefined, 200, 401, 403, 404, 500, 502, '400'])('does not count %s', status => {
		expect(isConfigurationRefusalStatus(status)).toBe(false);
	});
});

describe('describePeerRefusal', () => {
	const failed = (reason: string, statusCode?: number) => ({ node: 'ins-b', status: 'failed', reason, statusCode });

	describe('with a statusCode from the peer', () => {
		it.each([
			[400, REFUSED.unrecognized, 'Unable to update config, unrecognized config parameter: logging_levle'],
			[409, REFUSED.pinned, 'Cannot set studio_landing: HARPER_SET_CONFIG defines it. Change that variable first.'],
			[
				400,
				'HdbError: Unable to update config, unrecognized config parameter: x',
				'Unable to update config, unrecognized config parameter: x',
			],
			[404, 'Error: Error: a message of a kind Studio has not seen', 'a message of a kind Studio has not seen'],
			[422, 'a reason with no prefix', 'a reason with no prefix'],
			[499, '', 'status 499'],
		])('reads %s as a refusal, whatever the reason says', (statusCode, reason, expected) => {
			expect(describePeerRefusal(failed(reason, statusCode))).toBe(expected);
		});

		it.each([500, 502, 503, 599])('reads %s as no refusal, even beside a refusal message', statusCode => {
			expect(describePeerRefusal(failed(REFUSED.unrecognized, statusCode))).toBeUndefined();
			expect(describePeerRefusal(failed(REFUSED.pinned, statusCode))).toBeUndefined();
		});
	});

	describe('without a statusCode (an origin before harper-pro 5.5, or an answer that carried none)', () => {
		it.each([
			[
				'a config validation error',
				REFUSED.validation,
				'Harper config file validation error: "logging.level" must be one of [trace, debug]',
			],
			[
				'an unrecognized parameter',
				REFUSED.unrecognized,
				'Unable to update config, unrecognized config parameter: logging_levle',
			],
			[
				"a component named after Harper's own section",
				REFUSED.reserved,
				"Unable to update config, cannot configure a component whose name is reserved for Harper's own configuration section: http",
			],
			[
				'a Studio setting Harper rejects',
				REFUSED.studioSetting,
				'Unable to update config: studio.landing must name a tab',
			],
			[
				'a setting an environment variable defines',
				REFUSED.pinned,
				'Cannot set studio_landing: HARPER_SET_CONFIG defines it. Change that variable first.',
			],
			[
				'models an environment variable defines',
				REFUSED.pinnedModels,
				'Cannot set models: HARPER_CONFIG defines models. Change that variable first.',
			],
		])('reads %s as a refusal', (_label, reason, expected) => {
			expect(describePeerRefusal(failed(reason))).toBe(expected);
			expect(describePeerRefusal(failed(reason.replace(/^Error: /, '')))).toBe(expected);
		});

		it('keeps a message that spans lines, carriage returns included', () => {
			expect(describePeerRefusal(failed(`${REFUSED.studioSetting}\r\nand another problem`)))
				.toBe('Unable to update config: studio.landing must name a tab\r\nand another problem');
		});

		it.each(Object.entries(NOT_REFUSED))('reads %s as no refusal', (_label, reason) => {
			expect(describePeerRefusal(failed(reason))).toBeUndefined();
		});

		it('reads a statusCode that is not a number as absent', () => {
			expect(describePeerRefusal({ ...failed(REFUSED.pinned), statusCode: '500' })).toBe(
				'Cannot set studio_landing: HARPER_SET_CONFIG defines it. Change that variable first.',
			);
		});
	});

	it.each([
		['a peer that applied it', { node: 'ins-b', message: REFUSED.pinned, requestId: 1 }],
		['an entry with no reason', { node: 'ins-b', status: 'failed' }],
		['a reason that is not text', { node: 'ins-b', status: 'failed', reason: { message: REFUSED.pinned } }],
		['null', null],
		['a number', 7],
	])('reads %s as no refusal', (_label, entry) => {
		expect(describePeerRefusal(entry)).toBeUndefined();
	});
});

describe('refusingReplicationPeers', () => {
	it('names each refusing peer by its lower-cased node, leaving out the rest', () => {
		const refusals = refusingReplicationPeers({
			message: 'Configuration successfully set.',
			replicated: [
				{ node: 'INS-A.example.com', status: 'failed', reason: REFUSED.pinned },
				{ node: 'ins-b.example.com', message: 'Configuration successfully set.', requestId: 1 },
				{ node: 'ins-c.example.com', status: 'failed', reason: NOT_REFUSED.closedFirst },
				{ node: 'ins-d.example.com', status: 'failed', reason: NOT_REFUSED.unparsableConfig, statusCode: 500 },
				{ node: 'ins-e.example.com', status: 'failed', reason: REFUSED.unrecognized, statusCode: 400 },
			],
		});

		expect([...refusals]).toEqual([
			[
				'ins-a.example.com',
				'INS-A.example.com: Cannot set studio_landing: HARPER_SET_CONFIG defines it. Change that variable first.',
			],
			['ins-e.example.com', 'ins-e.example.com: Unable to update config, unrecognized config parameter: logging_levle'],
		]);
	});

	it.each([
		['no replicated array', { message: 'ok' }],
		['a non-array replicated', { message: 'ok', replicated: 'yes' }],
		['a bare string', 'Configuration successfully set.'],
		['undefined', undefined],
		['null', null],
		['a refusal with no usable node', {
			message: 'ok',
			replicated: [{ status: 'failed', reason: REFUSED.pinned }, {
				node: '',
				status: 'failed',
				reason: REFUSED.pinned,
			}],
		}],
	])('reads %s as no refusal', (_label, response) => {
		expect(refusingReplicationPeers(response)).toEqual(new Map());
	});
});

describe('shouldFanOutSetConfiguration', () => {
	it('is true when every live instance runs 5.2.0 or later', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: '5.3.1' },
			{ status: 'STOPPED', version: '5.2.13' },
		])).toBe(true);
	});

	it('includes exactly 5.2.0', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: '5.2.0' },
		])).toBe(true);
	});

	it('is false when any live instance is older', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: '5.1.29' },
		])).toBe(false);
	});

	it('is false for a 5.2.0 prerelease', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: '5.2.0-beta.4' },
		])).toBe(false);
	});

	it('is false when any live instance reports no version', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'RUNNING', version: undefined },
		])).toBe(false);
	});

	it('ignores instances that are leaving the cluster', () => {
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'STOPPED', version: '5.2.0' },
			{ status: 'TERMINATING', version: '5.1.29' },
			{ status: 'TERMINATED', version: undefined },
			{ status: 'REMOVED', version: '4.7.36' },
		])).toBe(true);
	});

	it('is false with nothing else live to reach', () => {
		expect(shouldFanOutSetConfiguration([])).toBe(false);
		expect(shouldFanOutSetConfiguration([{ status: 'RUNNING', version: '5.2.0' }])).toBe(false);
		expect(shouldFanOutSetConfiguration([
			{ status: 'RUNNING', version: '5.2.0' },
			{ status: 'TERMINATED', version: '5.2.0' },
		])).toBe(false);
	});
});
