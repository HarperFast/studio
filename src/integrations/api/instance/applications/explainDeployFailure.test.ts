import { SSEInconclusiveError, SSEOperationError } from '@/integrations/api/sse/errors';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig, isAxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import {
	explainDeployFailure,
	explainDeployFailureText,
	MISSING_ROOT_PACKAGE_JSON_MESSAGE,
} from './explainDeployFailure';
import { DeployRolloutError } from './restartJob';

const LINUX = "ENOENT: no such file or directory, open '/tmp/harper-git-clone-oXPS7c/package.json'";
const MAC = "ENOENT: no such file or directory, open '/var/folders/qs/x/T/harper-git-clone-AbC123/package.json'";
const WINDOWS =
	"ENOENT: no such file or directory, open 'C:\\Users\\h\\AppData\\Local\\Temp\\harper-git-clone-q1W2e3\\package.json'";

function axiosFailure(data: unknown) {
	const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
	return new AxiosError('Request failed with status code 500', AxiosError.ERR_BAD_RESPONSE, config, undefined, {
		data,
		status: 500,
		statusText: 'Internal Server Error',
		headers: {},
		config,
	});
}

describe('explainDeployFailureText', () => {
	it.each([LINUX, MAC, WINDOWS])('replaces the missing root package.json failure: %s', (raw) => {
		expect(explainDeployFailureText(raw)).toBe(MISSING_ROOT_PACKAGE_JSON_MESSAGE);
	});

	it('still recognizes the failure when Harper wraps it', () => {
		expect(explainDeployFailureText(`Failed to deploy my-app: ${LINUX}`)).toBe(MISSING_ROOT_PACKAGE_JSON_MESSAGE);
		expect(explainDeployFailureText(`Error: ENOENT\n    at open '/tmp/harper-git-clone-oXPS7c/package.json'`))
			.toBe(MISSING_ROOT_PACKAGE_JSON_MESSAGE);
	});

	it.each([LINUX, WINDOWS])('recognizes the failure inside an event serialized as JSON: %s', (raw) => {
		expect(explainDeployFailureText(JSON.stringify({ message: raw, code: 500, phase: 'prepare' })))
			.toBe(MISSING_ROOT_PACKAGE_JSON_MESSAGE);
	});

	it('leaves other failures alone, including other files in the clone and other ENOENTs', () => {
		const others = [
			'Failed to deploy private repository git@github.com:acme/widgets.git: SSH access failed.',
			"ENOENT: no such file or directory, open '/tmp/harper-git-clone-oXPS7c/config.yaml'",
			"ENOENT: no such file or directory, open '/home/harper/app/package.json'",
			'The operation failed.',
		];
		for (const text of others) {
			expect(explainDeployFailureText(text)).toBe(text);
		}
	});

	it('never names the temporary clone directory', () => {
		expect(explainDeployFailureText(LINUX)).not.toMatch(/harper-git-clone|\/tmp\//);
	});
});

describe('explainDeployFailure', () => {
	it('swaps a streamed failure for one carrying the guidance, keeping its type and details', () => {
		const certification = { status: 'rejected', reason: 'canary failed', restored: null, failed_closed: true };
		const raw = new SSEOperationError(LINUX, { code: 'ENOENT', phase: 'prepare', deploymentId: 'd1', certification });
		const explained = explainDeployFailure(raw);

		expect(explained).toBeInstanceOf(SSEOperationError);
		const { message, code, phase, deploymentId } = explained as SSEOperationError;
		expect({ message, code, phase, deploymentId }).toEqual({
			message: MISSING_ROOT_PACKAGE_JSON_MESSAGE,
			code: 'ENOENT',
			phase: 'prepare',
			deploymentId: 'd1',
		});
		expect((explained as SSEOperationError).certification).toBe(certification);
	});

	it.each([
		[
			'an `{ error }` string, as deploy_component sends',
			{ error: LINUX, phase: 'prepare', deployment_id: 'd1' },
			{ error: MISSING_ROOT_PACKAGE_JSON_MESSAGE, phase: 'prepare', deployment_id: 'd1' },
		],
		[
			'an `{ error, message }` record',
			{ error: 'ENOENT', message: LINUX },
			{ error: MISSING_ROOT_PACKAGE_JSON_MESSAGE },
		],
		[
			'RFC 9457 Problem Details',
			{ code: 'ENOENT', title: LINUX, status: 500 },
			{ error: MISSING_ROOT_PACKAGE_JSON_MESSAGE, code: 'ENOENT', status: 500 },
		],
		['a bare string body', LINUX, MISSING_ROOT_PACKAGE_JSON_MESSAGE],
	])('swaps a buffered failure whose body is %s, keeping the HTTP envelope and body shape', (_, data, expected) => {
		const raw = axiosFailure(data);
		const explained = explainDeployFailure(raw);

		expect(isAxiosError(explained)).toBe(true);
		const { message, status, config, response } = explained as AxiosError;
		expect(message).toBe(MISSING_ROOT_PACKAGE_JSON_MESSAGE);
		expect(status).toBe(500);
		expect(config).toBe(raw.config);
		expect(response?.data).toStrictEqual(expected);
		expect(JSON.stringify(response?.data)).not.toContain('harper-git-clone');
	});

	it('returns any other error untouched', () => {
		const others = [
			new SSEOperationError('Failed to clone package acme/widgets: fatal: repository not found'),
			new SSEInconclusiveError('stream ended'),
			new DeployRolloutError({ jobId: 'j1', state: 'failed', nodes: [], message: 'node-2 did not restart' }, 'd1'),
			axiosFailure({ error: 'Error', message: 'Component not found' }),
			new Error(LINUX),
		];
		for (const error of others) {
			expect(explainDeployFailure(error)).toBe(error);
		}
	});
});
