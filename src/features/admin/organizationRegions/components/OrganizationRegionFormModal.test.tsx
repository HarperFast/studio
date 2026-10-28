/**
 * @vitest-environment jsdom
 */
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, patch, post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { OrganizationRegion } from '@/integrations/api/api.patch';
import { UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { toast } from 'sonner';
import { OrganizationRegionFormModal } from './OrganizationRegionFormModal';

const region: OrganizationRegion = {
	id: 'oreg-1',
	organizationId: 'org-1',
	name: 'EU edge',
	placement: { gcp: ['europe-west1-b'] },
	fallbackGroup: null,
	active: true,
};

/** A PATCH that reached the server but whose response never came back. */
function lostResponse(): AxiosError {
	return {
		isAxiosError: true,
		code: 'ERR_NETWORK',
		message: 'Network Error',
		config: { method: 'patch', url: '/OrganizationRegion/oreg-1' },
	} as AxiosError;
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	get.mockImplementation(async (url: string) => {
		if (url === '/Location/') {
			return { data: [{ location: 'europe-west1-b', locationName: 'Belgium', cloudProvider: 'gcp', regions: [] }] };
		}
		if (url.startsWith('/Organization/')) {
			return { data: { id: 'org-1', name: 'Org', channel: 'bravo' } };
		}
		return { data: { ...region, clusters: [] } };
	});
});
afterEach(() => {
	consoleError.mockRestore();
	vi.resetAllMocks();
});

describe('OrganizationRegionFormModal', () => {
	it('tells the user a lost write may have applied, and still reports it', async () => {
		patch.mockRejectedValue(lostResponse());
		const client = new QueryClient({
			mutationCache: new MutationCache({ onError: mutationErrorHandler }),
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<OrganizationRegionFormModal open={true} onOpenChange={vi.fn()} organizationId="org-1" region={region} />
			</QueryClientProvider>,
		);

		fireEvent.change(await screen.findByDisplayValue('EU edge'), { target: { value: 'EU core' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect((await screen.findByRole('alert')).textContent).toBe(UNANSWERED_WRITE_MESSAGE);
		await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ code: 'ERR_NETWORK' })));
		expect(toast.error).not.toHaveBeenCalled();
	});
});
