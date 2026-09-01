/**
 * @vitest-environment jsdom
 */
import { SchemaPlan } from '@/integrations/api/api.gen';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

	// A paid ACTIVE plan with no Stripe price cannot be invoiced — createInvoiceLineItem adds no line
	// and only logs — so central-manager refuses it. The form says so before earning the 400.
	it('will not save a paid active plan with no Stripe price', async () => {
		const { PlanFormSchema } = await import('./PlanFormSchema');
		const ok = (values: Record<string, unknown>) =>
			PlanFormSchema.safeParse({ organizationIds: [], ...values }).success;

		expect(ok({ status: 'ACTIVE', priceUsd: 85, stripePriceId: '' })).toBe(false);
		expect(ok({ status: 'ACTIVE', priceUsd: 85, stripePriceId: 'price_1' })).toBe(true);
		// A free plan needs none, and neither does a retired one — nothing bills on either.
		expect(ok({ status: 'ACTIVE', priceUsd: 0, stripePriceId: '' })).toBe(true);
		expect(ok({ status: 'INACTIVE', priceUsd: 85, stripePriceId: '' })).toBe(true);
	});

	// Plan definitions live in central-manager's plan.json behind a reviewed diff: edits here would
	// be retroactive across live blocks, unaudited, and never reconciled back.
	it('offers no way to create a plan', async () => {
		await mount([plan()]);
		expect(screen.queryByRole('button', { name: /Create plan/ })).toBeNull();
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
