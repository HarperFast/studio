/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { auth, mutate } = vi.hoisted(() => ({
	auth: { user: { firstname: 'Ada', lastname: 'Lovelace' } },
	mutate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useCloudAuth: () => auth }));
vi.mock('@/features/auth/store/authStore', () => ({ authStore: { reloadUser: vi.fn() }, OverallAppSignIn: 'app' }));
vi.mock('@/features/organizations/hooks/useCreateNewOrganization', () => ({
	useCreateNewOrganizationMutation: () => ({ mutate, isPending: false }),
}));

import { NewOrgForm } from './NewOrgForm';

afterEach(() => {
	cleanup();
	mutate.mockReset();
	auth.user = { firstname: 'Ada', lastname: 'Lovelace' };
});

function submit() {
	fireEvent.click(screen.getByRole('button', { name: /Create organization/ }));
}

function submittedPayload() {
	return mutate.mock.calls[0][0];
}

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

	it('submits a typed name unchanged', async () => {
		renderForm();
		fireEvent.change(screen.getByLabelText('Name'), { target: { value: "Ben & Jerry's (EU)" } });
		submit();
		await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
		expect(submittedPayload()).toEqual({ name: "Ben & Jerry's (EU)", subdomain: 'ben-jerry-s-eu' });
	});

	it('refuses to submit a typed name with other characters, and says which are allowed', async () => {
		renderForm();
		fireEvent.change(screen.getByLabelText('Name'), { target: { value: '@mallory@evil.com' } });
		submit();
		expect(await screen.findByText(/Please only use letters, digits, spaces/)).toBeTruthy();
		expect(mutate).not.toHaveBeenCalled();
	});

	it("submits the user's name without accents when the name is left blank", async () => {
		auth.user = { firstname: 'José', lastname: 'García' };
		renderForm();
		submit();
		await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
		expect(submittedPayload()).toEqual({ name: 'Jose Garcia Org', subdomain: 'jose-garcia-org' });
	});

	it("submits the fallback name when the user's name has letters with no unaccented form", async () => {
		auth.user = { firstname: 'Łukasz', lastname: 'Nowak' };
		renderForm();
		submit();
		await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
		expect(submittedPayload()).toEqual({ name: 'My Organization', subdomain: 'my-organization' });
	});
});
