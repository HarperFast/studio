/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterSecretsKeySetup } from './ClusterSecretsKeySetup';

const { cmPost } = vi.hoisted(() => ({ cmPost: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post: cmPost } }));

beforeAll(() => {
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderSetup(props: { gap: 'missing' | 'delivering'; canUpdate: boolean; onDelivering?: () => void }) {
	const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<ClusterSecretsKeySetup clusterId="clu-1" {...props} />
		</QueryClientProvider>,
	);
}

const created = () => cmPost.mock.calls.filter(([, body]) => body.operation === 'create_secrets_key');

describe('ClusterSecretsKeySetup', () => {
	it('creates the key only after the restart is confirmed', async () => {
		cmPost.mockResolvedValue({ data: { status: 'DELIVERING', workflowId: 'wf-1' } });
		const onDelivering = vi.fn();
		renderSetup({ gap: 'missing', canUpdate: true, onDelivering });

		fireEvent.click(screen.getByRole('button', { name: 'Create secrets key' }));
		expect((await screen.findByRole('alertdialog')).textContent).toContain('restarts to take the key, one at a time');
		expect(created()).toHaveLength(0);

		fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
		await waitFor(() => expect(created()).toHaveLength(1));
		expect(cmPost).toHaveBeenCalledWith('/ClusterSecrets', { operation: 'create_secrets_key', clusterId: 'clu-1' });
		await waitFor(() => expect(onDelivering).toHaveBeenCalledOnce());
	});

	it('sends nothing when the confirmation is cancelled', async () => {
		renderSetup({ gap: 'missing', canUpdate: true });
		fireEvent.click(screen.getByRole('button', { name: 'Create secrets key' }));
		fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(cmPost).not.toHaveBeenCalled();
	});

	it('offers no action to someone who cannot update the cluster', () => {
		renderSetup({ gap: 'missing', canUpdate: false });
		expect(screen.getByText('This cluster has no secrets key yet')).toBeTruthy();
		expect(screen.getByText(/Someone with permission to update this cluster/)).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('reports a delivery in progress, and lets an updater send it again', async () => {
		cmPost.mockResolvedValue({ data: { status: 'DELIVERING', workflowId: 'wf-2' } });
		renderSetup({ gap: 'delivering', canUpdate: true });
		expect(screen.getByRole('status').textContent).toContain('The instances restart one at a time to take the key');
		fireEvent.click(screen.getByRole('button', { name: 'try again' }));
		await waitFor(() => expect(created()).toHaveLength(1));
	});

	it('shows a delivery in progress without the retry to someone who cannot update the cluster', () => {
		renderSetup({ gap: 'delivering', canUpdate: false });
		expect(screen.getByRole('status')).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
	});
});
