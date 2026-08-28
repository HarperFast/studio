/**
 * @vitest-environment jsdom
 */
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrantFormModal } from './GrantFormModal';

const updateGrant = vi.fn();
vi.mock('@/features/admin/grants/mutations/useUpdateGrant', () => ({
	useUpdateGrantMutation: () => ({
		mutate: (input: unknown, opts?: { onSuccess?: () => void }) => {
			updateGrant(input);
			opts?.onSuccess?.();
		},
		isPending: false,
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
vi.mock('@/features/admin/grants/queries/getExpiryPolicies', () => ({
	getExpiryPoliciesQueryOptions: () => ({
		queryKey: ['test-policies'],
		queryFn: async () => ({
			editableAtRuntime: false,
			policies: { 'consumer-trial': [], 'enterprise-grace': [] },
		}),
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	updateGrant.mockClear();
});

const DAY_MS = 24 * 60 * 60 * 1000;

function grant(overrides: Partial<AdminClusterGrant> = {}): AdminClusterGrant {
	return {
		id: 'cgr-a',
		organizationId: 'org-1',
		clusterId: 'clu-a',
		source: 'comp',
		status: 'ACTIVE',
		startsAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
		endsAt: new Date(Date.now() + 20 * DAY_MS).toISOString(),
		expiryPolicy: null,
		currentStage: null,
		...overrides,
	};
}

async function mount(g: AdminClusterGrant) {
	const result = render(
		<TestProvider>
			<GrantFormModal open onOpenChange={() => {}} grant={g} />
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
	return result;
}

const reasonBox = () => screen.getByPlaceholderText(/Why these terms/);
const saveButton = () => screen.getByRole('button', { name: 'Save changes' });

/** The scope pickers are dropdown menus, not selects: the trigger opens on pointerDown. */
async function pickScope(label: string, option: RegExp) {
	fireEvent.pointerDown(screen.getByRole('button', { name: label }), { button: 0, ctrlKey: false });
	await act(() => null);
	fireEvent.click(screen.getByRole('menuitemcheckbox', { name: option }));
	await act(() => null);
	fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
	await act(() => null);
}

describe('GrantFormModal', () => {
	// The server requires a reason on every patch; catching it here beats earning a 400.
	it('will not save without a reason', async () => {
		await mount(grant());
		expect(saveButton().hasAttribute('disabled')).toBe(true);
	});

	it('sends the reason and the changed terms', async () => {
		await mount(grant());
		fireEvent.change(reasonBox(), { target: { value: 'extended for the pilot' } });
		await act(() => null);
		fireEvent.click(saveButton());
		await act(() => null);

		expect(updateGrant).toHaveBeenCalledTimes(1);
		const [{ id, changes }] = updateGrant.mock.calls[0];
		expect(id).toBe('cgr-a');
		expect(changes.reason).toBe('extended for the pilot');
		// source and clusterId are immutable — sending them would be refused.
		expect(changes).not.toHaveProperty('source');
		expect(changes).not.toHaveProperty('clusterId');
	});

	// An empty scope list is refused by the server; null is how a restriction is cleared.
	it('clears a scope as null rather than an empty list', async () => {
		await mount(grant({ allowedPlanIds: ['plan-a'] }));
		fireEvent.change(reasonBox(), { target: { value: 'unscoped' } });
		fireEvent.click(screen.getByRole('button', { name: 'Remove plan-a' }));
		await act(() => null);
		fireEvent.click(saveButton());
		await act(() => null);
		expect(updateGrant.mock.calls[0][0].changes.allowedPlanIds).toBeNull();
	});

	it('sends a cleared end date as null, meaning no expiry', async () => {
		await mount(grant());
		fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '' } });
		fireEvent.change(reasonBox(), { target: { value: 'made perpetual' } });
		await act(() => null);
		fireEvent.click(saveButton());
		await act(() => null);
		expect(updateGrant.mock.calls[0][0].changes.endsAt).toBeNull();
	});

	// Re-stating an untouched value is not free: the server refuses an internal expiryPolicy and reads
	// every scope it receives through the widen-only guard, so an unedited field would fail a save
	// that only meant to change something else.
	it('sends only the fields that changed', async () => {
		await mount(grant({ allowedPlanIds: ['plan-a'], allowedRegionIds: ['us-east-1'], expiryPolicy: 'consumer-trial' }));
		fireEvent.change(reasonBox(), { target: { value: 'note only' } });
		await act(() => null);
		fireEvent.click(saveButton());
		await act(() => null);

		const [{ changes }] = updateGrant.mock.calls[0];
		expect(changes).toEqual({ reason: 'note only' });
	});

	describe("a bound grant's scope may only widen", () => {
		it('holds the save and says why when an entry is removed', async () => {
			await mount(grant({ allowedRegionIds: ['us-east-1', 'eu-west-1'] }));
			fireEvent.change(reasonBox(), { target: { value: 'narrowing' } });
			fireEvent.click(screen.getByRole('button', { name: 'Remove eu-west-1' }));
			await act(() => null);
			expect(screen.getByText(/A bound grant's scope may only widen/)).toBeTruthy();
			expect(saveButton().hasAttribute('disabled')).toBe(true);
		});

		// Unrestricted is the widest value a grant can hold, so a first restriction narrows it even
		// though nothing was removed — the case a form gets wrong by treating null as empty.
		it('holds the save when restricting a grant that had no scope', async () => {
			await mount(grant({ allowedRegionIds: null }));
			fireEvent.change(reasonBox(), { target: { value: 'first restriction' } });
			await pickScope('Regions', /us-east-1/);
			expect(saveButton().hasAttribute('disabled')).toBe(true);
		});

		it('allows adding to an existing restriction', async () => {
			await mount(grant({ allowedRegionIds: ['us-east-1'] }));
			fireEvent.change(reasonBox(), { target: { value: 'widening' } });
			await pickScope('Regions', /eu-west-1/);
			expect(saveButton().hasAttribute('disabled')).toBe(false);
			fireEvent.click(saveButton());
			await act(() => null);
			expect(updateGrant.mock.calls[0][0].changes.allowedRegionIds).toEqual(['us-east-1', 'eu-west-1']);
		});

		// Nothing is running on an unbound voucher, so the server lets it narrow freely.
		it('lets an unbound voucher narrow', async () => {
			await mount(grant({ clusterId: null, allowedRegionIds: ['us-east-1', 'eu-west-1'] }));
			fireEvent.change(reasonBox(), { target: { value: 'narrowing a voucher' } });
			fireEvent.click(screen.getByRole('button', { name: 'Remove eu-west-1' }));
			await act(() => null);
			expect(saveButton().hasAttribute('disabled')).toBe(false);
		});
	});

	// A conversion in flight legitimately carries conversion-pending. The server refuses it from an
	// admin, but the trigger must still show what the grant has rather than going blank.
	it('shows an internal policy the grant already carries without offering it', async () => {
		await mount(grant({ expiryPolicy: 'conversion-pending' }));
		expect(screen.getByLabelText('Expiry policy').textContent).toContain('conversion-pending');
		fireEvent.keyDown(screen.getByLabelText('Expiry policy'), { key: 'ArrowDown' });
		await act(() => null);
		const internal = screen.getAllByRole('option').find((o) => o.textContent === 'conversion-pending');
		expect(internal?.getAttribute('aria-disabled')).toBe('true');
	});

	// Revoke is its own action: it ends the grant and is exempt from the other guards.
	it('revokes with only a status and a reason', async () => {
		await mount(grant());
		fireEvent.change(reasonBox(), { target: { value: 'customer cancelled' } });
		await act(() => null);
		fireEvent.click(screen.getByRole('button', { name: 'Revoke grant' }));
		await act(() => null);

		const [{ changes }] = updateGrant.mock.calls[0];
		expect(changes).toEqual({ status: 'REVOKED', reason: 'customer cancelled' });
	});

	it('refuses to revoke without a reason', async () => {
		await mount(grant());
		fireEvent.click(screen.getByRole('button', { name: 'Revoke grant' }));
		await act(() => null);
		expect(updateGrant).not.toHaveBeenCalled();
		expect(screen.getByText('A reason is required to revoke')).toBeTruthy();
	});

	// The server refuses `none` for a trial, since a trial must stay stageable.
	it('blocks the no-policy option for a trial', async () => {
		await mount(grant({ source: 'trial', expiryPolicy: 'consumer-trial' }));
		fireEvent.keyDown(screen.getByLabelText('Expiry policy'), { key: 'ArrowDown' });
		await act(() => null);
		const none = screen.getAllByRole('option').find((o) => o.textContent === 'none');
		expect(none?.getAttribute('data-disabled')).not.toBeNull();
		expect(screen.getByText(/must stay time-boxed/)).toBeTruthy();
	});
});
