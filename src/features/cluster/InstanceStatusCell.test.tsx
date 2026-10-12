/** @vitest-environment jsdom */
import type { Instance } from '@/integrations/api/api.patch';
import { FakeIntersectionObserver } from '@/test/fakeIntersectionObserver';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceStatusCell } from './InstanceStatusCell';

const state = vi.hoisted(() => ({ enabled: [] as (boolean | undefined)[] }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterInstancePermissions: () => ({ update: true }) }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));
vi.mock('@/integrations/api/instance/status/setStatus', () => ({ useSetStatus: () => ({ mutate: vi.fn() }) }));
vi.mock('@/integrations/api/instance/status/getStatus', async importOriginal => ({
	...await importOriginal<typeof import('@/integrations/api/instance/status/getStatus')>(),
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
	vi.unstubAllGlobals();
	FakeIntersectionObserver.reset();
});

async function renderCell(status: string, version: string | undefined = '4.7.3') {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<InstanceStatusCell
				instance={{ id: 'ins-a', status, instanceFqdn: 'ins-a.example.com', version } as Instance}
				index={0}
			/>
		</QueryClientProvider>,
	);
	await act(() => vi.advanceTimersByTimeAsync(1_000));
}

async function pollEnabledFor(status: string, version?: string) {
	await renderCell(status, version);
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

	it('shows an ERROR instance as unavailable instead of offering rotation', async () => {
		await renderCell('ERROR');
		expect(screen.getByLabelText('Status unavailable')).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it.each(['4.6.0', '4.7.3', '5.0.2'])('polls a Harper %s instance', async version => {
		expect(await pollEnabledFor('RUNNING', version)).toBe(true);
	});

	it.each(['4.4.24', '4.5.12'])(
		'does not poll a Harper %s instance, which rejects get_status with a 400 on every tick',
		async version => {
			expect(await pollEnabledFor('RUNNING', version)).toBe(false);
		},
	);

	it.each(['', 'custom-build'])(
		'does not poll an instance whose Harper version is %j, nor blame the version',
		async version => {
			expect(await pollEnabledFor('RUNNING', version)).toBe(false);
			expect(screen.getByLabelText('Status unavailable')).toBeTruthy();
		},
	);

	it('says why a pre-4.6 instance has no availability, instead of spinning or offering rotation', async () => {
		await renderCell('RUNNING', '4.5.12');
		expect(screen.getByLabelText('Status needs Harper 4.6 or later')).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
	});
});

describe('InstanceStatusCell off-screen gating', () => {
	beforeEach(() => {
		vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
	});

	it('does not poll a row until it scrolls into view', async () => {
		await renderCell('RUNNING');
		expect(state.enabled.at(-1)).toBe(false);

		act(() => FakeIntersectionObserver.setIntersecting(true));
		expect(state.enabled.at(-1)).toBe(true);
	});

	it('stops polling a row once it scrolls out of view', async () => {
		await renderCell('RUNNING');
		act(() => FakeIntersectionObserver.setIntersecting(true));
		act(() => FakeIntersectionObserver.setIntersecting(false));
		expect(state.enabled.at(-1)).toBe(false);
	});

	it('shows a spinner rather than an unknown status for a row that has not loaded yet', async () => {
		await renderCell('RUNNING');
		expect(screen.queryByText('Offline')).toBeNull();
		// The icon itself is hidden from screen readers, so the text is all they get.
		expect(document.querySelector('.animate-spin')?.getAttribute('aria-hidden')).toBe('true');
		expect(screen.getByText('Loading status')).toBeTruthy();
	});
});
