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
	it('clears an empty scope as null rather than an empty list', async () => {
		await mount(grant({ allowedPlanIds: [] }));
		fireEvent.change(reasonBox(), { target: { value: 'unscoped' } });
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
