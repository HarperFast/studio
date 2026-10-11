/**
 * @vitest-environment jsdom
 */
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { queryClient } from '@/react-query/queryClient';
import { useNewRouter } from '@/router/useNewRouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { get, signedIn } = vi.hoisted(() => ({
	get: vi.fn(),
	signedIn: { isLoading: false, user: { id: 'usr-1', roles: {} } },
}));

vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...await importOriginal<typeof import('@/hooks/useAuth')>(),
	useOverallAuth: () => signedIn,
}));
vi.mock('@/components/StudioCloud', async () => {
	const { Outlet } = await import('@tanstack/react-router');
	return { StudioCloud: Outlet };
});
vi.mock('@/features/layouts/Dashboard', async () => {
	const { Outlet } = await import('@tanstack/react-router');
	return { Dashboard: Outlet };
});

function rejectWith(status: number) {
	get.mockImplementation(async (url: string) => {
		const config = { headers: new AxiosHeaders(), url } as InternalAxiosRequestConfig;
		throw new AxiosError(
			`Request failed with status code ${status}`,
			status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
			config,
			{},
			{ status, statusText: '', data: { title: 'Forbidden' }, headers: {}, config },
		);
	});
}

function App() {
	const router = useNewRouter({ authentication: { [OverallAppSignIn]: signedIn } as never });
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	);
}

async function openOrganization(organizationId: string) {
	window.location.hash = `#/${organizationId}`;
	render(<App />);
	return screen.findByRole('heading', {}, { timeout: 5000 });
}

afterEach(() => {
	cleanup();
	queryClient.clear();
	get.mockReset();
});

describe('OrgRouteError on the organization route', () => {
	it('tells a user who is not a member that they have no access, without confirming the org exists', async () => {
		rejectWith(403);
		const heading = await openOrganization('org-not-mine');

		expect(get).toHaveBeenCalledWith('/Organization/org-not-mine');
		expect(heading.textContent).toBe('No Access to This Organization');
		expect(screen.getByText(/doesn't exist, or your account isn't a member of it/)).toBeTruthy();
		expect(screen.queryByText(/Component Error|Request failed with status code|Forbidden/)).toBeNull();
		expect(screen.getByRole('link', { name: /Return to Home/ }).getAttribute('href')).toBe('/#/');
	});

	it('says the organization does not exist when central manager answers 404', async () => {
		rejectWith(404);
		const heading = await openOrganization('org-missing');

		expect(heading.textContent).toBe('Organization Not Found');
		expect(screen.queryByText(/Request failed with status code/)).toBeNull();
	});

	it('leaves any other failure to the generic error page', async () => {
		rejectWith(500);
		const heading = await openOrganization('org-broken');

		expect(heading.textContent).not.toMatch(/Organization/);
		expect(screen.getByText('Request failed with status code 500')).toBeTruthy();
	});
});
