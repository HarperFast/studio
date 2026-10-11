/** @vitest-environment jsdom */
import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { getDeploymentQueryOptions } from './getDeployment';
import { getDeploymentsQueryOptions } from './listDeployments';
import type { Deployment, DeploymentStatus, ListDeploymentsResponse } from './types';

type PollState<TData> = { error: unknown; errorUpdatedAt?: number; dataUpdatedAt?: number; data?: TData };
type IntervalFn<TData> = (query: { state: PollState<TData> }) => number | false | undefined;

function httpError(status: number): AxiosError {
	const err = new AxiosError(`Request failed with status code ${status}`);
	err.response = { status } as AxiosError['response'];
	return err;
}

const instance = { entityId: 'ins-test' as never, instanceClient: {} as AxiosInstance };

function detailInterval(pollWhileActive = true) {
	const { refetchInterval } = getDeploymentQueryOptions({ ...instance, deploymentId: 'dep-1', pollWhileActive });
	return refetchInterval as unknown as IntervalFn<Deployment>;
}

function listInterval(pollWhileOpen = true) {
	const { refetchInterval } = getDeploymentsQueryOptions({ ...instance, pollWhileOpen });
	return refetchInterval as unknown as IntervalFn<ListDeploymentsResponse> | false;
}

const deployment = (status: DeploymentStatus) => ({ status }) as Deployment;
const list = (...statuses: DeploymentStatus[]) =>
	({ deployments: statuses.map(deployment), total: statuses.length }) as ListDeploymentsResponse;

describe('get_deployment polling', () => {
	it('polls every 2s while the deployment is active and stops once it is terminal', () => {
		const poll = detailInterval();
		expect(poll({ state: { error: null, data: deployment('installing') } })).toBe(2_000);
		expect(poll({ state: { error: null, data: deployment('success') } })).toBe(false);
		expect(poll({ state: { error: null, data: deployment('staged') } })).toBe(false);
	});

	it('does not poll a detail view that never asked to', () => {
		expect(detailInterval(false)({ state: { error: null, data: deployment('installing') } })).toBe(false);
	});

	it('stops on a 403 instead of retrying every 2s', () => {
		expect(detailInterval()({ state: { error: httpError(403), errorUpdatedAt: 0 } })).toBe(false);
	});

	it('backs off a deployment the instance keeps rejecting, rather than polling it every 2s forever', () => {
		// A failed fetch leaves no status, so "until terminal" alone never ends — Harper answers an unknown
		// deployment id with a 400 ("No deployment found with id …").
		const poll = detailInterval();
		const query: { state: PollState<Deployment> } = { state: { error: httpError(400), errorUpdatedAt: 0 } };
		expect(poll(query)).toBe(2_000);
		query.state = { ...query.state, errorUpdatedAt: 10 * 60_000 };
		expect(poll(query)).toBe(5 * 60_000);
	});
});

describe('list_deployments polling', () => {
	it('polls fast while any deployment is active and slower otherwise', () => {
		const poll = listInterval() as IntervalFn<ListDeploymentsResponse>;
		expect(poll({ state: { error: null, data: list('success', 'installing') } })).toBe(2_000);
		expect(poll({ state: { error: null, data: list('success', 'failed') } })).toBe(10_000);
		expect(poll({ state: { error: null, data: list('success', 'staged') } })).toBe(10_000);
		expect(poll({ state: { error: null } })).toBe(10_000);
	});

	it('does not poll unless the view is open', () => {
		expect(listInterval(false)).toBe(false);
	});

	it('stops on a 403 and backs off a sustained 400', () => {
		const poll = listInterval() as IntervalFn<ListDeploymentsResponse>;
		expect(poll({ state: { error: httpError(403), errorUpdatedAt: 0 } })).toBe(false);

		const query: { state: PollState<ListDeploymentsResponse> } = {
			state: { error: httpError(400), errorUpdatedAt: 0 },
		};
		poll(query);
		query.state = { ...query.state, errorUpdatedAt: 60 * 60_000 };
		expect(poll(query)).toBe(5 * 60_000);
	});
});
