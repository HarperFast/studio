import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/api/sse/resolveInstanceConnection', () => ({
	resolveInstanceConnection: () => ({
		url: 'https://host:9925/',
		headers: { Accept: 'text/event-stream' },
		credentials: 'include' as RequestCredentials,
	}),
}));

import { deployComponentStream } from './deployComponentStream';
import { deployFailureDetails, readCertificationDecision } from './deployOutcome';
import { DeployRolloutError } from './restartJob';

// The decision a rejected deploy carries on both transports: harper `components/operations.js:1094`
// (buffered body) and `:1101-1109` (streamed `error` event), built by `certificationFailure` (:1222-1247).
const REJECTION = {
	status: 'rejected',
	reason: 'web.jsResource: Cannot find module ./missing.js',
	failures: [{ key: 'web.jsResource', name: 'Error', message: 'Cannot find module ./missing.js', stack: '...' }],
	restored: 'a3f8c2d1-0000-4000-8000-000000000000',
	failed_closed: false,
};
const MESSAGE = 'web was not deployed: release 9b2e failed to load in its canary worker: web.jsResource: '
	+ 'Cannot find module ./missing.js. Deployment a3f8c2d1, the release it replaced, is live again. '
	+ 'No other node received it. Deploy a fix, or activate deployment 9b2e again once the cause is fixed.';

function sseResponse(body: string): Response {
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(body));
			controller.close();
		},
	});
	return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function streamDeploy() {
	return deployComponentStream({
		connection: { id: 'ins-1' },
		package: 'npm:web',
		project: 'web',
		replicated: true,
		restart: 'rolling',
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('deployFailureDetails', () => {
	it("reads the canary's decision off a streamed rejection", async () => {
		const event = { message: MESSAGE, code: 400, phase: 'load', deployment_id: '9b2e', certification: REJECTION };
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(`event: error\ndata: ${JSON.stringify(event)}\n\n`)));

		const failure = await streamDeploy().catch((error: unknown) => error);
		expect(deployFailureDetails(failure)).toEqual({
			deploymentId: '9b2e',
			certification: {
				status: 'rejected',
				reason: REJECTION.reason,
				restored: REJECTION.restored,
				failedClosed: false,
			},
		});
	});

	it('reads the same decision off a buffered rejection', () => {
		const error = new AxiosError('Request failed with status code 400');
		error.response = {
			status: 400,
			data: { error: MESSAGE, phase: 'load', deployment_id: '9b2e', certification: REJECTION },
		} as AxiosError['response'];
		expect(deployFailureDetails(error)).toEqual({
			deploymentId: '9b2e',
			certification: {
				status: 'rejected',
				reason: REJECTION.reason,
				restored: REJECTION.restored,
				failedClosed: false,
			},
		});
	});

	it('keeps the record id of a deploy whose restart job failed', () => {
		const error = new DeployRolloutError({ jobId: 'job-1', state: 'failed', nodes: [] }, 'd1');
		expect(deployFailureDetails(error)).toEqual({ deploymentId: 'd1' });
	});

	it('reads nothing from a failure that carries neither', () => {
		expect(deployFailureDetails(new Error('boom'))).toEqual({});
		expect(deployFailureDetails('Request failed')).toEqual({});
		expect(deployFailureDetails(undefined)).toEqual({});
	});
});

describe('readCertificationDecision', () => {
	it('reads a release with nothing to go back to as failed closed', () => {
		expect(readCertificationDecision({ status: 'rejected', reason: 'boom', restored: null, failed_closed: true }))
			.toEqual({ status: 'rejected', reason: 'boom', restored: null, failedClosed: true });
	});

	it.each([
		['the success string', 'certified'],
		['no status', { reason: 'boom' }],
		['an array', [REJECTION]],
		['null', null],
	])('is not fooled by %s', (_label, value) => {
		expect(readCertificationDecision(value)).toBeUndefined();
	});
});

describe('deployComponentStream', () => {
	it('forwards and keeps the warnings the deploy streamed', async () => {
		const drift = "Install fingerprints differ from this node's on 1 of 2 peer node(s): node-b (source npm:web@1.5.0).";
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				sseResponse(
					`event: warning\ndata: ${JSON.stringify({ message: drift })}\n\n`
						+ `event: done\ndata: ${
							JSON.stringify({ result: { message: `Successfully deployed: web ${drift}`, certification: 'certified' } })
						}\n\n`,
				),
			),
		);

		const events: unknown[] = [];
		const result = await deployComponentStream({
			connection: { id: 'ins-1' },
			package: 'npm:web',
			project: 'web',
			replicated: true,
			onEvent: (event) => events.push(event),
		});
		expect(events).toEqual([{ type: 'warning', data: { message: drift } }]);
		expect(result).toMatchObject({ certification: 'certified', warnings: [drift] });
	});
});
