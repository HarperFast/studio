/**
 * @vitest-environment jsdom
 */
import { Cluster, ClusterGrant } from '@/integrations/api/api.patch';
import { cleanup, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClusterExpiryStrip } from './ClusterExpiryStrip';

let current: Cluster | undefined;
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-test', clusterId: 'clu-test' }),
	useRouteContext: () => ({ cluster: current }),
	Link: ({ children }: { children: ReactNode }) => <a href="#edit">{children}</a>,
}));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterPermissions: () => ({ update: true }) }));

afterEach(() => {
	cleanup();
	current = undefined;
});

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

function withGrant(grant: Partial<ClusterGrant>, extra: Partial<Cluster> = {}): Cluster {
	return {
		id: 'clu-test',
		organizationId: 'org-test',
		status: 'RUNNING',
		grant: {
			id: 'cgr-test',
			source: 'purchased',
			status: 'ACTIVE',
			isActive: true,
			startsAt: daysFromNow(-1),
			endsAt: daysFromNow(2),
			cycleAnchor: null,
			expiryPolicy: 'conversion-pending',
			currentStage: null,
			stageUpdatedAt: null,
			allowedPlanIds: null,
			allowedRegionIds: null,
			...grant,
		},
		...extra,
	} as Cluster;
}

describe('ClusterExpiryStrip', () => {
	it('stays out of the way while an upgrade is still applying', () => {
		current = withGrant({}, { conversionState: 'APPLYING' });
		render(<ClusterExpiryStrip />);
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('says a failed upgrade did not go through, with the way back to the plan editor', () => {
		current = withGrant({}, { conversionState: 'FAILED' });
		render(<ClusterExpiryStrip />);
		expect(screen.getByRole('status').textContent).toContain('did not go through');
		expect(screen.getByRole('link', { name: 'Choose a plan' })).toBeTruthy();
	});
});
