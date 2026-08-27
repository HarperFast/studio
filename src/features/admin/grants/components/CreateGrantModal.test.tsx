/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateGrantModal } from './CreateGrantModal';

const createGrant = vi.fn();
const onCreated = vi.fn();
vi.mock('@/features/admin/grants/mutations/useUpdateGrant', () => ({
	useCreateGrantMutation: () => ({
		mutate: (body: unknown, opts?: { onSuccess?: (grant: unknown) => void }) => {
			createGrant(body);
			opts?.onSuccess?.({ id: 'grt-created', ...(body as object) });
		},
		isPending: false,
	}),
}));
vi.mock('@/features/admin/grants/queries/getExpiryPolicies', () => ({
	getExpiryPoliciesQueryOptions: () => ({
		queryKey: ['test-policies'],
		queryFn: async () => ({
			editableAtRuntime: false,
			policies: { 'consumer-trial': [], 'conversion-pending': [] },
		}),
		retry: false,
	}),
}));
vi.mock('@/features/admin/plans/queries/getPlans', () => ({
	getPlansQueryOptions: () => ({
		queryKey: ['test-plans'],
		queryFn: async () => [
			{
				id: 'plan-hobby',
				name: 'Hobbyist',
				deploymentDescription: 'Colocated',
				performanceDescription: 'Small',
				priceUsd: 20,
			},
			{
				id: 'plan-ded',
				name: 'Dedicated 1',
				deploymentDescription: 'Dedicated',
				performanceDescription: 'Large',
				priceUsd: 400,
			},
		],
		retry: false,
	}),
}));
vi.mock('@/features/admin/regions/queries/getRegions', () => ({
	getRegionsQueryOptions: () => ({
		queryKey: ['test-regions'],
		queryFn: async () => [{ id: 'us-east-1', region: 'US East' }, { id: 'eu-west-1', region: 'EU West' }],
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
	onCreated.mockClear();
});

async function mount() {
	const result = render(
		<TestProvider>
			<CreateGrantModal open onOpenChange={() => {}} onCreated={onCreated} />
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

/** The scope pickers are dropdown menus, not selects: the trigger opens on pointerDown. */
async function pickScope(label: string, option: string | RegExp) {
	fireEvent.pointerDown(screen.getByRole('button', { name: label }), { button: 0, ctrlKey: false });
	await act(() => null);
	fireEvent.click(screen.getByRole('menuitemcheckbox', { name: option }));
	await act(() => null);
	fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
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

	// central-manager mints conversion-pending itself while a conversion runs; choosing it by hand
	// would time-box a grant against a conversion that is not happening.
	it('does not offer the policy central-manager applies to itself', async () => {
		await mount();
		fireEvent.keyDown(screen.getByLabelText('Expiry policy'), { key: 'ArrowDown' });
		await act(() => null);
		const options = screen.getAllByRole('option').map((o) => o.textContent);
		expect(options).not.toContain('conversion-pending');
		expect(options).toContain('consumer-trial');
	});

	// Only trial, gift and comp — purchased and enterprise belong to the flows that bill.
	it('offers only the sources an admin may mint', async () => {
		await mount();
		fireEvent.keyDown(screen.getByLabelText('Source'), { key: 'ArrowDown' });
		await act(() => null);
		const options = screen.getAllByRole('option').map((o) => o.textContent);
		expect(options).toEqual(['comp', 'gift', 'trial']);
	});

	// The server refuses an empty array and stores null for "any", so an untouched picker must send
	// nothing at all rather than [].
	it('omits the scopes when nothing is picked, and sends what is', async () => {
		await mount();
		await pick('Organization', /org-1/);
		fireEvent.change(reasonBox(), { target: { value: 'unscoped' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		expect(createGrant.mock.calls[0][0]).not.toHaveProperty('allowedPlanIds');
		expect(createGrant.mock.calls[0][0]).not.toHaveProperty('allowedRegionIds');

		await pickScope('Plans', /plan-hobby/);
		await pickScope('Regions', /us-east-1/);
		fireEvent.click(submit());
		await act(() => null);
		const [body] = createGrant.mock.calls[1];
		expect(body.allowedPlanIds).toEqual(['plan-hobby']);
		expect(body.allowedRegionIds).toEqual(['us-east-1']);
	});

	// The id is generated server-side and is the only handle on an unbound grant, so the caller is
	// handed the created record rather than a toast that disappears.
	it('hands the created grant to its caller', async () => {
		await mount();
		await pick('Organization', /org-1/);
		fireEvent.change(reasonBox(), { target: { value: 'conference comp' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		expect(onCreated.mock.calls[0][0].id).toBe('grt-created');
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
