/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useCloudAuth: () => ({ user: { firstname: 'Ada', lastname: 'Lovelace' } }) }));
vi.mock('@/features/auth/store/authStore', () => ({ authStore: { reloadUser: vi.fn() }, OverallAppSignIn: 'app' }));
vi.mock('@/features/organizations/hooks/useCreateNewOrganization', () => ({
	useCreateNewOrganizationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { NewOrgForm } from './NewOrgForm';

afterEach(cleanup);

function renderForm() {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<NewOrgForm />
		</QueryClientProvider>,
	);
}

describe('NewOrgForm', () => {
	it('stops the name and subdomain at the lengths the form accepts, and says so there', () => {
		renderForm();
		const name = screen.getByLabelText('Name') as HTMLInputElement;
		const subdomain = screen.getByLabelText('Subdomain') as HTMLInputElement;
		expect(name.maxLength).toBe(255);
		expect(subdomain.maxLength).toBe(62);

		fireEvent.change(name, { target: { value: 'n'.repeat(255) } });
		fireEvent.change(subdomain, { target: { value: 's'.repeat(62) } });
		expect(screen.getByText('Maximum 255 characters reached.')).toBeTruthy();
		expect(screen.getByText('Maximum 62 characters reached.')).toBeTruthy();
	});
});
