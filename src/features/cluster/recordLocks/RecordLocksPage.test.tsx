/** @vitest-environment jsdom */
import { Cluster, Instance } from '@/integrations/api/api.patch';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, put, post: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
		<a href={to} className={className}>{children}</a>
	),
}));

import { mutationErrorHandler } from '@/react-query/queryClient';
import { RecordLocksSettings, ROLL_START_GRACE_MS } from './RecordLocksPage';

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
	return { ...view, show: (c: Cluster) => view.rerender(ui(c)) };
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
