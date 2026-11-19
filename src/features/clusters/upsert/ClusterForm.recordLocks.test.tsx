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

vi.mock('./ClusterBilling', () => ({
	ClusterBilling: ({ onGoBackToDetails, onSaveStateForBillingRedirect }: {
		onGoBackToDetails: () => void;
		onSaveStateForBillingRedirect: (redirecting: boolean) => void;
	}) => (
		<div>
			<button type="button" onClick={() => onSaveStateForBillingRedirect(true)}>Save draft for Stripe</button>
			<button type="button" onClick={onGoBackToDetails}>Back to Details</button>
		</div>
	),
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
	{
		id: 'paid',
		deploymentType: 'colocated',
		deploymentDescription: 'Colocated',
		performanceDescription: 'Paid tier',
		priceUsd: 100,
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
	{ clusterId, mode, harperVersions, recordLocksOn, setSavedClusterState = vi.fn(), startOffOnBilling = false }: {
		clusterId?: string;
		mode?: 'version';
		harperVersions: HarperVersionsResponse;
		recordLocksOn?: boolean;
		setSavedClusterState?: (value: null | ({ clusterId?: string } & UpsertClusterSchemaType)) => void;
		startOffOnBilling?: boolean;
	},
) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	const values = {
		clusterName: 'Locks',
		abbreviatedName: '',
		version: '5.3.0',
		deploymentDescription: 'Colocated',
		performanceDescription: 'Free tier',
		fqdn: '',
		instances: [],
		regionPlans: [{ regionId: 'us-small' }],
		...defaultValues,
	};
	const ui = (locksOn: boolean | undefined) => (
		<QueryClientProvider client={queryClient}>
			<ClusterForm
				alreadyUsingFree={false}
				clusterId={clusterId}
				currentRegions={[]}
				defaultValues={values}
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
				recordLocksOn={locksOn}
				regionLocationsColocated={regions}
				regionLocationsDedicated={regions}
				setSavedClusterState={setSavedClusterState}
				startOffOnBilling={startOffOnBilling}
			/>
		</QueryClientProvider>
	);
	const view = render(ui(recordLocksOn));
	return { ...view, setRecordLocksOn: (locksOn: boolean) => view.rerender(ui(locksOn)), setSavedClusterState };
}

const recordLocksBox = () => screen.queryByRole<HTMLInputElement>('checkbox', { name: 'Cluster-wide record locks' });

async function selectVersion(currentVersion: string, nextVersion: string) {
	const trigger = screen.getAllByRole('combobox').find(combobox => combobox.textContent?.includes(currentVersion))!;
	await act(async () => {
		fireEvent.click(trigger);
	});
	await act(async () => {
		fireEvent.click(screen.getByRole('option', { name: new RegExp(nextVersion.replaceAll('.', '\\.')) }));
	});
}

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
	it('starts checked on Harper 5.4.0+ and sends recordLocks: true', async () => {
		renderForm({ version: '5.4.0' }, { harperVersions: versions('5.4.0', '5.3.0') });
		expect(recordLocksBox()?.checked).toBe(true);

		expect(await create()).toEqual(expect.objectContaining({ version: '5.4.0', recordLocks: true }));
	});

	it('starts checked on a 5.4.0 prerelease at or above central manager auto-enable floor', async () => {
		renderForm({ version: '5.4.0-beta.1' }, { harperVersions: versions('5.4.0-beta.1', '5.3.0') });
		expect(recordLocksBox()?.checked).toBe(true);

		expect(await create()).toEqual(expect.objectContaining({ version: '5.4.0-beta.1', recordLocks: true }));
	});

	it('sends recordLocks: false when unchecked on Harper 5.4.0+', async () => {
		renderForm({ version: '5.4.0' }, { harperVersions: versions('5.4.0', '5.3.0') });
		expect(recordLocksBox()?.checked).toBe(true);

		await act(async () => {
			fireEvent.click(recordLocksBox()!);
		});
		expect(recordLocksBox()?.checked).toBe(false);

		expect(await create()).toEqual(expect.objectContaining({ version: '5.4.0', recordLocks: false }));
	});

	it('starts unchecked on Harper 5.3.0 and sends recordLocks: false', async () => {
		renderForm({}, { harperVersions: versions('5.3.0') });
		expect(recordLocksBox()?.checked).toBe(false);

		expect(await create()).toEqual(expect.objectContaining({ version: '5.3.0', recordLocks: false }));
	});

	it('sends recordLocks: true when ticked on Harper 5.3.0', async () => {
		renderForm({}, { harperVersions: versions('5.3.0') });

		await act(async () => {
			fireEvent.click(recordLocksBox()!);
		});

		expect(await create()).toEqual(expect.objectContaining({ version: '5.3.0', recordLocks: true }));
	});

	it('keeps the explanation in a tooltip behind the info button', async () => {
		renderForm({}, { harperVersions: versions('5.3.0') });
		expect(screen.queryByText(/lock a record across every instance/)).toBeNull();

		await act(async () => {
			fireEvent.focus(screen.getByRole('button', { name: 'What are cluster-wide record locks?' }));
		});

		expect((await screen.findAllByText(/lock a record across every instance/)).length).toBeGreaterThan(0);
	});

	it('resets an untouched box to match the version default when moving between 5.4 and 5.3', async () => {
		renderForm({ version: '5.4.0' }, { harperVersions: versions('5.4.0', '5.3.0') });
		expect(recordLocksBox()?.checked).toBe(true);

		await selectVersion('5.4.0', '5.3.0');
		await waitFor(() => expect(recordLocksBox()?.checked).toBe(false));

		await selectVersion('5.3.0', '5.4.0');
		await waitFor(() => expect(recordLocksBox()?.checked).toBe(true));

		await selectVersion('5.4.0', '5.3.0');
		await waitFor(() => expect(recordLocksBox()?.checked).toBe(false));
		expect(await create()).toEqual(expect.objectContaining({ version: '5.3.0', recordLocks: false }));
	});

	it('checks an untouched box when moving from 5.3 to 5.4', async () => {
		renderForm({ version: '5.3.0' }, { harperVersions: versions('5.4.0', '5.3.0') });
		expect(recordLocksBox()?.checked).toBe(false);

		await selectVersion('5.3.0', '5.4.0');
		await waitFor(() => expect(recordLocksBox()?.checked).toBe(true));

		expect(await create()).toEqual(expect.objectContaining({ version: '5.4.0', recordLocks: true }));
	});

	it('keeps the user choice across version switches once the box has been touched', async () => {
		renderForm({ version: '5.4.0' }, { harperVersions: versions('5.4.0', '5.3.0') });

		await act(async () => {
			fireEvent.click(recordLocksBox()!);
		});
		expect(recordLocksBox()?.checked).toBe(false);

		await selectVersion('5.4.0', '5.3.0');
		await selectVersion('5.3.0', '5.4.0');
		expect(recordLocksBox()?.checked).toBe(false);

		expect(await create()).toEqual(expect.objectContaining({ version: '5.4.0', recordLocks: false }));
	});

	it('keeps a touched box checked when moving from 5.4 to 5.3 even if toggled back to checked', async () => {
		renderForm({ version: '5.4.0' }, { harperVersions: versions('5.4.0', '5.3.0') });

		await act(async () => {
			fireEvent.click(recordLocksBox()!);
			fireEvent.click(recordLocksBox()!);
		});
		expect(recordLocksBox()?.checked).toBe(true);

		await selectVersion('5.4.0', '5.3.0');
		expect(recordLocksBox()?.checked).toBe(true);

		expect(await create()).toEqual(expect.objectContaining({ version: '5.3.0', recordLocks: true }));
	});

	it('keeps a seeded false default on 5.4.0 without treating it as a user touch across version switches', async () => {
		renderForm({ version: '5.4.0', recordLocks: false }, { harperVersions: versions('5.4.0', '5.3.0') });
		expect(recordLocksBox()?.checked).toBe(false);

		await selectVersion('5.4.0', '5.3.0');
		await selectVersion('5.3.0', '5.4.0');
		await waitFor(() => expect(recordLocksBox()?.checked).toBe(true));

		expect(await create()).toEqual(expect.objectContaining({ version: '5.4.0', recordLocks: true }));
	});

	it('does not treat a restored billing draft as touched, so switching version still updates the default', async () => {
		const savedDrafts: Array<null | ({ clusterId?: string } & UpsertClusterSchemaType)> = [];
		const setSavedClusterState = vi.fn((value) => savedDrafts.push(value));
		const first = renderForm(
			{ version: '5.4.0', performanceDescription: 'Paid tier' },
			{ harperVersions: versions('5.4.0', '5.3.0'), setSavedClusterState },
		);
		expect(recordLocksBox()?.checked).toBe(true);

		const next = screen.getByRole<HTMLButtonElement>('button', { name: /Confirm Payment Details/ });
		await waitFor(() => expect(next.disabled).toBe(false));
		await act(async () => {
			fireEvent.click(next);
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save draft for Stripe' }));
		});
		const draft = savedDrafts.at(-1)!;
		first.unmount();

		renderForm(draft, { harperVersions: versions('5.4.0', '5.3.0'), startOffOnBilling: true });
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Back to Details' }));
		});
		expect(recordLocksBox()?.checked).toBe(true);

		await selectVersion('5.4.0', '5.3.0');
		await waitFor(() => expect(recordLocksBox()?.checked).toBe(false));
	});

	it('preserves a false value across a Stripe billing draft while version stays unchanged', async () => {
		const savedDrafts: Array<null | ({ clusterId?: string } & UpsertClusterSchemaType)> = [];
		const setSavedClusterState = vi.fn((value) => savedDrafts.push(value));
		const first = renderForm(
			{ version: '5.4.0', performanceDescription: 'Paid tier' },
			{ harperVersions: versions('5.4.0', '5.3.0'), setSavedClusterState },
		);

		await act(async () => {
			fireEvent.click(recordLocksBox()!);
		});
		const next = screen.getByRole<HTMLButtonElement>('button', { name: /Confirm Payment Details/ });
		await waitFor(() => expect(next.disabled).toBe(false));
		await act(async () => {
			fireEvent.click(next);
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save draft for Stripe' }));
		});
		const draft = savedDrafts.at(-1)!;
		expect(draft.recordLocks).toBe(false);
		first.unmount();

		renderForm(draft, { harperVersions: versions('5.4.0', '5.3.0'), startOffOnBilling: true });
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Back to Details' }));
		});
		expect(recordLocksBox()?.checked).toBe(false);
	});

	it('offers nothing below 5.3.0, and drops a ticked box carried from a failed cluster', async () => {
		renderForm({ version: '5.2.13', recordLocks: true }, { harperVersions: versions('5.2.13') });
		expect(recordLocksBox()).toBeNull();

		expect(await create()).not.toHaveProperty('recordLocks');
	});

	it('leaves recordLocks out after switching from 5.4.0 to a pre-5.3 version', async () => {
		renderForm({ version: '5.4.0' }, { harperVersions: versions('5.4.0', '5.2.13') });
		expect(recordLocksBox()?.checked).toBe(true);

		await selectVersion('5.4.0', '5.2.13');
		expect(recordLocksBox()).toBeNull();

		expect(await create()).not.toHaveProperty('recordLocks');
	});

	it('offers nothing to a self-hosted cluster on 5.4+, and leaves recordLocks out', async () => {
		renderForm({
			version: '5.4.0',
			deploymentDescription: 'Self-Hosted',
			performanceDescription: 'Bring your own',
			fqdn: 'locks.example.com',
			regionPlans: [],
			instances: [{ secure: 'true', fqdn: 'node-1.example.com', port: 9925 }],
		}, { harperVersions: versions('5.4.0') });
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

	it('refuses a version below 5.3.0 picked before the live read showed record locks on', async () => {
		renderForm({ version: '5.2.13' }, {
			clusterId: 'clu-1',
			mode: 'version',
			recordLocksOn: true,
			harperVersions: {
				...versions(),
				value: [{ name: 'current', version: '5.3.1' }, { name: 'scoped', version: '5.2.13', scoped: true }],
			},
		});

		expect(await screen.findByText('Record locks are on, so the cluster needs Harper 5.3.0 or later.')).toBeTruthy();
	});

	it('says nothing before a version is picked, and lets go once record locks turn off', async () => {
		const options = {
			...versions(),
			value: [{ name: 'current', version: '5.3.1' }, { name: 'scoped', version: '5.2.13', scoped: true }],
		};
		const message = 'Record locks are on, so the cluster needs Harper 5.3.0 or later.';
		const unpicked = renderForm({ version: undefined }, {
			clusterId: 'clu-1',
			mode: 'version',
			recordLocksOn: true,
			harperVersions: options,
		});
		await act(async () => {});
		expect(screen.queryByText(message)).toBeNull();
		unpicked.unmount();

		const { setRecordLocksOn } = renderForm({ version: '5.2.13' }, {
			clusterId: 'clu-1',
			mode: 'version',
			recordLocksOn: true,
			harperVersions: options,
		});
		await screen.findByText(message);

		await act(async () => setRecordLocksOn(false));

		await waitFor(() => expect(screen.queryByText(message)).toBeNull());
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
