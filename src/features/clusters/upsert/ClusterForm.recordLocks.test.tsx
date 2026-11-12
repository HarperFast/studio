/** @vitest-environment jsdom */
import type { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import type { Organization } from '@/integrations/api/api.patch';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn(), put: vi.fn(), post } }));

vi.mock('@tanstack/react-router', () => {
	const router = { invalidate: vi.fn() };
	const navigate = vi.fn();
	return {
		useNavigate: () => navigate,
		useRouter: () => router,
		Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
			<a href={to} className={className}>{children}</a>
		),
	};
});

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(() => 'saving'), dismiss: vi.fn(), warning: vi.fn() },
}));

import type { HarperVersionsResponse } from '@/features/clusters/queries/getHarperVersionsQuery';
import { ClusterForm } from './ClusterForm';
import type { UpsertClusterSchemaType } from './upsertClusterSchema';

const regions = [
	{ id: 'us-small', region: 'US', latencyDescription: '90ms, small distribution', instanceCount: 2 },
] as SchemaRegion[];
const plans = [
	{
		id: 'free',
		deploymentType: 'colocated',
		deploymentDescription: 'Colocated',
		performanceDescription: 'Free tier',
		priceUsd: 0,
		allowedRegionIds: ['us-small'],
	},
	{ id: 'self-hosted', deploymentDescription: 'Self-Hosted', performanceDescription: 'Bring your own', priceUsd: 0 },
] as SchemaPlan[];

beforeAll(() => {
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
});
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});

function versions(...list: string[]): HarperVersionsResponse {
	return { name: 'versions', description: '', value: list.map(version => ({ name: 'stable', version })) };
}

function renderForm(
	defaultValues: Partial<UpsertClusterSchemaType>,
	{ clusterId, mode, harperVersions, recordLocksOn }: {
		clusterId?: string;
		mode?: 'version';
		harperVersions: HarperVersionsResponse;
		recordLocksOn?: boolean;
	},
) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<ClusterForm
				alreadyUsingFree={false}
				clusterId={clusterId}
				currentRegions={[]}
				defaultValues={{
					clusterName: 'Locks',
					abbreviatedName: '',
					version: '5.3.0',
					deploymentDescription: 'Colocated',
					performanceDescription: 'Free tier',
					fqdn: '',
					instances: [],
					regionPlans: [{ regionId: 'us-small' }],
					...defaultValues,
				}}
				deploymentToPerformanceToPlan={groupThenKeyBy(plans, 'deploymentDescription', 'performanceDescription')}
				harperVersions={harperVersions}
				mode={mode}
				organization={{ id: 'org-a', subdomain: 'org-a' } as Organization}
				organizationId="org-a"
				organizationRegions={[]}
				canUseCustomRegions={false}
				canDefineCustomRegions={false}
				lockedOrganizationRegionIds={[]}
				partialUpgrade={null}
				planTypes={plans}
				recordLocksOn={recordLocksOn}
				regionLocationsColocated={[...regions]}
				regionLocationsDedicated={[...regions]}
				setSavedClusterState={vi.fn()}
				startOffOnBilling={false}
			/>
		</QueryClientProvider>,
	);
}

const recordLocksBox = () => screen.queryByRole<HTMLInputElement>('checkbox', { name: 'Cluster-wide record locks' });

async function create() {
	post.mockResolvedValue({ data: { id: 'clu-new' } });
	const submit = screen.getByRole<HTMLButtonElement>('button', { name: /Create New Cluster/ });
	await waitFor(() => expect(submit.disabled).toBe(false));
	await act(async () => {
		fireEvent.click(submit);
	});
	await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
	return post.mock.calls[0][1];
}

describe('ClusterForm — record locks on create', () => {
	it('sends recordLocks: true when ticked on Harper 5.3.0', async () => {
		renderForm({}, { harperVersions: versions('5.3.0') });

		await act(async () => {
			fireEvent.click(recordLocksBox()!);
		});

		expect(await create()).toEqual(expect.objectContaining({ version: '5.3.0', recordLocks: true }));
	});

	it('leaves recordLocks out when the box is not ticked', async () => {
		renderForm({}, { harperVersions: versions('5.3.0') });
		expect(recordLocksBox()).toBeTruthy();

		expect(await create()).not.toHaveProperty('recordLocks');
	});

	it('offers nothing below 5.3.0, and drops a ticked box carried from a failed cluster', async () => {
		renderForm({ version: '5.2.13', recordLocks: true }, { harperVersions: versions('5.2.13') });
		expect(recordLocksBox()).toBeNull();

		expect(await create()).not.toHaveProperty('recordLocks');
	});

	it('offers nothing to a self-hosted cluster, and drops a box ticked before switching to it', async () => {
		renderForm({
			deploymentDescription: 'Self-Hosted',
			performanceDescription: 'Bring your own',
			recordLocks: true,
			fqdn: 'locks.example.com',
			regionPlans: [],
			instances: [{ secure: 'true', fqdn: 'node-1.example.com', port: 9925 }],
		}, { harperVersions: versions('5.3.0') });
		expect(recordLocksBox()).toBeNull();

		expect(await create()).not.toHaveProperty('recordLocks');
	});

	it('treats a 5.3.0 prerelease as below the floor, as central manager does', () => {
		renderForm({ version: '5.3.0-beta.4' }, { harperVersions: versions('5.3.0-beta.4') });

		expect(recordLocksBox()).toBeNull();
	});

	it('does not offer it on an edit', () => {
		renderForm({}, { clusterId: 'clu-1', harperVersions: versions('5.3.0') });

		expect(recordLocksBox()).toBeNull();
	});
});

describe('ClusterForm — the version picker while record locks are on', () => {
	async function openPicker() {
		const trigger = screen.getAllByRole('combobox').find(combobox => combobox.textContent?.includes('5.3.1'))!;
		await act(async () => {
			fireEvent.click(trigger);
		});
	}

	it('disables versions below 5.3.0 and says why', async () => {
		renderForm({ version: '5.3.1' }, {
			clusterId: 'clu-1',
			mode: 'version',
			recordLocksOn: true,
			harperVersions: {
				...versions('5.3.1', '5.2.13'),
				value: [{ name: 'current', version: '5.3.1' }, { name: 'scoped', version: '5.2.13', scoped: true }],
			},
		});
		expect(screen.getByText(/To move to an older version, turn them off on the/)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Record Locks page' }).getAttribute('href')).toBe(
			'/org-a/clu-1/record-locks',
		);

		await openPicker();

		const older = screen.getByRole('option', { name: /5\.2\.13/ });
		expect(older.getAttribute('aria-disabled')).toBe('true');
		expect(older.textContent).toContain('needs record locks off');
		expect(screen.getByRole('option', { name: /5\.3\.1/ }).getAttribute('aria-disabled')).toBeNull();
	});

	it('leaves every version open while record locks are off', async () => {
		renderForm({ version: '5.3.1' }, {
			clusterId: 'clu-1',
			mode: 'version',
			harperVersions: {
				...versions(),
				value: [{ name: 'current', version: '5.3.1' }, { name: 'scoped', version: '5.2.13', scoped: true }],
			},
		});
		expect(screen.queryByText(/turn them off on the Record Locks page/)).toBeNull();

		await openPicker();

		expect(screen.getByRole('option', { name: /5\.2\.13/ }).getAttribute('aria-disabled')).toBeNull();
	});
});
