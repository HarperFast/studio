/**
 * @vitest-environment jsdom
 */
import { SchemaPlan } from '@/integrations/api/api.gen';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlansAdminIndex } from './index';

let planRows: SchemaPlan[] = [];
vi.mock('./queries/getPlans', () => ({
	plansQueryKey: ['test-plans'],
	getPlansQueryOptions: () => ({
		queryKey: ['test-plans', JSON.stringify(planRows.map((p) => p.id + p.status))],
		queryFn: async () => planRows,
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

vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useStaffPermission: () => true,
}));

afterEach(cleanup);

function plan(overrides: Partial<SchemaPlan> = {}): SchemaPlan {
	return {
		id: 'fabric-block-level-1',
		name: 'Fabric Managed Service Block Level 1',
		status: 'ACTIVE',
		planLevel: 1,
		deploymentType: 'colocated',
		deploymentDescription: 'Colocated',
		performanceDescription: 'Medium (10K read/min)',
		priceUsd: 85,
		planLimits: { expirationMonths: 1 },
		...overrides,
	} as SchemaPlan;
}

async function mount(rows: SchemaPlan[]) {
	planRows = rows;
	const result = render(
		<TestProvider>
			<PlansAdminIndex />
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
	return result;
}

const rowIds = () => screen.getAllByRole('row').slice(1).map((r) => r.children[0].textContent);

describe('PlansAdminIndex', () => {
	// A retired plan is still pointed at by running clusters, so it is one filter click away rather
	// than gone — but it is not what someone came to look at, so ACTIVE is the default view.
	it('hides retired plans until asked for them', async () => {
		await mount([plan(), plan({ id: 'fabric-block-level-0', status: 'INACTIVE' })]);
		expect(rowIds()).toEqual(['fabric-block-level-1']);

		fireEvent.keyDown(screen.getByLabelText('Status'), { key: 'ArrowDown' });
		await act(() => null);
		fireEvent.click(screen.getByRole('option', { name: 'INACTIVE' }));
		await act(() => null);
		expect(rowIds()).toEqual(['fabric-block-level-0Inactive']);
	});

	// expirationMonths is the plan's billing period, and the only place the term is visible.
	it('reads the term off the plan limits', async () => {
		await mount([
			plan({ id: 'plan-a', planLimits: { expirationMonths: 1 } as SchemaPlan['planLimits'] }),
			plan({ id: 'plan-b', planLimits: { expirationMonths: 12 } as SchemaPlan['planLimits'] }),
			plan({ id: 'plan-c', planLimits: { expirationMonths: 3 } as SchemaPlan['planLimits'] }),
		]);
		const termOf = (id: string) => screen.getByText(id).closest('tr')!.children[5].textContent;
		expect(termOf('plan-a')).toBe('monthly');
		expect(termOf('plan-b')).toBe('yearly');
		expect(termOf('plan-c')).toBe('3 mo');
	});

	/**
	 * Mirrors PlanAdmin.assertBillable — rule and trigger both. The trigger is the half that matters:
	 * central-manager only assesses billability when the patch carries status or stripePriceId, so
	 * scoping an already-broken plan stays possible. That is the mitigation, not a loophole.
	 */
	describe('the unbillable guard', () => {
		const paidActive = { priceUsd: 85, status: 'ACTIVE', stripePriceId: '' };

		it('refuses a change that leaves a paid active plan with no Stripe price', async () => {
			const { refusedAsUnbillable } = await import('./PlanFormSchema');
			expect(refusedAsUnbillable({ ...paidActive, touchesStatus: true })).toBe(true);
		});

		it('allows scoping a plan that was already unbillable — the form never sends the price id', async () => {
			const { refusedAsUnbillable } = await import('./PlanFormSchema');
			expect(refusedAsUnbillable({ ...paidActive, touchesStatus: false })).toBe(false);
		});

		it('allows retiring one, which is the mitigation', async () => {
			const { refusedAsUnbillable } = await import('./PlanFormSchema');
			expect(refusedAsUnbillable({ ...paidActive, status: 'INACTIVE', touchesStatus: true })).toBe(false);
		});

		it('lets a free plan and a priced one with an id through', async () => {
			const { refusedAsUnbillable } = await import('./PlanFormSchema');
			expect(refusedAsUnbillable({ ...paidActive, priceUsd: 0, touchesStatus: true })).toBe(false);
			expect(refusedAsUnbillable({ ...paidActive, stripePriceId: 'price_1', touchesStatus: true })).toBe(false);
		});
	});

	it('offers a way to create a plan', async () => {
		await mount([plan()]);
		expect(screen.getByRole('button', { name: /Create plan/ })).toBeTruthy();
	});

	/**
	 * Creating is not retroactive — a new plan has no blocks — but editing a definition is: limits and
	 * price are applied to every live block at once, with no audit trail and no reconciliation back to
	 * plan.json. So the edit modal offers three fields and shows the rest.
	 */
	it('lets an existing plan change only its status and who it is offered to', async () => {
		await mount([plan()]);
		fireEvent.click(screen.getByRole('button', { name: /Edit fabric-block-level-1/ }));
		await act(() => null);

		// Scoped to the dialog: the page's own filters carry some of the same labels.
		const modal = within(screen.getByRole('dialog'));
		expect(modal.getByLabelText('Status')).toBeTruthy();
		expect(modal.getByLabelText('Organizations')).toBeTruthy();
		// The definition is rendered, but as text — no input for the Stripe price, price or limits.
		expect(modal.queryByPlaceholderText('price_…')).toBeNull();
		expect(modal.queryByLabelText('Price (USD per period)')).toBeNull();
		expect(modal.queryByLabelText('Total reads')).toBeNull();
	});

	it('filters by id, name and tier', async () => {
		await mount([plan(), plan({ id: 'self-hosted-2', deploymentDescription: 'Self-Hosted', name: 'Self Hosted' })]);
		fireEvent.change(screen.getByLabelText('Filter plans'), { target: { value: 'self' } });
		await act(() => null);
		expect(rowIds()).toEqual(['self-hosted-2']);
	});

	// Plans scoped to organizations are only offered to those customers; the rest read "Public".
	it('shows who a plan is offered to', async () => {
		await mount([plan(), plan({ id: 'private-1', organizationIds: ['org-1'] })]);
		expect(screen.getByText('org-1 (Acme)')).toBeTruthy();
		expect(screen.getAllByText('Public').length).toBe(1);
	});
});
