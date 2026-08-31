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
		const base = {
			id: 'plan-x',
			name: 'Plan X',
			status: 'ACTIVE' as const,
			planLevel: 1,
			deploymentType: 'colocated' as const,
			deploymentDescription: 'Colocated',
			performanceDescription: 'Medium',
			channel: '',
			organizationIds: [],
			resourcesPerInstance: { storageGb: 1, memoryMb: 1, cpuCores: 1, threads: 1, readIopsLimit: 1, writeIopsLimit: 1 },
			planLimits: Object.fromEntries(
				[
					'storageBytes',
					'totalReadCount',
					'totalReadsBytes',
					'readsPerMinuteCount',
					'readsPerMinuteBytes',
					'totalWriteCount',
					'totalWritesBytes',
					'writesPerMinuteCount',
					'writesPerMinuteBytes',
					'totalRealTimeMessageDeliveries',
					'totalRealTimeMessageDeliveryBytes',
					'realTimeMessageDeliveriesPerMinute',
					'realTimeMessageDeliveryBytesPerMinute',
					'tlsHandshakes',
					'applicationComputeHours',
					'expirationMonths',
				].map((k) => [k, 1]),
			),
		};

		expect(PlanFormSchema.safeParse({ ...base, priceUsd: 85, stripePriceId: '' }).success).toBe(false);
		expect(PlanFormSchema.safeParse({ ...base, priceUsd: 85, stripePriceId: 'price_1' }).success).toBe(true);
		// A free plan needs none, and neither does a retired one — nothing bills on either.
		expect(PlanFormSchema.safeParse({ ...base, priceUsd: 0, stripePriceId: '' }).success).toBe(true);
		expect(PlanFormSchema.safeParse({ ...base, priceUsd: 85, status: 'INACTIVE', stripePriceId: '' }).success).toBe(
			true,
		);
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
