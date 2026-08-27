/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateGrantModal } from './CreateGrantModal';

const createGrant = vi.fn();
vi.mock('@/features/admin/grants/mutations/useUpdateGrant', () => ({
	useCreateGrantMutation: () => ({
		mutate: (body: unknown, opts?: { onSuccess?: () => void }) => {
			createGrant(body);
			opts?.onSuccess?.();
		},
		isPending: false,
	}),
}));
vi.mock('@/features/admin/grants/queries/getExpiryPolicies', () => ({
	getExpiryPoliciesQueryOptions: () => ({
		queryKey: ['test-policies'],
		queryFn: async () => ({ editableAtRuntime: false, policies: { 'consumer-trial': [] } }),
		retry: false,
	}),
}));
vi.mock('@/features/admin/regions/queries/getOrganizations', async (importOriginal) => ({
	...(await importOriginal<object>()),
	getOrganizationsQueryOptions: () => ({
		queryKey: ['test-orgs'],
		queryFn: async () => ({ organizations: [{ id: 'org-1', name: 'Acme' }], truncated: false }),
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	createGrant.mockClear();
});

async function mount() {
	const result = render(
		<TestProvider>
			<CreateGrantModal open onOpenChange={() => {}} />
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
	return result;
}

const submit = () => screen.getByRole('button', { name: 'Create grant' });
const reasonBox = () => screen.getByPlaceholderText(/Why this grant exists/);

async function pick(label: string, option: string | RegExp) {
	fireEvent.keyDown(screen.getByLabelText(label), { key: 'ArrowDown' });
	await act(() => null);
	const match = screen.getAllByRole('option').find((o) => (typeof option === 'string'
		? o.textContent === option
		: option.test(o.textContent ?? ''))
	);
	if (!match) { throw new Error(`no option ${String(option)} under ${label}`); }
	fireEvent.click(match);
	await act(() => null);
}

describe('CreateGrantModal', () => {
	// The server accepts clusterId XOR organizationId, so the form asks which rather than offering
	// both and letting the xor fail server-side.
	it('sends an organization for an unbound voucher, and no cluster', async () => {
		await mount();
		await pick('Organization', /org-1/);
		fireEvent.change(reasonBox(), { target: { value: 'conference comp' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);

		const [body] = createGrant.mock.calls[0];
		expect(body.organizationId).toBe('org-1');
		expect(body).not.toHaveProperty('clusterId');
		expect(body.reason).toBe('conference comp');
	});

	it('sends a cluster and no organization when bound to one', async () => {
		await mount();
		await pick('Applies to', /existing cluster/);
		fireEvent.change(screen.getByPlaceholderText('clu-…'), { target: { value: 'clu-abc' } });
		fireEvent.change(reasonBox(), { target: { value: 'pilot' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);

		const [body] = createGrant.mock.calls[0];
		expect(body.clusterId).toBe('clu-abc');
		expect(body).not.toHaveProperty('organizationId');
	});

	it('will not submit without a reason', async () => {
		await mount();
		await pick('Organization', /org-1/);
		expect(submit().hasAttribute('disabled')).toBe(true);
	});

	// A trial must be time-boxed from birth and stay stageable; the server refuses otherwise.
	it('blocks a trial with no end date', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await pick('Source', 'trial');
		fireEvent.change(reasonBox(), { target: { value: 'trial for evaluation' } });
		await act(() => null);
		expect(submit().hasAttribute('disabled')).toBe(true);
		expect(screen.getByText('A trial must have an end date')).toBeTruthy();
	});

	// Only trial, gift and comp — purchased and enterprise belong to the flows that bill.
	it('offers only the sources an admin may mint', async () => {
		await mount();
		fireEvent.keyDown(screen.getByLabelText('Source'), { key: 'ArrowDown' });
		await act(() => null);
		const options = screen.getAllByRole('option').map((o) => o.textContent);
		expect(options).toEqual(['comp', 'gift', 'trial']);
	});

	// A window that never opens would occupy the cluster's live slot while authorizing nothing.
	it('rejects an end date in the past', async () => {
		await mount();
		await pick('Organization', /org-1/);
		fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2020-01-01T00:00' } });
		fireEvent.change(reasonBox(), { target: { value: 'backdated' } });
		await act(() => null);
		expect(screen.getByText('Must be in the future')).toBeTruthy();
		expect(submit().hasAttribute('disabled')).toBe(true);
	});
});
