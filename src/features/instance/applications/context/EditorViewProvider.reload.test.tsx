/** @vitest-environment jsdom */
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
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

let editorView: ReturnType<typeof useEditorView>;

function Probe() {
	editorView = useEditorView();
	return null;
}

afterEach(() => {
	cleanup();
	clearSessionStorage();
	post.mockClear();
});

describe('EditorViewProvider reloadRootEntries', () => {
	it('still fetches the component tree after the editor has unmounted', async () => {
		const queryClient = new QueryClient();
		const view = render(
			<QueryClientProvider client={queryClient}>
				<EditorViewProvider>
					<Probe />
				</EditorViewProvider>
			</QueryClientProvider>,
		);
		await waitFor(() => expect(queryClient.getQueryData(['instance-1', 'get_components'])).toEqual(tree));
		const { reloadRootEntries } = editorView;
		view.unmount();
		post.mockClear();

		await expect(reloadRootEntries()).resolves.toEqual(tree);
		expect(post).toHaveBeenCalledWith('/', { operation: 'get_components' });
	});
});
