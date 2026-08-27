/**
 * @vitest-environment jsdom
 *
 * The cluster editor had no test that mounted it. A temporal-dead-zone crash shipped in this
 * feature behind a fully green suite, and a review's mutation pass then found the plan filter and
 * the region lock could both be reverted without a single failure. These are the behaviour-level
 * tests those mutants should have hit.
 */
import { Form } from '@/components/ui/form/Form';
import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { TestProvider } from '@/lib/test/TestProvider';
import { zodResolver } from '@hookform/resolvers/zod';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act, ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClusterDetails } from './ClusterDetails';
import { UpsertClusterSchema, UpsertClusterSchemaType } from './upsertClusterSchema';

// The Grant ID field is staff-gated; everything else from this module stays real.
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useStaffPermission: () => true,
}));

afterEach(() => cleanup());

const plan = (id: string, priceUsd: number, performance: string, deployment = 'Colocated'): SchemaPlan =>
	({
		id,
		priceUsd,
		planLevel: 0,
		performanceDescription: performance,
		deploymentDescription: deployment,
		deploymentType: deployment.toLowerCase(),
	}) as SchemaPlan;

const TRIAL = plan('fabric-block-trial', 0, '30-day trial (1K read/min)');
const HOBBYIST = plan('fabric-block-hobbyist', 20, 'Hobbyist (1K read/min)');
const LEVEL_1 = plan('fabric-block-level-1', 85, 'Medium (10K read/min)');

const CATALOGUE: Record<string, Record<string, SchemaPlan>> = {
	Colocated: {
		[TRIAL.performanceDescription!]: TRIAL,
		[HOBBYIST.performanceDescription!]: HOBBYIST,
		[LEVEL_1.performanceDescription!]: LEVEL_1,
	},
	Dedicated: { 'High (100K read/min)': plan('fabric-block-dedicated-2', 1500, 'High (100K read/min)', 'Dedicated') },
};

const region = (id: string, name: string, latency: string): SchemaRegion =>
	({ id, region: name, latencyDescription: latency, instanceCount: 2 }) as SchemaRegion;

const REGIONS = [region('us-1', 'US', 'narrow'), region('europe-1', 'Europe', 'narrow')];
const REGION_MAP = {
	US: { narrow: REGIONS[0] },
	Europe: { narrow: REGIONS[1] },
};

function Harness(
	{ children, defaults }: { children: (form: never) => ReactNode; defaults: Partial<UpsertClusterSchemaType> },
) {
	const form = useForm<UpsertClusterSchemaType>({
		resolver: zodResolver(UpsertClusterSchema),
		mode: 'onChange',
		defaultValues: {
			clusterName: 'Test Cluster',
			abbreviatedName: 'test',
			version: '4.6.0',
			deploymentDescription: 'Colocated',
			performanceDescription: HOBBYIST.performanceDescription!,
			fqdn: '',
			instances: [],
			regionPlans: [{ regionName: 'US', latencyDescription: 'narrow' }],
			...defaults,
		} as UpsertClusterSchemaType,
	});
	return <Form {...form}>{children(form as never)}</Form>;
}

async function mountEditor(overrides: Partial<Parameters<typeof ClusterDetails>[0]> = {}) {
	const result = render(
		<TestProvider>
			<Harness defaults={{ performanceDescription: overrides.selectedPerformance ?? HOBBYIST.performanceDescription! }}>
				{(form) => (
					<ClusterDetails
						calculatedNames={{ suggestedAbbreviatedName: 'test', fullHostName: 'test.example' }}
						deploymentToPerformanceToPlan={CATALOGUE}
						form={form}
						harperVersions={{ value: [{ name: 'current', version: '4.6.0' }] } as never}
						isEnterprise={false}
						cloudProvider={undefined}
						isPending={false}
						mode={undefined}
						partialUpgrade={null}
						regionLocations={REGIONS}
						regionNameToLatencyToRegion={REGION_MAP}
						selectedDeployment="Colocated"
						selectedPerformance={HOBBYIST.performanceDescription!}
						selectedPlan={HOBBYIST}
						totalPrice={20}
						{...overrides}
					/>
				)}
			</Harness>
		</TestProvider>,
	);
	await act(() => null);
	return result;
}

/**
 * The select for a labelled field. Radix renders its trigger as a disabled-aware button, so the
 * lock is readable straight off the DOM without opening the menu (which in jsdom needs a keyDown,
 * not a pointerDown).
 */
function selectFor(labelText: string | RegExp): HTMLElement {
	const label = screen.getAllByText(labelText).find((node) => node.closest('[data-slot="form-item"]'));
	const item = label?.closest('[data-slot="form-item"]');
	const trigger = item?.querySelector('[data-slot="select-trigger"]');
	if (!trigger) { throw new Error(`no select found for label ${String(labelText)}`); }
	return trigger as HTMLElement;
}

const isLocked = (el: HTMLElement) => el.hasAttribute('disabled') || el.getAttribute('data-disabled') !== null;

/**
 * Radix Select only renders its options while open, and in jsdom a pointerDown does NOT open it —
 * ArrowDown does. Without this, asserting an option is absent passes whether or not the filter
 * that removes it works at all, which is how the plan filter survived mutation.
 */
async function openedOptions(labelText: string | RegExp): Promise<string[]> {
	fireEvent.keyDown(selectFor(labelText), { key: 'ArrowDown' });
	await act(() => null);
	return screen.getAllByRole('option').map((node) => node.textContent ?? '');
}

