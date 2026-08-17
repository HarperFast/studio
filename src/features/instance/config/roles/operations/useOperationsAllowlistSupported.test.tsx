/**
 * @vitest-environment jsdom
 */
import { useOperationsAllowlistSupported } from '@/features/instance/config/roles/operations/useOperationsAllowlistSupported';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 The point of this file is the tri-state itself: collapsing "still loading" into "unsupported" is
 what would let a caller describe a restricted role as unrestricted, so it is asserted here rather
 than only through consumers that mock the hook away.
*/

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));

const { registrationInfo } = vi.hoisted(() => ({ registrationInfo: vi.fn() }));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: () => ({
		queryKey: ['test', 'registration_info'],
		queryFn: registrationInfo,
	}),
}));

afterEach(() => vi.clearAllMocks());

function harness() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrapper = ({ children }: PropsWithChildren) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return renderHook(() => useOperationsAllowlistSupported(), { wrapper });
}

describe('useOperationsAllowlistSupported', () => {
	it('is undefined until the version resolves, never false', () => {
		// A never-settling query stands in for the first render of a real one.
		registrationInfo.mockReturnValue(new Promise(() => {}));
		expect(harness().result.current).toBeUndefined();
	});

	it('resolves to false for a version below the floor', async () => {
		registrationInfo.mockResolvedValue({ version: '4.7.3' });
		const { result } = harness();
		await waitFor(() => expect(result.current).toBe(false));
	});

	it('resolves to true for a supporting version', async () => {
		registrationInfo.mockResolvedValue({ version: '5.2.2' });
		const { result } = harness();
		await waitFor(() => expect(result.current).toBe(true));
	});
});
