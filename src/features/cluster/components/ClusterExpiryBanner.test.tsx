/**
 * @vitest-environment jsdom
 */
import { Cluster, ClusterGrant } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClusterExpiryBanner } from './ClusterExpiryBanner';

// TestProvider mounts the real router, which starts the app's SystemStatus WebSocket. Under vitest
// that resolves to undici 8's implementation, whose Event class is from a different realm than
// jsdom's, so connecting throws ERR_INVALID_ARG_TYPE and vitest reports an unhandled error. A
// banner test has no business opening a socket at all — see AGENTS.md on undici for the wider issue.
class InertWebSocket {
	readyState = 3;
	close() {}
	send() {}
	addEventListener() {}
	removeEventListener() {}
}

beforeAll(() => vi.stubGlobal('WebSocket', InertWebSocket));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => cleanup());

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

function cluster(grant: Partial<ClusterGrant> | null): Cluster {
	return {
		id: 'clu-test',
		name: 'Test Cluster',
		organizationId: 'org-test',
		status: 'RUNNING',
		grant: grant && {
			id: 'cgr-test',
			source: 'trial',
			status: 'ACTIVE',
			isActive: true,
			startsAt: daysFromNow(-30),
			endsAt: daysFromNow(30),
			cycleAnchor: null,
			expiryPolicy: 'consumer-trial',
			currentStage: null,
			stageUpdatedAt: null,
			allowedPlanIds: null,
			allowedRegionIds: null,
			...grant,
		},
	} as Cluster;
}

// TestProvider mounts children through the router's defaultComponent, so nothing is in the DOM
// until the router settles — hence the act() after every render (same as OrgCard.test.tsx).
async function renderBanner(c: Cluster | undefined, canUpdate = true) {
	const result = render(
		<TestProvider>
			<ClusterExpiryBanner cluster={c} canUpdate={canUpdate} />
		</TestProvider>,
	);
	await act(() => null);
	return result;
}

const upgradeLink = () => screen.queryByRole('link', { name: 'Choose a Plan' });

describe('ClusterExpiryBanner', () => {
	it('renders nothing without a cluster', async () => {
		await renderBanner(undefined);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('renders nothing for a cluster that never had a grant', async () => {
		await renderBanner(cluster(null));
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('renders nothing for a live grant the runner has not staged', async () => {
		await renderBanner(cluster({}));
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('warns with a countdown once the runner stages the grant, and offers the upgrade', async () => {
		await renderBanner(cluster({ currentStage: 'WARNED', endsAt: daysFromNow(5) }));
		expect(screen.getByRole('alert').textContent).toContain('Trial ends in 5 days');
		// The upgrade is offered while the cluster is still healthy — that is the point of warning.
		expect(upgradeLink()?.getAttribute('href')).toBe('/#/org-test/clu-test/edit?upgrade=hobbyist');
	});

	it('offers the upgrade route once service has been withdrawn', async () => {
		await renderBanner(
			cluster({ isActive: false, status: 'EXPIRED', currentStage: 'SHUTDOWN', endsAt: daysFromNow(-2) }),
		);
		expect(screen.getByRole('alert').textContent).toContain('Trial ended 2 days ago');
		expect(upgradeLink()?.getAttribute('href')).toBe('/#/org-test/clu-test/edit?upgrade=hobbyist');
	});

	// A viewer without update permission can't act on it, so the link would only lead to a refusal.
	it('states the problem but offers no action without update permission', async () => {
		await renderBanner(cluster({ isActive: false, currentStage: 'SHUTDOWN', endsAt: daysFromNow(-2) }), false);
		expect(screen.getByRole('alert').textContent).toContain('Trial ended 2 days ago');
		expect(upgradeLink()).toBeNull();
	});

	it('shows a conversion in flight as progress rather than an expiry warning', async () => {
		await renderBanner(cluster({ source: 'purchased', expiryPolicy: 'conversion-pending', endsAt: daysFromNow(0) }));
		const alert = screen.getByRole('alert');
		expect(alert.textContent).toContain('Your new plan is being applied');
		expect(alert.textContent).not.toContain('ended');
		expect(upgradeLink()).toBeNull();
	});

	it('does not offer an upgrade for a cluster already deleted', async () => {
		await renderBanner(cluster({ isActive: false, status: 'EXPIRED', currentStage: 'DELETED' }));
		expect(screen.getByRole('alert').textContent).toContain('deleted after its plan ended');
		expect(upgradeLink()).toBeNull();
	});
});