describe('ClusterDetails — the editor mounts', () => {
	it('renders without throwing', async () => {
		await mountEditor({ clusterId: 'clu-test' });
		expect(screen.getByText('Harper Deployment')).toBeTruthy();
		expect(document.querySelectorAll('[data-slot="select-trigger"]').length).toBeGreaterThan(0);
	});
});

describe('ClusterDetails — plans a customer may move onto', () => {
	// A trial is granted at signup and cannot be re-entered, so offering it on an existing cluster
	// advertises a change central-manager refuses.
	it('does not offer the trial when editing an existing cluster', async () => {
		await mountEditor({ clusterId: 'clu-test', currentPlanId: LEVEL_1.id });
		const options = await openedOptions(/Performance/);
		expect(options.some((text) => /30-day trial/.test(text))).toBe(false);
		// The picker is not simply empty — the paid tiers are still there.
		expect(options.some((text) => /Hobbyist/.test(text))).toBe(true);
	});

	it('offers the trial when creating a cluster', async () => {
		await mountEditor({ clusterId: undefined });
		expect((await openedOptions(/Performance/)).some((text) => /30-day trial/.test(text))).toBe(true);
	});

	// Otherwise a customer still on the trial opens the editor with nothing selected.
	it('keeps the trial listed while it is the tier being shown', async () => {
		await mountEditor({
			clusterId: 'clu-test',
			currentPlanId: TRIAL.id,
			selectedPerformance: TRIAL.performanceDescription!,
			selectedPlan: TRIAL,
		});
		expect((await openedOptions(/Performance/)).some((text) => /30-day trial/.test(text))).toBe(true);
	});

	// Arriving from the upgrade CTA preselects Hobbyist, so the trial is not being displayed and
	// listing it only offers a move back onto a plan that cannot be re-entered.
	it('drops the trial once the selection has moved onto the upgrade target', async () => {
		await mountEditor({ clusterId: 'clu-test', currentPlanId: TRIAL.id, selectedPlan: HOBBYIST });
		expect((await openedOptions(/Performance/)).some((text) => /30-day trial/.test(text))).toBe(false);
	});
});

describe('ClusterDetails — the frozen region set', () => {
	it('disables region and distribution while the cluster is on a region-frozen plan', async () => {
		await mountEditor({ clusterId: 'clu-test', regionSetFrozen: true });
		expect(isLocked(selectFor(/^Region/))).toBe(true);
		expect(isLocked(selectFor(/Latency, Distribution/))).toBe(true);
	});

	it('leaves them editable once the plan no longer freezes them', async () => {
		await mountEditor({ clusterId: 'clu-test', regionSetFrozen: false });
		expect(isLocked(selectFor(/^Region/))).toBe(false);
	});

	it('explains why the region is locked rather than presenting a dead control', async () => {
		await mountEditor({ clusterId: 'clu-test', regionSetFrozen: true });
		expect(screen.getByText(/region stays as it is while you change plans/)).toBeTruthy();
	});
});

describe('ClusterDetails — the Hobbyist deployment lock', () => {
	// D1: on the create page Hobbyist can be the default for an org that already holds a free
	// cluster; locking deployment there strands anyone who wanted Dedicated or Self-Hosted.
	it('does not lock the deployment picker when creating a cluster', async () => {
		await mountEditor({ clusterId: undefined, selectedPlan: HOBBYIST });
		expect(isLocked(selectFor('Harper Deployment'))).toBe(false);
	});

	it('locks it while editing a cluster onto Hobbyist, which is colocated-only', async () => {
		await mountEditor({ clusterId: 'clu-test', selectedPlan: HOBBYIST });
		expect(isLocked(selectFor('Harper Deployment'))).toBe(true);
	});
});

describe('ClusterDetails — arriving from the upgrade CTA', () => {
	const submitButton = () =>
		screen.getAllByRole('button').find((b) => /Edit Cluster|Confirm Payment/.test(b.textContent ?? ''));

	// Preselecting the target plan makes it the form's default, so nothing is dirty — the CTA used to
	// land on a disabled button, which is the dead end it was supposed to fix.
	it('enables submit when the preselected plan differs from what the cluster runs', async () => {
		await mountEditor({ clusterId: 'clu-test', currentPlanId: TRIAL.id, selectedPlan: HOBBYIST });
		expect(submitButton()?.hasAttribute('disabled')).toBe(false);
	});

	it('leaves submit disabled when nothing has actually changed', async () => {
		await mountEditor({ clusterId: 'clu-test', currentPlanId: HOBBYIST.id, selectedPlan: HOBBYIST });
		expect(submitButton()?.hasAttribute('disabled')).toBe(true);
	});

	// The billing step's own submit requires a valid payment method, so it would block a create that
	// central-manager would have allowed on a claimed grant. Button label and destination read one
	// predicate, so the button can never promise the step it does not take.
	describe('claiming a grant on create', () => {
		it('sends a paid plan to billing when no grant is entered', async () => {
			await mountEditor();
			expect(screen.getByRole('button', { name: /Confirm Payment Details/ })).toBeTruthy();
		});

		it('creates directly once a grant id is entered', async () => {
			await mountEditor();
			fireEvent.change(screen.getByPlaceholderText(/cgr-/), { target: { value: 'cgr-abc' } });
			await act(() => null);
			expect(screen.getByRole('button', { name: /Create New Cluster/ })).toBeTruthy();
		});

		it('has no grant field when editing an existing cluster', async () => {
			await mountEditor({ clusterId: 'clu-1' });
			expect(screen.queryByPlaceholderText(/cgr-/)).toBeNull();
		});
	});
});
