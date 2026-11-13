/** @vitest-environment jsdom */
import { Cluster, Instance } from '@/integrations/api/api.patch';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, put, post: vi.fn() } }));
const params = vi.hoisted(() => ({ organizationId: 'org-1', clusterId: 'clu-1' }));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
		<a href={to} className={className}>{children}</a>
	),
	useParams: () => params,
}));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterPermissions: () => ({ update: true }) }));
vi.mock('@/features/cluster/components/ClusterContentWithSubNavMenu', () => ({
	ClusterContentWithSubNavMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { forgetClusterReadsForTests, recordClusterRead } from '@/features/cluster/queries/getClusterInfoQuery';
import { nextObservationStamp } from '@/lib/restart/restartTracker';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { forgetAllSavesForTests, rememberSave } from './pendingRecordLocksSaves';
import { RecordLocksPage, RecordLocksSettings, ROLL_START_GRACE_MS } from './RecordLocksPage';

beforeAll(() => {
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
});

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	// The page polls while a roll is moving; the test drives the cluster through props instead.
	get.mockReturnValue(new Promise(() => {}));
});
afterEach(() => {
	cleanup();
	consoleError.mockRestore();
	vi.useRealTimers();
	vi.resetAllMocks();
	forgetAllSavesForTests();
	forgetClusterReadsForTests();
});

function instance(overrides: Partial<Instance> = {}): Instance {
	return { id: 'ins-1', status: 'RUNNING', version: '5.3.1', ...overrides } as Instance;
}

function cluster(overrides: Partial<Cluster> = {}): Cluster {
	return {
		id: 'clu-1',
		name: 'locks',
		organizationId: 'org-1',
		status: 'RUNNING',
		plans: [{ planId: 'shared-basic' }],
		instances: [instance({ id: 'ins-1' }), instance({ id: 'ins-2' })],
		...overrides,
	} as Cluster;
}

function setup(initial: Cluster, { canUpdate = true }: { canUpdate?: boolean } = {}) {
	const queryClient = new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const ui = (c: Cluster) => (
		<QueryClientProvider client={queryClient}>
			<RecordLocksSettings cluster={c} organizationId="org-1" canUpdate={canUpdate} />
		</QueryClientProvider>
	);
	const view = render(ui(initial));
	return {
		...view,
		show: (c: Cluster, { requestedAt = nextObservationStamp() }: { requestedAt?: number } = {}) => {
			act(() => {
				recordClusterRead(c.id, requestedAt);
				queryClient.setQueryData([c.id], c);
			});
			view.rerender(ui(c));
		},
		remount: (c: Cluster) => {
			view.unmount();
			return render(ui(c));
		},
	};
}

const recordLocksSwitch = () => screen.getByRole<HTMLButtonElement>('switch', { name: 'Cluster-wide record locks' });

async function confirm(action: 'Turn on' | 'Turn off') {
	await act(async () => {
		fireEvent.click(recordLocksSwitch());
	});
	const dialog = await screen.findByRole('alertdialog');
	const text = dialog.textContent;
	await act(async () => {
		fireEvent.click(within(dialog).getByRole('button', { name: action }));
	});
	return text;
}

interface Deferred {
	promise: Promise<unknown>;
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
}

function deferred(): Deferred {
	let resolve!: (value: unknown) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function gatewayTimeout() {
	return {
		isAxiosError: true,
		message: 'Request failed with status code 504',
		config: { method: 'put', url: '/Cluster/clu-1' },
		response: { status: 504, data: 'Gateway Timeout' },
	} as AxiosError;
}

describe('RecordLocksSettings', () => {
	it('explains what the setting does', () => {
		setup(cluster());

		expect(screen.getByText(/locks a record across every instance in the/)).toBeTruthy();
		expect(screen.getByText(/on a table that replicates fails with a 503 error/)).toBeTruthy();
		expect(screen.getByText(/RocksDB storage engine/)).toBeTruthy();
	});

	it('turns them on in a request of its own, after saying the instances restart', async () => {
		put.mockResolvedValue({ data: { id: 'clu-1', recordLocks: true, instancesUpdated: ['ins-1', 'ins-2'] } });
		const { show } = setup(cluster());
		expect(within(recordLocksSwitch().closest('div')!).getByText('Off')).toBeTruthy();

		const dialogText = await confirm('Turn on');

		expect(dialogText).toContain("restarts the cluster's 2 instances one at a time");
		await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
		expect(put).toHaveBeenCalledWith('/Cluster/clu-1', { recordLocks: true });

		// Central manager answered before its roll marked the cluster UPDATING: the record already says
		// on, the members don't yet, and the cluster still reads RUNNING.
		await screen.findByText('Turning record locks on');
		show(cluster({ recordLocks: true }));
		expect(screen.getByText('Turning record locks on')).toBeTruthy();
		expect(screen.queryByText(/didn't finish/)).toBeNull();

		show(cluster({
			recordLocks: true,
			status: 'UPDATING',
			instances: [instance({ id: 'ins-1', recordLocks: true }), instance({ id: 'ins-2', status: 'PENDING_UPGRADE' })],
		}));
		expect(screen.getByText(/1 of 2 done/)).toBeTruthy();
		expect(recordLocksSwitch().disabled).toBe(true);

		show(cluster({
			recordLocks: true,
			instances: [instance({ id: 'ins-1', recordLocks: true }), instance({ id: 'ins-2', recordLocks: true })],
		}));
		expect(screen.queryByText('Turning record locks on')).toBeNull();
		expect(screen.getByText('On')).toBeTruthy();
		expect(recordLocksSwitch().getAttribute('aria-checked')).toBe('true');
	});

	it('warns, when turning them off, what that does to lock()', async () => {
		put.mockReturnValue(new Promise(() => {}));
		setup(cluster({
			recordLocks: true,
			instances: [instance({ id: 'ins-1', recordLocks: true }), instance({ id: 'ins-2', recordLocks: true })],
		}));

		const dialogText = await confirm('Turn off');

		expect(dialogText).toContain('on a table that replicates fails');
		await waitFor(() => expect(put).toHaveBeenCalledWith('/Cluster/clu-1', { recordLocks: false }));
	});

	it('can skip draining traffic, as a version update can', async () => {
		put.mockReturnValue(new Promise(() => {}));
		setup(cluster());
		await act(async () => {
			fireEvent.click(recordLocksSwitch());
		});
		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('drained of traffic first');

		await act(async () => {
			fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Immediate restart' }));
		});
		expect(dialog.textContent).toContain('restarts right away, while it still takes traffic');
		await act(async () => {
			fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
		});

		await waitFor(() => expect(put).toHaveBeenCalledWith('/Cluster/clu-1', { recordLocks: true, skipGtmWait: true }));
	});

	it('starts every confirmation with the drain on', async () => {
		setup(cluster());
		await act(async () => {
			fireEvent.click(recordLocksSwitch());
		});
		let dialog = await screen.findByRole('alertdialog');
		await act(async () => {
			fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Immediate restart' }));
		});
		await act(async () => {
			fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		});
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

		await act(async () => {
			fireEvent.click(recordLocksSwitch());
		});

		dialog = await screen.findByRole('alertdialog');
		expect(within(dialog).getByRole<HTMLInputElement>('checkbox', { name: 'Immediate restart' }).checked).toBe(false);
	});

	it('sends nothing when the confirmation is cancelled', async () => {
		setup(cluster());
		await act(async () => {
			fireEvent.click(recordLocksSwitch());
		});

		await act(async () => {
			fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
		});

		expect(put).not.toHaveBeenCalled();
		expect(recordLocksSwitch().getAttribute('aria-checked')).toBe('false');
	});

	it("shows central manager's refusal", async () => {
		const title = 'Record locks require Harper 5.3.0 or later; this cluster would run 5.2.13';
		put.mockRejectedValue(
			{
				isAxiosError: true,
				message: 'Request failed with status code 400',
				response: { status: 400, data: { type: 'error:ClientError', code: 'ClientError', title, status: 400 } },
			} as AxiosError,
		);
		setup(cluster());

		await confirm('Turn on');

		expect((await screen.findByText(title)).getAttribute('role')).toBe('alert');
		expect(screen.queryByText('Turning record locks on')).toBeNull();
	});

	it('reads a PUT that got no answer as a roll that may be starting, not as one that stopped', async () => {
		put.mockRejectedValue(
			{
				isAxiosError: true,
				message: 'Request failed with status code 504',
				config: { method: 'put', url: '/Cluster/clu-1' },
				response: { status: 504, data: 'Gateway Timeout' },
			} as AxiosError,
		);
		const { show } = setup(cluster());

		await confirm('Turn on');
		await screen.findByText(/couldn't confirm whether that went through/);
		// central manager did apply it: the record says on, the members don't yet
		show(cluster({ recordLocks: true }));

		expect(screen.getByText('Turning record locks on')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

		show(cluster({
			recordLocks: true,
			instances: [instance({ id: 'ins-1', recordLocks: true }), instance({ id: 'ins-2', recordLocks: true })],
		}));

		expect(screen.getByText('On')).toBeTruthy();
		expect(screen.queryByText(/couldn't confirm whether that went through/)).toBeNull();
	});

	it('disables the switch below 5.3.0, says why, and links to the version page', () => {
		setup(cluster({ instances: [instance({ version: '5.2.13' })] }));

		expect(recordLocksSwitch().disabled).toBe(true);
		expect(screen.getByText(/Record locks need Harper 5\.3\.0 or later, and 1 instance runs 5\.2\.13/)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Change the Harper version' }).getAttribute('href')).toBe(
			'/org-1/clu-1/edit/version',
		);
	});

	it('disables the switch while a member is not running', () => {
		setup(cluster({ instances: [instance(), instance({ id: 'ins-2', name: 'edge-2', status: 'STOPPED' })] }));

		expect(recordLocksSwitch().disabled).toBe(true);
		expect(screen.getByText('edge-2 is stopped. Every instance has to be running to change record locks.'))
			.toBeTruthy();
	});

	it('shows the state but no way to change it without permission to update the cluster', () => {
		setup(cluster(), { canUpdate: false });

		expect(recordLocksSwitch().disabled).toBe(true);
		expect(screen.getByText('You need permission to update this cluster to change this.')).toBeTruthy();
	});

	it('keeps a save pending through the last restart, which central manager stamps before it finishes', async () => {
		put.mockResolvedValue({ data: { id: 'clu-1', recordLocks: true } });
		const { show } = setup(cluster());
		await confirm('Turn on');

		show(cluster({
			recordLocks: true,
			status: 'UPDATING',
			instances: [
				instance({ id: 'ins-1', recordLocks: true }),
				instance({ id: 'ins-2', recordLocks: true, status: 'UPDATING' }),
			],
		}));

		expect(screen.getByText('Turning record locks on')).toBeTruthy();
		expect(screen.getByText(/1 of 2 done/)).toBeTruthy();

		show(cluster({
			recordLocks: true,
			instances: [instance({ id: 'ins-1', recordLocks: true }), instance({ id: 'ins-2', recordLocks: true })],
		}));

		expect(screen.queryByText('Turning record locks on')).toBeNull();
		expect(screen.getByText('On')).toBeTruthy();
	});

	it('keeps a roll it watched applying through the last restart, with no save of its own', () => {
		const { show } = setup(cluster({
			recordLocks: true,
			status: 'UPDATING',
			instances: [instance({ id: 'ins-1', recordLocks: true }), instance({ id: 'ins-2', status: 'PENDING_UPGRADE' })],
		}));
		expect(screen.getByText('Turning record locks on')).toBeTruthy();

		show(cluster({
			recordLocks: true,
			status: 'UPDATING',
			instances: [
				instance({ id: 'ins-1', recordLocks: true }),
				instance({ id: 'ins-2', recordLocks: true, status: 'UPDATING' }),
			],
		}));

		expect(screen.getByText('Turning record locks on')).toBeTruthy();
		expect(screen.getByText(/1 of 2 done/)).toBeTruthy();

		show(cluster({
			recordLocks: true,
			instances: [instance({ id: 'ins-1', recordLocks: true }), instance({ id: 'ins-2', recordLocks: true })],
		}));

		expect(screen.queryByText('Turning record locks on')).toBeNull();
		expect(screen.getByText('On')).toBeTruthy();
	});

	it('does not call an update it never saw a record-locks roll in one', () => {
		setup(cluster({
			recordLocks: true,
			status: 'UPDATING',
			instances: [
				instance({ id: 'ins-1', recordLocks: true }),
				instance({ id: 'ins-2', recordLocks: true, status: 'UPDATING' }),
			],
		}));

		expect(screen.queryByText('Turning record locks on')).toBeNull();
		expect(screen.getByText('The cluster is updating. Record locks can change once it is running again.')).toBeTruthy();
	});

	it('keeps reading a cluster that is still updating, though every member already carries the setting', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const { show } = setup(cluster());
		show(cluster({
			recordLocks: true,
			status: 'UPDATING',
			instances: [
				instance({ id: 'ins-1', recordLocks: true }),
				instance({ id: 'ins-2', recordLocks: true, status: 'UPDATING' }),
			],
		}));
		get.mockClear();

		await act(async () => {
			vi.advanceTimersByTime(5_000);
		});

		expect(get).toHaveBeenCalledWith('/Cluster/clu-1');
	});

	it.each([
		['answered', (settle: Deferred) => settle.resolve({ data: { id: 'clu-1', recordLocks: true } })],
		['unanswered', (settle: Deferred) => settle.reject(gatewayTimeout())],
	])('picks up a save %s after the page was left and opened again', async (_, settleWith) => {
		const settle = deferred();
		put.mockReturnValue(settle.promise);
		const { remount } = setup(cluster());
		await confirm('Turn on');
		remount(cluster({ recordLocks: true }));
		expect(screen.getByText('Turning record locks on')).toBeTruthy();

		await act(async () => {
			settleWith(settle);
			await settle.promise.catch(() => {});
		});

		expect(await screen.findByText('Turning record locks on')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
	});

	it('follows a save recorded after it mounted, from wherever it was recorded', () => {
		setup(cluster({ recordLocks: true }));
		expect(screen.getByText("Record locks didn't finish turning on")).toBeTruthy();

		act(() => rememberSave('clu-1', true));

		expect(screen.getByText('Turning record locks on')).toBeTruthy();
	});

	it('keeps the switch off while a save sent before leaving the page is still out', async () => {
		put.mockReturnValue(new Promise(() => {}));
		const { remount } = setup(cluster());
		await confirm('Turn on');

		remount(cluster({ recordLocks: true }));

		expect(recordLocksSwitch().disabled).toBe(true);
		// the cluster already reads on and the members don't: a save still out, not a roll that stopped
		expect(screen.getByText('Turning record locks on')).toBeTruthy();
		expect(screen.queryByText(/didn't finish/)).toBeNull();
	});

	it('says nothing restarts on a cluster with no live instance', async () => {
		setup(cluster({ instances: [instance({ status: 'TERMINATED' })] }));
		await act(async () => {
			fireEvent.click(recordLocksSwitch());
		});

		const dialog = await screen.findByRole('alertdialog');

		expect(dialog.textContent).toContain('No instance is running in this cluster, so nothing restarts');
		expect(dialog.textContent).not.toContain('0 instances');
		expect(within(dialog).queryByRole('checkbox', { name: 'Immediate restart' })).toBeNull();

		put.mockReturnValue(new Promise(() => {}));
		await act(async () => {
			fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
		});

		expect(screen.getByText(/recording the setting for instances added later/)).toBeTruthy();
		expect(screen.queryByText(/restarting the instances/)).toBeNull();
	});

	describe('a roll that stopped part way', () => {
		const stoppedAt = (failed: Instance) =>
			cluster({ recordLocks: true, instances: [instance({ id: 'ins-1', recordLocks: true }), failed] });

		it('says so, and waits for the failed instance before offering to try again', () => {
			setup(stoppedAt(instance({ id: 'ins-2', name: 'edge-2', status: 'FAILED' })));

			expect(screen.getByText("Record locks didn't finish turning on")).toBeTruthy();
			expect(screen.getByText(/1 of 2 instances have record locks on/)).toBeTruthy();
			expect(screen.getByText(/edge-2 has failed/)).toBeTruthy();
			expect(screen.getByRole('link', { name: 'Contact us' })).toBeTruthy();
			expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Try again' }).disabled).toBe(true);
			expect(recordLocksSwitch().disabled).toBe(true);
		});

		it('re-sends the setting the cluster already has once every instance runs', async () => {
			put.mockReturnValue(new Promise(() => {}));
			setup(stoppedAt(instance({ id: 'ins-2' })));

			await act(async () => {
				fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
			});
			const dialog = await screen.findByRole('alertdialog');
			expect(dialog.textContent).toContain('Finish turning record locks on?');
			expect(dialog.textContent).toContain('restarts the instances that still need it one at a time');
			expect(put).not.toHaveBeenCalled();
			await act(async () => {
				fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
			});

			await waitFor(() => expect(put).toHaveBeenCalledWith('/Cluster/clu-1', { recordLocks: true }));
		});

		it('is reported at once when a member fails before any read shows the roll', async () => {
			put.mockResolvedValue({ data: { id: 'clu-1', recordLocks: true } });
			const { show } = setup(cluster());
			await confirm('Turn on');
			await screen.findByText('Turning record locks on');

			show(
				cluster({
					recordLocks: true,
					instances: [instance({ id: 'ins-1', status: 'FAILED' }), instance({ id: 'ins-2' })],
				}),
			);

			expect(screen.getByText("Record locks didn't finish turning on")).toBeTruthy();
			expect(screen.queryByText('Turning record locks on')).toBeNull();
		});

		it('keeps the save through leaving the page and coming back during the gap', async () => {
			put.mockResolvedValue({ data: { id: 'clu-1', recordLocks: true } });
			const { remount } = setup(cluster());
			await confirm('Turn on');
			await screen.findByText('Turning record locks on');

			remount(cluster({ recordLocks: true }));

			expect(screen.getByText('Turning record locks on')).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
		});

		it('does not fall back to the cluster from before the save when every read after it fails', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			put.mockResolvedValue({ data: { id: 'clu-1', recordLocks: true } });
			const { show } = setup(cluster());
			await confirm('Turn on');
			await screen.findByText('Turning record locks on');

			await act(async () => {
				vi.advanceTimersByTime(ROLL_START_GRACE_MS);
			});

			expect(screen.getByText('Turning record locks on')).toBeTruthy();
			expect(within(recordLocksSwitch().closest('div')!).queryByText('Off')).toBeNull();

			show(cluster({ recordLocks: true }));

			expect(screen.getByText("Record locks didn't finish turning on")).toBeTruthy();
		});

		it('does not let a read answered before the save end the wait', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			put.mockResolvedValue({ data: { id: 'clu-1', recordLocks: true } });
			const { show } = setup(cluster());
			await confirm('Turn on');
			await act(async () => {
				vi.advanceTimersByTime(ROLL_START_GRACE_MS);
			});

			// landed after the save, but was requested before it
			show(cluster(), { requestedAt: 0 });

			expect(screen.getByText('Turning record locks on')).toBeTruthy();
		});

		it('lets go of a save once a fresh read shows the setting changed back since', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			rememberSave('clu-1', true);
			// the roll finished and someone turned record locks off again while this page was away
			const { show } = setup(cluster());
			expect(screen.getByText('Turning record locks on')).toBeTruthy();

			await act(async () => {
				vi.advanceTimersByTime(ROLL_START_GRACE_MS);
			});
			show(cluster());

			expect(screen.queryByText('Turning record locks on')).toBeNull();
			expect(recordLocksSwitch().disabled).toBe(false);
		});

		it('keeps reading the cluster, so a recovered instance unlocks Try again', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			const { show } = setup(cluster());
			show(stoppedAt(instance({ id: 'ins-2', status: 'FAILED' })));
			get.mockClear();

			await act(async () => {
				vi.advanceTimersByTime(15_000);
			});

			expect(get).toHaveBeenCalledWith('/Cluster/clu-1');
		});

		it('is reported once the roll never shows up after a save', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			put.mockResolvedValue({ data: { id: 'clu-1', recordLocks: true } });
			const { show } = setup(cluster());
			await confirm('Turn on');
			await screen.findByText('Turning record locks on');
			show(cluster({ recordLocks: true }));

			await act(async () => {
				vi.advanceTimersByTime(ROLL_START_GRACE_MS);
			});

			expect(screen.getByText("Record locks didn't finish turning on")).toBeTruthy();
		});
	});
});

describe('RecordLocksPage', () => {
	it("starts fresh on another cluster's page, as the route component is reused", () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		queryClient.setQueryData(['clu-1'], cluster());
		queryClient.setQueryData(['clu-2'], cluster({ id: 'clu-2' }));
		rememberSave('clu-1', true);
		const ui = () => (
			<QueryClientProvider client={queryClient}>
				<RecordLocksPage />
			</QueryClientProvider>
		);
		const { rerender } = render(ui());
		expect(screen.getByText('Turning record locks on')).toBeTruthy();

		params.clusterId = 'clu-2';
		rerender(ui());

		expect(screen.queryByText('Turning record locks on')).toBeNull();
		expect(recordLocksSwitch().getAttribute('aria-checked')).toBe('false');
		params.clusterId = 'clu-1';
	});
});
