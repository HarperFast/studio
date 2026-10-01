/** @vitest-environment jsdom */
import type { Instance } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceStatusCell } from './InstanceStatusCell';

const state = vi.hoisted(() => ({ enabled: [] as (boolean | undefined)[] }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterInstancePermissions: () => ({ update: true }) }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));
vi.mock('@/integrations/api/instance/status/setStatus', () => ({ useSetStatus: () => ({ mutate: vi.fn() }) }));
vi.mock('@/integrations/api/instance/status/getStatus', () => ({
	getStatusQueryOptions: (_params: unknown, enabled?: boolean) => {
		state.enabled.push(enabled);
		return { queryKey: ['status'], queryFn: () => null, enabled: false };
	},
	getSystemStatusById: () => undefined,
}));

beforeEach(() => {
	vi.useFakeTimers();
	state.enabled = [];
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

async function pollEnabledFor(status: string) {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<InstanceStatusCell instance={{ id: 'ins-a', status, instanceFqdn: 'ins-a.example.com' } as Instance} index={0} />
		</QueryClientProvider>,
	);
	await act(() => vi.advanceTimersByTimeAsync(1_000));
	return state.enabled.at(-1);
}

describe('InstanceStatusCell get_status poll', () => {
	it('polls a running instance', async () => {
		expect(await pollEnabledFor('RUNNING')).toBe(true);
	});

	it.each(['ERROR', 'FAILED', 'TERMINATING', 'STOPPED', 'RESTARTING'])(
		'does not poll a %s instance, which central manager refuses with a 400 on every tick',
		async status => {
			expect(await pollEnabledFor(status)).toBe(false);
		},
	);
});
