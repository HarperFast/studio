/** @vitest-environment jsdom */
import { getInstanceClient } from '@/config/getInstanceClient';
import { usePackageComponentMutation } from '@/integrations/api/instance/applications/packageComponent';
import { OUTCOME_UNKNOWN_TITLE, UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { describeError, mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { PropsWithChildren } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

vi.mock('@/lib/sleep', () => ({
	sleep: vi.fn().mockResolvedValue(true),
}));

vi.mock('sonner', () => ({
	toast: { error: vi.fn(), dismiss: vi.fn() },
}));

const GATEWAY_BODY = '<html><head><title>504 Gateway Time-out</title></head></html>';

function instanceClient(fail: (config: InternalAxiosRequestConfig) => never) {
	const client = getInstanceClient({ id: 'ins-123', operationsUrl: 'https://ins-123.example.com:9925/' });
	client.defaults.adapter = async (config: InternalAxiosRequestConfig) => fail(config);
	return client;
}

function answering(status: number, data: unknown = GATEWAY_BODY) {
	return (config: InternalAxiosRequestConfig): never => {
		throw new AxiosError(
			`Request failed with status code ${status}`,
			status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
			config,
			undefined,
			{ status, statusText: '', data, headers: {}, config },
		);
	};
}

function timingOut(config: InternalAxiosRequestConfig): never {
	throw new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, config);
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
	return promise.then(() => expect.unreachable('the request should have failed'), (error: unknown) => error);
}

describe('a write that got no verdict, through a real instance client', () => {
	let consoleMock: MockInstance<Console['error']>;

	beforeEach(() => {
		vi.clearAllMocks();
		consoleMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		consoleMock?.mockRestore();
	});

	it.each([
		['a 504 on insert', answering(504), 'insert'],
		['a 502 on deploy_component', answering(502), 'deploy_component'],
		['a 503 on restart', answering(503, 'The worker thread executing this operation exited'), 'restart'],
		['a timeout on drop_table', timingOut, 'drop_table'],
	])('toasts %s as an unknown outcome, never the gateway body', async (_label, fail, operation) => {
		const client = instanceClient(fail);
		const mutationClient = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
		const observer = new MutationObserver(mutationClient, {
			mutationFn: () => client.post('/', { operation }),
		});

		await expect(observer.mutate()).rejects.toBeInstanceOf(AxiosError);

		expect(toast.error).toHaveBeenCalledOnce();
		expect(toast.error).toHaveBeenCalledWith(OUTCOME_UNKNOWN_TITLE, {
			id: undefined,
			description: UNANSWERED_WRITE_MESSAGE,
			action: { label: 'Dismiss', onClick: expect.any(Function) },
		});
	});

	it('keeps the server’s words for a write it refused', async () => {
		const client = instanceClient(answering(400, { error: 'Table "dog" already exists' }));

		const error = await failureOf(client.post('/', { operation: 'create_table', table: 'dog' }));

		expect(describeError(error).message).toBe('Table "dog" already exists');
	});

	it('keeps a read’s own failure text once the gateway retry gives up on it', async () => {
		const client = instanceClient(answering(504));

		const error = await failureOf(client.post('/', { operation: 'describe_all' }));

		expect(describeError(error).message).toBe(GATEWAY_BODY);
	});

	it('sends a package download once, and never says it may have gone through', async () => {
		const sent: string[] = [];
		const client = instanceClient((config) => {
			sent.push(String(config.data));
			return answering(504)(config);
		});
		const queryClient = new QueryClient();
		const { result } = renderHook(() => usePackageComponentMutation(), {
			wrapper: ({ children }: PropsWithChildren) => (
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			),
		});

		const error = await failureOf(result.current.mutateAsync({ project: 'app', instanceClient: client }));

		expect(sent).toHaveLength(1);
		expect(describeError(error).message).toBe(GATEWAY_BODY);
	});
});
