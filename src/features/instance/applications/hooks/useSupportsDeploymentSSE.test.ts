/** @vitest-environment jsdom */
import { queryErrorHandler } from '@/react-query/queryClient';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { createElement, ReactNode } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	supportsReleaseTracking,
	supportsStagedDeployments,
	useDeploymentsAvailable,
	useStagedDeploymentsAvailable,
} from './useSupportsDeploymentSSE';

const mocks = vi.hoisted(() => {
	const post = vi.fn();
	return { post, instanceParams: { entityId: 'ins-1', entityType: 'instance', instanceClient: { post } } };
});

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => mocks.instanceParams }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));

describe('supportsStagedDeployments', () => {
	it.each([
		['5.3.0', true],
		['5.3.2', true],
		['5.4.0', true],
		['6.0.0', true],
		['5.2.15', false],
		['4.7.9', false],
		// An older node reads `activate: false` as an ordinary deploy, so anything short of a release is refused.
		['5.3.0-beta.4', false],
		[undefined, false],
		['not a version', false],
	])('%s -> %s', (version, expected) => {
		expect(supportsStagedDeployments(version)).toBe(expected);
	});
});

describe('supportsReleaseTracking', () => {
	it.each([
		['5.4.0-alpha.1', true],
		['5.4.0-beta.2', true],
		['5.4.0', true],
		['5.3.5', false],
		['5.4.0-alpha.0', false],
		[undefined, false],
	])('%s -> %s', (version, expected) => {
		expect(supportsReleaseTracking(version)).toBe(expected);
	});
});

function failedWith(status: number) {
	const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
	return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: { error: 'refused' },
	});
}

function renderRedeployVersionReads() {
	const queryClient = new QueryClient({
		queryCache: new QueryCache({ onError: queryErrorHandler }),
		defaultOptions: { queries: { retryDelay: 0 } },
	});
	const rendered = renderHook(
		() => ({ deployments: useDeploymentsAvailable(), staging: useStagedDeploymentsAvailable() }),
		{
			wrapper: ({ children }: { children: ReactNode }) =>
				createElement(QueryClientProvider, { client: queryClient }, children),
		},
	);
	const settled = () =>
		waitFor(() => expect(queryClient.getQueryState(['registration_info', 'ins-1'])?.status).toBe('error'));
	return { ...rendered, settled };
}

describe('the version read behind staging', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});
	afterEach(() => {
		mocks.post.mockReset();
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it('takes a refused registration_info as "staging not offered": one request, no toast, no RUM report', async () => {
		mocks.post.mockRejectedValue(failedWith(403));
		const { result, settled } = renderRedeployVersionReads();
		await settled();

		expect(mocks.post).toHaveBeenCalledOnce();
		expect(result.current).toEqual({ deployments: false, staging: false });
		expect(toast.error).not.toHaveBeenCalled();
		expect(console.error).not.toHaveBeenCalled();
	});

	it('still retries and toasts a failure that is not a refusal', async () => {
		const failure = failedWith(500);
		mocks.post.mockRejectedValue(failure);
		const { result, settled } = renderRedeployVersionReads();
		await settled();

		expect(mocks.post).toHaveBeenCalledTimes(4);
		expect(result.current.staging).toBe(false);
		expect(toast.error).toHaveBeenCalledOnce();
		expect(console.error).toHaveBeenCalledWith(failure);
	});
});
