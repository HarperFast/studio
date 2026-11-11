import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { clusterHeldByWorkflow } from './clusterHeldByWorkflow';

function refused(status: number, data: unknown, url = '/Cluster/clu-1') {
	const config = { url, method: 'put' } as InternalAxiosRequestConfig;
	return new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, undefined, {
		status,
		statusText: '',
		data,
		headers: {},
		config,
	});
}

// Central manager's two wordings: assertClusterMutable and admitClusterContainerOp.
const MUTATION = 'Cluster is held by workflow wf-abc123; wait for it to finish before the update';
const CONTAINER_OP = 'Cluster is held by workflow wf-abc123; a cluster-wide restart must wait for it to finish.';

describe('clusterHeldByWorkflow', () => {
	it.each([
		['a cluster update, as an RFC 9457 title', refused(409, { code: 'Conflict', title: MUTATION })],
		['a cluster update, as a bare string', refused(409, MUTATION)],
		['a cluster update, as { error }', refused(409, { error: MUTATION })],
		[
			'a cluster-wide container op',
			refused(409, { title: CONTAINER_OP }, '/Cluster/clu-1/container/restart'),
		],
	])('recognizes %s', (_case, error) => {
		expect(clusterHeldByWorkflow(error)).toEqual({ workflowId: 'wf-abc123', clusterId: 'clu-1' });
	});

	it('names no cluster when the refused request was not a /Cluster/<id> call', () => {
		expect(clusterHeldByWorkflow(refused(409, { title: MUTATION }, '/Admin/MoveInstance/'))).toEqual({
			workflowId: 'wf-abc123',
			clusterId: null,
		});
	});

	it('reads the cluster from a URL that carries a query string', () => {
		expect(clusterHeldByWorkflow(refused(409, { title: MUTATION }, '/Cluster/clu-1?x=1'))?.clusterId).toBe('clu-1');
	});

	it('still recognizes the refusal when the URL is malformed, naming no cluster', () => {
		expect(clusterHeldByWorkflow(refused(409, { title: MUTATION }, '/Cluster/%E0%A4%A'))).toEqual({
			workflowId: 'wf-abc123',
			clusterId: null,
		});
	});

	it.each([
		['another 409', refused(409, { title: 'Workflow wf-1 already has a pending pause command' })],
		['the same sentence on another status', refused(400, { title: MUTATION })],
		['a 409 with no body', refused(409, undefined)],
		['an error that is not an axios error', new Error(MUTATION)],
	])('ignores %s', (_case, error) => {
		expect(clusterHeldByWorkflow(error)).toBeNull();
	});
});
