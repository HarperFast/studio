/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tree = vi.hoisted(() => ({ name: 'components', entries: [] }));
const post = vi.hoisted(() => vi.fn(async () => ({ data: tree })));

vi.mock('@/config/useInstanceClient', () => {
	const params = { entityId: 'instance-1', entityType: 'instance', instanceClient: { post } };
	return { useInstanceClientIdParams: () => params as typeof params & { instanceClient: AxiosInstance } };
});
vi.mock('@/config/useEntityRestURL', () => ({ useEntityRestURL: () => 'https://instance.example.com:9925' }));
vi.mock('@tanstack/react-router', () => {
	const navigate = () => {};
	const search = {};
	return { useNavigate: () => navigate, useSearch: () => search, useParams: () => ({ instanceId: 'instance-1' }) };
});

import { EditorViewProvider } from './EditorViewProvider';

const key = ['instance-1', 'get_components'];

async function captureReloadThenUnmount() {
	const queryClient = new QueryClient();
	function wrapper({ children }: PropsWithChildren) {
		return (
			<QueryClientProvider client={queryClient}>
				<EditorViewProvider>{children}</EditorViewProvider>
			</QueryClientProvider>
		);
	}
	const { result, unmount } = renderHook(() => useEditorView(), { wrapper });
	await waitFor(() => expect(queryClient.getQueryData(key)).toEqual(tree));
	const { reloadRootEntries } = result.current;
	unmount();
	post.mockClear();
	return { queryClient, reloadRootEntries };
}

afterEach(() => {
	cleanup();
	clearSessionStorage();
	post.mockClear();
});

describe('EditorViewProvider reloadRootEntries', () => {
	it('still fetches the component tree after the editor has unmounted', async () => {
		const { reloadRootEntries } = await captureReloadThenUnmount();

		await expect(reloadRootEntries()).resolves.toEqual(tree);
		expect(post).toHaveBeenCalledWith('/', { operation: 'get_components' });
	});

	it.each([
		['the app signs out', () => authStore.signOutAllLocally()],
		['the instance signs out', () => authStore.signOutLocally('instance-1')],
	])('sends no read once %s', async (_, signOut) => {
		const { queryClient, reloadRootEntries } = await captureReloadThenUnmount();
		signOut();
		queryClient.getQueryCache().clear();

		await expect(reloadRootEntries()).rejects.toThrow('Signed out');
		expect(post).not.toHaveBeenCalled();
		expect(queryClient.getQueryData(key)).toBeUndefined();
	});
});
