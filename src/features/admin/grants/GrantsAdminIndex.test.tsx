/**
 * @vitest-environment jsdom
 */
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrantsAdminIndex } from './index';

let grantRows: AdminClusterGrant[] = [];
let truncated = false;
const requestedFilters = vi.fn();
vi.mock('./queries/getGrants', () => ({
	getGrantsQueryOptions: (filters: { source?: string; status?: string } = {}) => ({
		queryKey: ['test-grants', JSON.stringify(grantRows.map((g) => g.id)), filters.source ?? '', filters.status ?? ''],
		queryFn: async () => {
			requestedFilters(filters);
			return { grants: grantRows, returned: grantRows.length, truncated, limit: 500 };
		},
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
	truncated = false;
	requestedFilters.mockClear();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

function grant(overrides: Partial<AdminClusterGrant>): AdminClusterGrant {
	return {
		id: 'cgr-a',
		organizationId: 'org-1',
		clusterId: 'clu-a',
		source: 'trial',
		status: 'ACTIVE',
		startsAt: daysFromNow(-10),
		endsAt: daysFromNow(20),
		expiryPolicy: 'consumer-trial',
		currentStage: null,
		...overrides,
	};
}

async function mount(rows: AdminClusterGrant[]) {
	grantRows = rows;
	const result = render(
		<TestProvider>
			<GrantsAdminIndex />
		</TestProvider>,
	);
	// Two act passes: one for the router to settle, one for the queries to resolve.
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
	return result;
}

describe('GrantsAdminIndex', () => {
	it('lists grants with the org name resolved', async () => {
		await mount([grant({})]);
		expect(screen.getByText('cgr-a')).toBeTruthy();
		expect(screen.getByText(/org-1 \(Acme\)/)).toBeTruthy();
	});

	it('marks an unbound voucher instead of linking a cluster', async () => {
		await mount([grant({ id: 'cgr-voucher', clusterId: null })]);
		expect(screen.getByText('unbound voucher')).toBeTruthy();
	});

	// Server-computed liveness beats stored status: an ACTIVE row past endsAt is not live until the
	// runner stamps it — the same rule every customer surface applies.
	it('flags an ACTIVE row the server says has lapsed', async () => {
		await mount([grant({ isActive: false })]);
		expect(screen.getByText('ACTIVE (lapsed)')).toBeTruthy();
	});

	// Studio holds no expiry offsets, so without a server timeline the column must not guess.
	it('shows next-due only when the server sent a timeline', async () => {
		await mount([
			grant({
				id: 'cgr-timed',
				timeline: [
					{ stage: 'WARNED', dueAt: daysFromNow(-1), applied: true },
					{ stage: 'SHUTDOWN', dueAt: daysFromNow(6), applied: false },
				],
			}),
			grant({ id: 'cgr-bare', clusterId: 'clu-b' }),
		]);
		expect(screen.getByText(/SHUTDOWN/)).toBeTruthy();
		// The bare row's next-due cell is a dash, not a locally-derived date.
		const bareRow = screen.getByText('cgr-bare').closest('tr');
		expect(bareRow?.textContent).toContain('—');
	});

	it('sorts soonest-ending first, forever grants last', async () => {
		await mount([
			grant({ id: 'cgr-forever', clusterId: 'clu-f', endsAt: null }),
			grant({ id: 'cgr-soon', clusterId: 'clu-s', endsAt: daysFromNow(2) }),
			grant({ id: 'cgr-later', clusterId: 'clu-l', endsAt: daysFromNow(30) }),
		]);
		const ids = screen.getAllByText(/^cgr-/).map((node) => node.textContent);
		expect(ids).toEqual(['cgr-soon', 'cgr-later', 'cgr-forever']);
	});

	// A silently-capped list reads as "nothing else is due" — the worst lie a billing view can tell.
	it('says so when the server truncated the result', async () => {
		truncated = true;
		await mount([grant({})]);
		expect(screen.getByRole('alert').textContent).toContain('truncated');
	});

	it('shows no truncation warning on a complete result', async () => {
		await mount([grant({})]);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	// Source/status narrow on the server so the page stops fetching the world; the mock captures
	// what the query was asked for. The select must actually be driven — asserting only the default
	// call passes whether or not the filter is wired (the vacuous-assertion trap in AGENTS.md).
	it('passes a picked source to the server rather than filtering locally', async () => {
		await mount([grant({})]);
		expect(requestedFilters).toHaveBeenLastCalledWith({ source: undefined, status: undefined });

		const { fireEvent } = await import('@testing-library/react');
		fireEvent.keyDown(screen.getByLabelText('Filter by source'), { key: 'ArrowDown' });
		await act(() => null);
		fireEvent.click(screen.getByRole('option', { name: 'trial' }));
		await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
		expect(requestedFilters).toHaveBeenLastCalledWith({ source: 'trial', status: undefined });
	});

	it('filters by free text across id, cluster, org and reason', async () => {
		await mount([
			grant({ id: 'cgr-one', reason: 'conference comp' }),
			grant({ id: 'cgr-two', clusterId: 'clu-other' }),
		]);
		const search = screen.getByPlaceholderText(/Search id/);
		await act(async () => {
			const { fireEvent } = await import('@testing-library/react');
			fireEvent.change(search, { target: { value: 'conference' } });
		});
		expect(screen.getByText('cgr-one')).toBeTruthy();
		expect(screen.queryByText('cgr-two')).toBeNull();
	});
});
