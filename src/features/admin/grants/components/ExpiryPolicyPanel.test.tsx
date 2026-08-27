/**
 * @vitest-environment jsdom
 */
import { AdminExpiryPolicies } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpiryPolicyPanel } from './ExpiryPolicyPanel';

const fetches = vi.fn();
const POLICIES: AdminExpiryPolicies = {
	editableAtRuntime: false,
	policies: {
		'conversion-pending': [
			{ stage: 'AWAITING_PLAN', daysFromEnd: 0, actions: [], destructive: false },
			{ stage: 'SHUTDOWN', daysFromEnd: 0, actions: ['stopCluster'], destructive: true },
		],
		'consumer-trial': [
			{ stage: 'WARNED', daysFromEnd: -7, orUsagePct: 80, actions: ['email:trial-ending'], destructive: false },
			{ stage: 'SHUTDOWN', daysFromEnd: 0, actions: ['expireGrant', 'stopCluster'], destructive: true },
			{ stage: 'DELETED', daysFromEnd: 14, actions: ['deleteCluster'], destructive: true },
		],
	},
};
vi.mock('../queries/getExpiryPolicies', () => ({
	getExpiryPoliciesQueryOptions: () => ({
		queryKey: ['test-expiry-policies'],
		queryFn: async () => {
			fetches();
			return POLICIES;
		},
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	fetches.mockClear();
});

async function mount() {
	const result = render(
		<TestProvider>
			<ExpiryPolicyPanel />
		</TestProvider>,
	);
	await act(() => null);
	return result;
}

const toggle = () => screen.getByRole('button', { name: /Expiry policies/ });

describe('ExpiryPolicyPanel', () => {
	// Reference data most visits never need — it must not cost a request until asked for.
	it('fetches nothing until opened', async () => {
		await mount();
		expect(fetches).not.toHaveBeenCalled();
		fireEvent.click(toggle());
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		expect(fetches).toHaveBeenCalledTimes(1);
	});

	it('renders each stage with its served offset — nothing derived locally', async () => {
		await mount();
		fireEvent.click(toggle());
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		expect(screen.getByText('consumer-trial')).toBeTruthy();
		expect(screen.getByText(/WARNED · 7d before end · or 80% usage/)).toBeTruthy();
		expect(screen.getByText(/SHUTDOWN · at end/)).toBeTruthy();
		expect(screen.getByText(/DELETED · \+14d after end/)).toBeTruthy();
	});

	// central-manager mints and clears conversion-pending on its own while a conversion is in
	// flight; it is not a timeline anyone chooses or needs explained here.
	it('hides the policy central-manager applies to itself', async () => {
		await mount();
		fireEvent.click(toggle());
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		expect(screen.queryByText('conversion-pending')).toBeNull();
		expect(screen.getByText('consumer-trial')).toBeTruthy();
	});

	it('marks destructive stages and says what red means', async () => {
		await mount();
		fireEvent.click(toggle());
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		const shutdown = screen.getByText(/SHUTDOWN · at end/);
		// The badge itself carries the destructive variant; the actions are on the tooltip.
		expect(shutdown.closest('[title]')?.getAttribute('title')).toContain('stopCluster');
		expect(screen.getByText(/Red stages stop or delete the cluster/)).toBeTruthy();
	});
});
