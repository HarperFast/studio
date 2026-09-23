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
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
	toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));
// When set, the mutation fails with this error instead of succeeding.
let createFailure: unknown = null;
// When set, the mutation succeeds with this list instead of one grant per requested quantity.
let createdOverride: unknown[] | null = null;
vi.mock('@/features/admin/grants/mutations/useUpdateGrant', () => ({
	useCreateGrantMutation: () => ({
		mutate: (
			body: unknown,
			opts?: { onSuccess?: (grants: unknown[]) => void; onError?: (error: unknown) => void; onSettled?: () => void },
		) => {
			createGrant(body);
			if (createFailure) {
				opts?.onError?.(createFailure);
				opts?.onSettled?.();
				return;
			}
			// The real mutation normalizes the server's single-or-batch reply to an array.
			const quantity = (body as { quantity?: number }).quantity ?? 1;
			opts?.onSuccess?.(
				createdOverride ?? Array.from(
					{ length: quantity },
					(_, i) => ({ id: i === 0 ? 'grt-created' : `grt-created-${i}`, ...(body as object) }),
				),
			);
			// Settling releases the modal's double-submit latch, as the real mutation does.
			opts?.onSettled?.();
		},
		isPending: false,
	}),
}));
vi.mock('@/features/admin/grants/queries/getExpiryPolicies', () => ({
	getExpiryPoliciesQueryOptions: () => ({
		queryKey: ['test-policies'],
		queryFn: async () => ({
			editableAtRuntime: false,
			policies: { 'consumer-trial': [], comped: [], 'conversion-pending': [] },
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
			// The id must be one central-manager lists as self-hosted; the deployment type alone is not the rule.
			{
				id: 'self-hosted-2',
				name: 'Self-Hosted 2',
				deploymentDescription: 'Self-Hosted',
				performanceDescription: 'Standard',
				priceUsd: 100,
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
// The org picker searches the server; each search term it sends is recorded.
const orgSearches: string[] = [];
vi.mock('@/features/organizations/queries/getAllOrganizations', () => ({
	getAllOrganizationsQueryOptions: (_page: number, term: string) => ({
		queryKey: ['test-org-search', term],
		queryFn: async () => {
			orgSearches.push(term);
			return { organizations: [{ id: 'org-1', name: 'Acme' }], hasNextPage: false };
		},
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	createGrant.mockClear();
	onCreated.mockClear();
	toastSuccess.mockClear();
	toastError.mockClear();
	createFailure = null;
	createdOverride = null;
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

const addRow = async () => {
	fireEvent.click(screen.getByRole('button', { name: /Add region/ }));
	await act(() => null);
};

/** A comp must say which cluster it is for; every submit of one needs at least this row. */
async function fillCompedScope() {
	await addRow();
	await pick('Plan 1', /plan-hobby/);
	await pick('Region 1', /us-east-1/);
}

describe('CreateGrantModal', () => {
	// The server accepts clusterId XOR organizationId, so the form asks which rather than offering
	// both and letting the xor fail server-side.
	it('sends an organization for an unbound voucher, and no cluster', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await fillCompedScope();
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
		await fillCompedScope();
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
		// A comped grant's policy is set for it, so the list is only offered to a trial.
		await pick('Source', 'trial');
		fireEvent.keyDown(screen.getByLabelText('Expiry policy'), { key: 'ArrowDown' });
		await act(() => null);
		const options = screen.getAllByRole('option').map((o) => o.textContent);
		expect(options).not.toContain('conversion-pending');
		expect(options).toContain('consumer-trial');
	});

	// Only trial and comped — purchased, contracted and free are derived by the flows that own them.
	it('offers only the sources an admin may mint', async () => {
		await mount();
		fireEvent.keyDown(screen.getByLabelText('Source'), { key: 'ArrowDown' });
		await act(() => null);
		const options = screen.getAllByRole('option').map((o) => o.textContent);
		expect(options).toEqual(['comped', 'trial']);
	});

	// A comped grant has no clock and no card, so its scope is the only bound it has — the server
	// requires at least one plan and one region, and the form says so before the 400 would.
	it('will not mint a comp without its shape', async () => {
		await mount();
		await pick('Organization', /org-1/);
		fireEvent.change(reasonBox(), { target: { value: 'unshaped comp' } });
		await act(() => null);
		expect(screen.getByText('Cluster shape (required)')).toBeTruthy();
		expect(submit().hasAttribute('disabled')).toBe(true);
		// A row with nothing picked is not a shape either, and says what it is missing.
		await addRow();
		expect(screen.getByText('Choose a plan')).toBeTruthy();
		expect(submit().hasAttribute('disabled')).toBe(true);
	});

	it('needs a region for a Harper-hosted plan, and says so on the row', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await addRow();
		await pick('Plan 1', /plan-hobby/);
		fireEvent.change(reasonBox(), { target: { value: 'hosted comp' } });
		await act(() => null);
		expect(screen.getByText('Choose the region this plan runs in')).toBeTruthy();
		expect(submit().hasAttribute('disabled')).toBe(true);
		await pick('Region 1', /us-east-1/);
		expect(submit().hasAttribute('disabled')).toBe(false);
	});

	// A self-hosted plan has no region: the row is the plan alone, and the server gets null for it.
	it('needs no region for a self-hosted plan, and sends null', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await addRow();
		await pick('Plan 1', /self-hosted-2/);
		fireEvent.change(reasonBox(), { target: { value: 'on-prem comp' } });
		await act(() => null);
		expect(screen.getByLabelText('Region 1').hasAttribute('disabled')).toBe(true);
		expect(submit().hasAttribute('disabled')).toBe(false);
		fireEvent.click(submit());
		await act(() => null);
		const [body] = createGrant.mock.calls[0];
		expect(body.shape).toEqual([{ planId: 'self-hosted-2', regionId: null }]);
		expect(body).not.toHaveProperty('allowedPlanIds');
		expect(body).not.toHaveProperty('allowedRegionIds');
	});

	// One row per region, so a plan is listed once for each region it runs in.
	it('lists a plan once per region and sends every pair', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await fillCompedScope();
		await addRow();
		// The new row starts on the last plan; only its region is left to pick.
		await pick('Region 2', /eu-west-1/);
		fireEvent.change(reasonBox(), { target: { value: 'two regions' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		const [body] = createGrant.mock.calls[0];
		expect(body.shape).toEqual([
			{ planId: 'plan-hobby', regionId: 'us-east-1' },
			{ planId: 'plan-hobby', regionId: 'eu-west-1' },
		]);
	});

	it('sends the shape a comp was given, and no allow-lists', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await fillCompedScope();
		fireEvent.change(reasonBox(), { target: { value: 'shaped comp' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		const [body] = createGrant.mock.calls[0];
		expect(body.shape).toEqual([{ planId: 'plan-hobby', regionId: 'us-east-1' }]);
		expect(body).not.toHaveProperty('allowedPlanIds');
	});

	// The server refuses an empty array and stores null for "any", so an untouched picker on a source
	// that allows it must send nothing at all rather than [].
	it('omits the scopes for a trial when nothing is picked', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await pick('Source', 'trial');
		fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2099-01-01T00:00' } });
		await pick('Expiry policy', 'consumer-trial');
		fireEvent.change(reasonBox(), { target: { value: 'unscoped trial' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		expect(createGrant.mock.calls[0][0]).not.toHaveProperty('allowedPlanIds');
		expect(createGrant.mock.calls[0][0]).not.toHaveProperty('allowedRegionIds');
		expect(createGrant.mock.calls[0][0]).not.toHaveProperty('shape');
	});

	// A trial scopes through the allow-lists, which the server reads as exact lists — and never a shape.
	it("sends a trial's allow-lists, and no shape", async () => {
		await mount();
		await pick('Organization', /org-1/);
		await pick('Source', 'trial');
		fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2099-01-01T00:00' } });
		await pick('Expiry policy', 'consumer-trial');
		await pickScope('Plans', /plan-hobby/);
		await pickScope('Regions', /us-east-1/);
		fireEvent.change(reasonBox(), { target: { value: 'scoped trial' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		const [body] = createGrant.mock.calls[0];
		expect(body.allowedPlanIds).toEqual(['plan-hobby']);
		expect(body.allowedRegionIds).toEqual(['us-east-1']);
		expect(body).not.toHaveProperty('shape');
	});

	// A comped grant may run forever, but once it is given an end it must stage, or the runner would
	// never act on it — so `none` stops being offered the moment a date is set.

	// The id is generated server-side and is the only handle on an unbound grant, so the caller is
	// handed the created record rather than a toast that disappears.
	it('hands the created grant to its caller', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await fillCompedScope();
		fireEvent.change(reasonBox(), { target: { value: 'conference comp' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		expect(onCreated.mock.calls[0][0]).toHaveLength(1);
		expect(onCreated.mock.calls[0][0][0].id).toBe('grt-created');
	});

	it("sets a comped grant's policy from its end date, and does not let it be picked", async () => {
		await mount();
		const policy = () => screen.getByLabelText('Expiry policy');
		expect(policy().hasAttribute('disabled')).toBe(true);
		expect(policy().textContent).toContain('none');
		fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2099-01-01T00:00' } });
		await act(() => null);
		expect(policy().textContent).toContain('comped');
		fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '' } });
		await act(() => null);
		expect(policy().textContent).toContain('none');
	});

	it("shows central-manager's reason when it refuses the create, not the transport's status line", async () => {
		createFailure = Object.assign(new Error('Request failed with status code 400'), {
			response: { status: 400, data: { title: "expiryPolicy: a comped grant with no endsAt must use 'none'" } },
		});
		await mount();
		await pick('Organization', /org-1/);
		await fillCompedScope();
		fireEvent.change(reasonBox(), { target: { value: 'conference comp' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		expect(toastError).toHaveBeenCalledWith('Could not create the grant', {
			description: "expiryPolicy: a comped grant with no endsAt must use 'none'",
		});
	});

	it('reports a success that returned no grants, instead of opening nothing', async () => {
		createdOverride = [];
		await mount();
		await pick('Organization', /org-1/);
		await fillCompedScope();
		fireEvent.change(reasonBox(), { target: { value: 'conference comp' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		expect(onCreated).not.toHaveBeenCalled();
		expect(toastSuccess).toHaveBeenCalledTimes(1);
	});

	// One grant keeps the single-grant request; only a real batch carries a quantity.
	it('sends a quantity only when more than one unbound voucher is asked for', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await fillCompedScope();
		fireEvent.change(reasonBox(), { target: { value: 'conference comps' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		expect(createGrant.mock.calls[0][0].quantity).toBeUndefined();

		fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		expect(createGrant.mock.calls[1][0].quantity).toBe(5);
		expect(onCreated.mock.calls[1][0]).toHaveLength(5);
	});

	it('refuses a quantity outside the server cap, and hides it for a bound grant', async () => {
		await mount();
		await pick('Organization', /org-1/);
		await fillCompedScope();
		fireEvent.change(reasonBox(), { target: { value: 'too many' } });
		fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '101' } });
		await act(() => null);
		fireEvent.click(submit());
		await act(() => null);
		expect(createGrant).not.toHaveBeenCalled();
		expect(screen.getByText('Between 1 and 100 grants')).toBeTruthy();

		await pick('Applies to', /existing cluster/);
		expect(screen.queryByLabelText('Quantity')).toBeNull();
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
