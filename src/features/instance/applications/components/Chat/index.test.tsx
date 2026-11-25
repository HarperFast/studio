/** @vitest-environment jsdom */
import { Chat } from '@/features/instance/applications/components/Chat';
import { getChatUsageQueryOptions } from '@/integrations/api/chat/getChatUsage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	chatOptions: undefined as undefined | { onFinish: () => void },
}));

vi.mock('@/config/apiClient', () => ({ apiClient: { get: mocks.get } }));
vi.mock('@ai-sdk/react', () => {
	const chat = { messages: [], sendMessage: vi.fn(), status: 'ready', addToolOutput: vi.fn(), setMessages: vi.fn() };
	return {
		useChat: (options: { onFinish: () => void }) => {
			mocks.chatOptions = options;
			return chat;
		},
	};
});
vi.mock('@tanstack/react-router', () => {
	const params = { organizationId: 'org-1' };
	return { useParams: () => params };
});
vi.mock('@/config/useEntityRestURL', () => ({ useEntityRestURL: () => null }));
vi.mock('@/config/useInstanceClient', () => {
	const params = {};
	return { useInstanceClientIdParams: () => params };
});
vi.mock('./tools/clientTools', () => ({ getTool: () => undefined }));

const USAGE_URL = '/Chat/Usage/org-1';
const usage = { userId: 'u-1', yearMonth: '2026-11', usageUSD: 1, monthlyLimitUSD: 10, usageBarPercent: 10 };

function httpError(status: number) {
	const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
	return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: { error: 'refused' },
	});
}

function answerUsageWith(answer: () => Promise<unknown>) {
	mocks.get.mockImplementation((url: string) => url === USAGE_URL ? answer() : Promise.resolve({ data: [] }));
}

const usageRequests = () => mocks.get.mock.calls.filter(([url]) => url === USAGE_URL).length;
const usageState = (client: QueryClient) => client.getQueryState(getChatUsageQueryOptions('org-1').queryKey);

function renderChat() {
	const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
	render(
		<QueryClientProvider client={client}>
			<Chat autoFocus={false} closeChat={() => {}} />
		</QueryClientProvider>,
	);
	return client;
}

function finishTurn() {
	act(() => mocks.chatOptions!.onFinish());
}

beforeAll(() => {
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	sessionStorage.clear();
	localStorage.clear();
});

describe('Chat usage after a turn', () => {
	it('does not ask a member refused usage again', async () => {
		answerUsageWith(() => Promise.reject(httpError(403)));
		const client = renderChat();
		await waitFor(() => expect(usageState(client)?.status).toBe('error'));
		expect(usageRequests()).toBe(1);

		finishTurn();
		finishTurn();
		await act(async () => {});

		expect(usageRequests()).toBe(1);
	});

	it('re-reads a permitted member’s usage after each turn', async () => {
		answerUsageWith(() => Promise.resolve({ data: usage }));
		renderChat();
		await screen.findByText('Monthly Org Usage');
		expect(usageRequests()).toBe(1);

		finishTurn();
		await waitFor(() => expect(usageRequests()).toBe(2));
		finishTurn();
		await waitFor(() => expect(usageRequests()).toBe(3));
	});

	it('still re-reads after a server failure, which is not a refusal', async () => {
		answerUsageWith(() => Promise.reject(httpError(500)));
		const client = renderChat();
		await waitFor(() => expect(usageState(client)?.status).toBe('error'));
		const before = usageRequests();

		finishTurn();
		await waitFor(() => expect(usageRequests()).toBeGreaterThan(before));
	});
});
