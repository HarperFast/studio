/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import type { LocalUser } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => {
	const router = { invalidate: vi.fn() };
	return {
		Navigate: ({ to }: { to: string }) => <div>redirected to {to}</div>,
		useNavigate: () => navigate,
		useParams: () => ({ clusterId: 'clu-1' }),
		useRouter: () => router,
		useSearch: () => ({}),
	};
});
vi.mock('@/components/Breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useCloudAuth: () => ({ user: { email: 'owner@example.com' } }) }));
vi.mock('@/lib/urls/getOperationsUrlForCluster', () => ({
	getOperationsUrlForCluster: () => 'https://clu-1.example.com:9925/',
}));
const cluster = {
	id: 'clu-1',
	organizationId: 'org-1',
	resetPassword: true,
	status: 'RUNNING',
	instances: [{ id: 'ins-1', status: 'RUNNING', tempPassword: 'temp-password' }],
};
vi.mock('./queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: [clusterId],
		queryFn: async () => cluster,
		staleTime: Infinity,
	}),
	markClusterPasswordSet: vi.fn().mockResolvedValue(undefined),
}));

const newAdmin = { username: 'owner@example.com' } as LocalUser;
const mutate = vi.fn((_params: unknown, { onSuccess }: { onSuccess: (response: unknown) => Promise<void> }) =>
	onSuccess({ message: 'Login successful', user: newAdmin })
);
vi.mock('@/integrations/api/instance/auth/useInstanceResetPasswordMutation', () => ({
	useInstanceResetPasswordMutation: () => ({ isPending: false, mutate }),
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() } }));

import { FinishSetup } from './FinishSetup';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	toastSuccess.mockReset();
	mutate.mockClear();
});

async function createAdminUser() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(['clu-1'], cluster);
	render(
		<QueryClientProvider client={client}>
			<FinishSetup />
		</QueryClientProvider>,
	);
	await waitFor(() => expect(screen.getByLabelText('Confirm Password')).toBeTruthy());
	fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-strong-password-1' } });
	fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'a-strong-password-1' } });
	fireEvent.click(screen.getByRole('button', { name: 'Create Admin User' }));
}

describe(FinishSetup, () => {
	it('confirms the admin user was created instead of relaying the login response', async () => {
		const setUser = vi.spyOn(authStore, 'setUserForEntity').mockImplementation(() => undefined);
		await createAdminUser();
		await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
		expect(toastSuccess).toHaveBeenCalledWith("Admin user created. You're now signed in to your cluster.");
		expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'clu-1' }), newAdmin);
	});

	it('says to connect when setup finished but could not connect again', async () => {
		mutate.mockImplementationOnce((_params, { onSuccess }) => onSuccess({ message: 'Login successful', user: null }));
		const setUser = vi.spyOn(authStore, 'setUserForEntity').mockImplementation(() => undefined);
		await createAdminUser();
		await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
		expect(toastSuccess).toHaveBeenCalledWith('Admin user created. Connect to your cluster to continue.');
		expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'clu-1' }), null);
	});

	it('hands setup the direct URL and every id it must sign out first', async () => {
		vi.spyOn(authStore, 'setUserForEntity').mockImplementation(() => undefined);
		await createAdminUser();
		await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
		expect(mutate).toHaveBeenCalledWith(
			expect.objectContaining({ operationsUrl: 'https://clu-1.example.com:9925/', signInIds: ['clu-1', 'ins-1'] }),
			expect.anything(),
		);
	});
});
