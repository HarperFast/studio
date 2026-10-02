/**
 * @vitest-environment jsdom
 */
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateGrantModal } from './CreateGrantModal';

const createGrant = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/admin/grants/mutations/useUpdateGrant', () => ({
	useCreateGrantMutation: () => ({
		mutate: (body: unknown, opts?: { onSuccess?: (grants: unknown[]) => void; onSettled?: () => void }) => {
			createGrant(body);
			opts?.onSuccess?.([{ id: 'cgr-comp', ...(body as object) }]);
			opts?.onSettled?.();
		},
		isPending: false,
	}),
}));
vi.mock('@/features/admin/grants/queries/getExpiryPolicies', () => ({
	getExpiryPoliciesQueryOptions: () => ({
		queryKey: ['test-policies'],
		queryFn: async () => ({ editableAtRuntime: false, policies: { comped: [] } }),
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	createGrant.mockClear();
});

function grant(overrides: Partial<AdminClusterGrant> = {}): AdminClusterGrant {
	return {
		id: 'cgr-contract',
		organizationId: 'org-1',
		clusterId: 'clu-a',
		source: 'contracted',
		status: 'ACTIVE',
		shape: null,
		startsAt: new Date(Date.now() - 86_400_000).toISOString(),
		endsAt: null,
		expiryPolicy: 'none',
		currentStage: null,
		...overrides,
	} as AdminClusterGrant;
}

async function mount(g: AdminClusterGrant, reason = 'sales agreed a comp') {
	render(
		<TestProvider>
			<CreateGrantModal open onOpenChange={() => {}} onCreated={() => {}} replacing={{ grant: g, reason }} />
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe('CreateGrantModal — replacing a live grant with a comp', () => {
	it('fixes what the replacement is: no target, source, quantity, start or shape to choose', async () => {
		await mount(grant());
		expect(screen.getByRole('heading', { name: 'Replace with comp' })).toBeTruthy();
		expect(screen.getByText(/takes over from contracted grant cgr-contract in one step/)).toBeTruthy();
		for (const label of ['Applies to', 'Source']) { expect(screen.queryByLabelText(label)).toBeNull(); }
		for (const text of ['Starts', 'Quantity', 'Cluster shape (required)']) {
			expect(screen.queryByText(text))
				.toBeNull();
		}
		expect(screen.getByText(/Covers exactly what the cluster runs today/)).toBeTruthy();
	});

	// central-manager reads a bound comp's shape off the cluster, so none is sent.
	it('sends the switchover with the typed reason, and no shape or start date', async () => {
		await mount(grant());
		expect(screen.getByPlaceholderText(/Why this grant exists/)).toHaveProperty('value', 'sales agreed a comp');
		fireEvent.click(screen.getByRole('button', { name: 'Replace grant' }));
		await act(() => null);

		expect(createGrant).toHaveBeenCalledTimes(1);
		const [body] = createGrant.mock.calls[0];
		expect(body).toEqual({
			clusterId: 'clu-a',
			source: 'comped',
			replaceGrantId: 'cgr-contract',
			endsAt: null,
			expiryPolicy: 'none',
			reason: 'sales agreed a comp',
		});
	});

	it('needs a reason, as any grant does', async () => {
		await mount(grant(), '');
		expect(screen.getByRole('button', { name: 'Replace grant' }).hasAttribute('disabled')).toBe(true);
	});
});
