/**
 * @vitest-environment jsdom
 *
 * A second click on Create grant while the first is in flight must not mint a second grant
 * (#831). isPending only disables the button a tick after the click.
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateGrantModal } from './CreateGrantModal';

// Never settles: the guard, not the callback, is what stops the second click.
const createGrant = vi.fn();
vi.mock('@/features/admin/grants/mutations/useUpdateGrant', () => ({
	useCreateGrantMutation: () => ({ mutate: createGrant, isPending: false }),
}));
vi.mock('@/features/admin/grants/queries/getExpiryPolicies', () => ({
	getExpiryPoliciesQueryOptions: () => ({
		queryKey: ['test-policies'],
		queryFn: async () => ({ editableAtRuntime: false, policies: { 'consumer-trial': [], 'conversion-pending': [] } }),
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
		],
		retry: false,
	}),
}));
vi.mock('@/features/admin/regions/queries/getRegions', () => ({
	getRegionsQueryOptions: () => ({
		queryKey: ['test-regions'],
		queryFn: async () => [{ id: 'us-east-1', region: 'US East' }],
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
	render(
		<TestProvider>
			<CreateGrantModal open onOpenChange={() => {}} onCreated={() => {}} />
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function pick(label: string, option: RegExp) {
	fireEvent.keyDown(screen.getByLabelText(label), { key: 'ArrowDown' });
	await act(() => null);
	const match = screen.getAllByRole('option').find((o) => option.test(o.textContent ?? ''));
	if (!match) { throw new Error(`no option ${String(option)} under ${label}`); }
	fireEvent.click(match);
	await act(() => null);
}

describe('CreateGrantModal — one submit at a time', () => {
	it('a second click while the create is in flight sends nothing', async () => {
		await mount();
		await pick('Applies to', /existing cluster/);
		fireEvent.change(screen.getByPlaceholderText('clu-…'), { target: { value: 'clu-abc' } });
		fireEvent.click(screen.getByRole('button', { name: /Add region/ }));
		await act(() => null);
		await pick('Plan 1', /plan-hobby/);
		await pick('Region 1', /us-east-1/);
		fireEvent.change(screen.getByPlaceholderText(/Why this grant exists/), { target: { value: 'pilot' } });
		await act(() => null);
		const submit = screen.getByRole('button', { name: 'Create grant' });
		fireEvent.click(submit);
		fireEvent.click(submit);
		await act(() => null);
		expect(createGrant).toHaveBeenCalledTimes(1);
	});
});
