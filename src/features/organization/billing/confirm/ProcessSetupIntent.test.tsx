/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessSetupIntent } from './ProcessSetupIntent';

const state = vi.hoisted(() => ({
	navigate: vi.fn(),
	saved: null as unknown,
	stripe: { retrieveSetupIntent: vi.fn() },
}));
vi.mock('@stripe/react-stripe-js', () => ({ useStripe: () => state.stripe }));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => state.navigate,
	useParams: () => ({ organizationId: 'org-a' }),
	useSearch: () => ({}),
}));
vi.mock('@/hooks/useLocalStorage', () => ({ useLocalStorage: () => [state.saved] }));
vi.mock('@/integrations/stripe/useProcessStripePaymentMethod', () => {
	const process = (_paymentMethod: string, onProcessed: () => void) => onProcessed();
	return { useProcessStripePaymentMethod: () => process };
});

afterEach(() => {
	cleanup();
	state.navigate.mockReset();
	state.stripe.retrieveSetupIntent.mockReset();
	state.saved = null;
	window.history.replaceState(null, '', '/');
});

function returnFromStripe(setupIntent: { status: string; payment_method: string | null }) {
	window.history.pushState(null, '', '/?setup_intent_client_secret=seti_secret#/org-a/billing/confirm');
	state.stripe.retrieveSetupIntent.mockResolvedValue({ setupIntent });
	render(<ProcessSetupIntent />);
}

describe('ProcessSetupIntent', () => {
	it('replaces itself with the cluster draft, so Back from the form skips this page (#1326)', async () => {
		state.saved = { clusterName: 'Draft' };
		returnFromStripe({ status: 'succeeded', payment_method: 'pm_card' });

		await waitFor(() => expect(state.navigate).toHaveBeenCalled());
		expect(state.navigate).toHaveBeenCalledWith({ search: undefined, to: '../../new-cluster', replace: true });
		expect(window.location.search).toBe('');
		expect(window.location.hash).toBe('#/org-a/billing/confirm');
	});

	it('replaces itself on the way back to a cluster edit too', async () => {
		state.saved = { clusterId: 'clu-a' };
		returnFromStripe({ status: 'processing', payment_method: null });

		await waitFor(() => expect(state.navigate).toHaveBeenCalled());
		expect(state.navigate).toHaveBeenCalledWith({ search: undefined, to: '../../clu-a/edit', replace: true });
	});
});
