/**
 * @vitest-environment jsdom
 */
import { ConfigBackupsIndex } from '@/features/instance/config/backups';
import { Instance } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (body: Record<string, unknown>) => unknown;

interface FakeNode {
	post: ReturnType<typeof vi.fn>;
	bodies: () => Array<Record<string, unknown>>;
}

const { state, nodes } = vi.hoisted(() => ({
	state: {
		local: false,
		params: { organizationId: 'org-1', clusterId: 'clu-1' } as Record<string, string | undefined>,
		canManage: true,
		signedIn: true,
		canUpdateCluster: true,
		version: '5.3.4',
		cluster: undefined as unknown,
		databases: { data: {}, analytics: {} } as Record<string, unknown>,
		handlers: {} as Record<string, Handler>,
	},
	nodes: new Map<string, FakeNode>(),
}));

function fakeNode(id: string): FakeNode {
	const existing = nodes.get(id);
	if (existing) {
		return existing;
	}
	const post = vi.fn(async (_url: string, body: Record<string, unknown>) => {
		if (body.operation === 'registration_info') {
			return { data: { version: state.version } };
		}
		if (body.operation === 'describe_all') {
			return { data: state.databases };
		}
		const handler = state.handlers[`${id}:${body.operation}`] ?? state.handlers[String(body.operation)];
		if (!handler) {
			throw new Error(`${id} got an unexpected ${String(body.operation)}`);
		}
		return { data: await handler(body) };
	});
	const node = { post, bodies: () => post.mock.calls.map((call) => call[1] as Record<string, unknown>) };
	nodes.set(id, node);
	return node;
}

vi.mock('@/config/constants', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/config/constants')>()),
	get isLocalStudio() {
		return state.local;
	},
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	useParams: () => state.params,
}));
vi.mock('@/config/useInstanceClient', () => {
	const pageEntity = () => state.local ? 'local' : state.params.instanceId ?? state.params.clusterId!;
	return {
		useInstanceClientIdParams: () => {
			const entityId = pageEntity();
			return {
				instanceClient: fakeNode(entityId),
				entityId,
				entityType: state.params.instanceId ? 'instance' : 'cluster',
			};
		},
		getInstanceClientIdFromParams: (
			{ instanceId, forceFabricConnect }: { instanceId: string; forceFabricConnect?: boolean },
		) => {
			// Every cluster member must be reached on its own, through Fabric: the cluster's address reaches whichever runs first.
			if (!forceFabricConnect) {
				throw new Error('a cluster member was reached without pinning the request to it');
			}
			return { instanceClient: fakeNode(instanceId), entityId: instanceId, entityType: 'instance' };
		},
	};
});
vi.mock('@/features/cluster/queries/getClusterInfoQuery', async () => {
	const { queryOptions } = await import('@tanstack/react-query');
	return {
		getClusterInfoQueryOptions: (clusterId?: string | false) =>
			queryOptions({ queryKey: [clusterId], queryFn: async () => state.cluster, enabled: !!clusterId }),
	};
});
vi.mock('@/hooks/usePermissions', () => ({
	useInstanceManagePermission: () => state.canManage,
	useOrganizationClusterInstancePermissions: () => ({ update: state.canUpdateCluster }),
}));
vi.mock(
	'@/hooks/useAuth',
	() => ({ useInstanceAuth: () => ({ user: state.signedIn ? { username: 'admin' } : null }) }),
);
vi.mock('@/integrations/api/instance/database/getJob', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/database/getJob')>()),
	// Short enough that one poll interval (1.5 s) outlasts it.
	JOB_NOT_FOUND_GRACE_MS: 1_000,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

beforeAll(() => {
	// Radix dialogs rely on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

function member(id: string, name: string, overrides: Partial<Instance> = {}): Instance {
	return {
		id,
		name,
		clusterId: 'clu-1',
		instanceFqdn: `${name}.example.harper.fast`,
		operationsApiPort: 9925,
		operationsApiSecure: true,
		status: 'RUNNING',
		version: '5.3.4',
		...overrides,
	} as Instance;
}

function harperRefusal(message: string, status = 400) {
	return new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
		status,
		statusText: '',
		headers: {},
		config: { headers: new AxiosHeaders() },
		data: { error: message },
	});
}

let queryClient: QueryClient;

function renderPage() {
	return render(
		<QueryClientProvider client={queryClient}>
			<ConfigBackupsIndex />
		</QueryClientProvider>,
	);
}

function nodeCard(name: string) {
	return within(screen.getByRole('region', { name: `Backups on ${name}` }));
}

beforeEach(() => {
	queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	nodes.clear();
	state.local = false;
	state.params = { organizationId: 'org-1', clusterId: 'clu-1' };
	state.canManage = true;
	state.signedIn = true;
	state.canUpdateCluster = true;
	state.version = '5.3.4';
	state.databases = { data: {}, analytics: {} };
	state.cluster = { id: 'clu-1', instances: [member('ins-a', 'alpha'), member('ins-b', 'beta')] };
	state.handlers = {
		'ins-a:list_backups': () => [{ backup_id: 1, timestamp: 1_700_000_000, size: 1024, file_count: 3, blobs: true }],
		'ins-b:list_backups': () => [],
	};
});

afterEach(() => {
	cleanup();
	queryClient.clear();
	vi.clearAllMocks();
});

describe('ConfigBackupsIndex on a cluster', () => {
	it("lists each node's backups from that node, never through the cluster's own address", async () => {
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		expect(nodeCard('beta').getByText("No backups of 'analytics' on this node yet.")).toBeTruthy();

		expect(nodes.get('ins-a')!.bodies()).toEqual([{ operation: 'list_backups', database: 'analytics' }]);
		expect(nodes.get('ins-b')!.bodies()).toEqual([{ operation: 'list_backups', database: 'analytics' }]);
		expect(nodes.get('clu-1')!.bodies().map((body) => body.operation)).not.toContain('list_backups');
	});

	it('asks again for the database the user picks', async () => {
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		fireEvent.change(screen.getByRole('combobox', { name: 'Database' }), { target: { value: 'data' } });
		await waitFor(() =>
			expect(nodes.get('ins-a')!.bodies()).toContainEqual({ operation: 'list_backups', database: 'data' })
		);
	});

	it("shows Harper's own refusal beside the node it came from", async () => {
		state.handlers['ins-b:list_backups'] = () => {
			throw harperRefusal(
				"Operation 'list_backups' requires a RocksDB database; 'analytics' uses the LMDB storage engine",
			);
		};
		renderPage();
		await waitFor(() =>
			expect(nodeCard('beta').getByRole('alert').textContent).toMatch(/uses the LMDB storage engine/)
		);
		expect(nodeCard('alpha').queryByRole('alert')).toBeNull();
	});

	it('says why a node that is not running is not listed, and never asks it', async () => {
		state.cluster = {
			id: 'clu-1',
			instances: [member('ins-a', 'alpha'), member('ins-b', 'beta', { status: 'STOPPED' })],
		};
		renderPage();
		await waitFor(() => expect(nodeCard('beta').getByText(/isn't running/)).toBeTruthy());
		expect(nodes.get('ins-b')?.post).not.toHaveBeenCalled();
	});

	it('explains, rather than failing every request, when the user cannot update the cluster in Fabric', async () => {
		state.canUpdateCluster = false;
		renderPage();
		await waitFor(() => expect(screen.getByText(/needs permission to update this cluster/)).toBeTruthy());
		expect(nodes.has('ins-a')).toBe(false);
	});

	it('sends a self-hosted cluster to each instance page, since Fabric cannot reach one of its nodes', async () => {
		state.cluster = { id: 'clu-1', plans: [{ planId: 'self-hosted-basic' }], instances: [member('ins-a', 'alpha')] };
		renderPage();
		await waitFor(() => expect(screen.getByText(/only from that node's own page/)).toBeTruthy());
		expect(nodes.has('ins-a')).toBe(false);
		// Fabric can't move a self-hosted node, so the page doesn't say it might.
		expect(screen.queryByText(/Fabric deletes/)).toBeNull();
	});

	it('takes a backup on the chosen node and follows its job there until it finishes', async () => {
		let jobReads = 0;
		state.handlers['ins-a:create_backup'] = () => ({ message: 'Starting job with id job-1', job_id: 'job-1' });
		state.handlers['ins-a:get_job'] = () => {
			jobReads += 1;
			return jobReads === 1
				? [{ id: 'job-1', status: 'IN_PROGRESS' }]
				: [{ id: 'job-1', status: 'COMPLETE', result: { database: 'analytics', backup_id: 2 } }];
		};
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());

		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Take backup' }));
		fireEvent.click(screen.getByRole('checkbox', { name: /Leave out file attachments/ }));
		fireEvent.click(screen.getByRole('button', { name: 'Take backup' }));

		await waitFor(() => expect(nodeCard('alpha').getByText(/Backing up 'analytics'… started/)).toBeTruthy());
		expect(nodes.get('ins-a')!.bodies()).toContainEqual({
			operation: 'create_backup',
			database: 'analytics',
			exclude_blobs: true,
		});
		// While it runs, a second write would only be refused by Harper's lock.
		expect((nodeCard('alpha').getByRole('button', { name: 'Take backup' }) as HTMLButtonElement).disabled).toBe(true);

		await waitFor(() => expect(nodeCard('alpha').getByText("Backed up 'analytics' as backup 2.")).toBeTruthy(), {
			timeout: 4_000,
		});
		expect(toast.success).toHaveBeenCalledWith("Backed up 'analytics' on alpha as backup 2");
		// The job is only in that node's hdb_job, so only that node is asked about it.
		expect(nodes.get('ins-b')!.bodies().map((body) => body.operation)).not.toContain('get_job');
		await waitFor(() =>
			expect(nodes.get('ins-a')!.bodies().filter((body) => body.operation === 'list_backups')).toHaveLength(2)
		);
		expect((nodeCard('alpha').getByRole('button', { name: 'Take backup' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it("shows Harper's reason when a backup job fails", async () => {
		state.handlers['ins-a:create_backup'] = () => ({ job_id: 'job-9' });
		state.handlers['ins-a:get_job'] = () => [
			{ id: 'job-9', status: 'ERROR', message: "Backup operation already in progress for database 'analytics'" },
		];
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Take backup' }));
		fireEvent.click(screen.getByRole('button', { name: 'Take backup' }));
		await waitFor(() =>
			expect(
				nodeCard('alpha').getByText(
					"Backing up 'analytics' failed: Backup operation already in progress for database 'analytics'",
				),
			).toBeTruthy()
		);
	});

	it('verifies one backup and marks the row with the result', async () => {
		state.handlers['ins-a:verify_backup'] = () => ({ job_id: 'job-v' });
		state.handlers['ins-a:get_job'] = () => [{ id: 'job-v', status: 'COMPLETE', result: { ok: true } }];
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		const row = within(nodeCard('alpha').getByRole('row', { name: 'Backup 1' }));
		fireEvent.click(row.getByRole('button', { name: 'Verify' }));
		fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

		await waitFor(() => expect(row.getByText('Verified')).toBeTruthy());
		expect(nodes.get('ins-a')!.bodies()).toContainEqual({
			operation: 'verify_backup',
			database: 'analytics',
			backup_id: 1,
			verify_checksum: true,
		});
		expect(nodeCard('alpha').getByText("Backup 1 of 'analytics' verified, checksums included.")).toBeTruthy();
	});

	it('never carries a verify result over to a new backup that reuses the id', async () => {
		let backups = [{ backup_id: 1, timestamp: 1_700_000_000 }];
		state.handlers['ins-a:list_backups'] = () => backups;
		state.handlers['ins-a:verify_backup'] = () => ({ job_id: 'job-v' });
		state.handlers['ins-a:get_job'] = () => [{ id: 'job-v', status: 'COMPLETE', result: { ok: true } }];
		state.handlers['ins-a:delete_backup'] = () => {
			// Harper starts the ids over once the last backup is gone, so the next one is backup 1 again.
			backups = [{ backup_id: 1, timestamp: 1_700_000_900 }];
			return { ok: true };
		};
		renderPage();
		const row = () => within(nodeCard('alpha').getByRole('row', { name: 'Backup 1' }));
		await waitFor(() => expect(row()).toBeTruthy());
		fireEvent.click(row().getByRole('button', { name: 'Verify' }));
		fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
		await waitFor(() => expect(row().getByText('Verified')).toBeTruthy());

		fireEvent.click(row().getByRole('button', { name: 'Delete' }));
		fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Delete/ }));
		await waitFor(() => expect(row().getByText(new Date(1_700_000_900_000).toLocaleString())).toBeTruthy());
		expect(row().queryByText('Verified')).toBeNull();
	});

	it('deletes nothing when the confirmed id has come to name a newer backup', async () => {
		let backups = [{ backup_id: 1, timestamp: 1_700_000_000 }];
		state.handlers['ins-a:list_backups'] = () => backups;
		state.handlers['ins-a:delete_backup'] = () => ({ ok: true });
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		fireEvent.click(
			within(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).getByRole('button', { name: 'Delete' }),
		);

		backups = [{ backup_id: 1, timestamp: 1_700_000_900 }];
		fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Delete/ }));

		await waitFor(() =>
			expect(
				within(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).getByText(
					new Date(1_700_000_900_000).toLocaleString(),
				),
			).toBeTruthy()
		);
		expect(nodes.get('ins-a')!.bodies().map((body) => body.operation)).not.toContain('delete_backup');
	});

	it('keeps following a job that reads as missing once, then turns up', async () => {
		let reads = 0;
		state.handlers['ins-a:create_backup'] = () => ({ job_id: 'job-late' });
		state.handlers['ins-a:get_job'] = () => {
			reads += 1;
			return reads === 1 ? [] : [{ id: 'job-late', status: 'IN_PROGRESS' }];
		};
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Take backup' }));
		fireEvent.click(screen.getByRole('button', { name: 'Take backup' }));
		await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2), { timeout: 4_000 });
		await act(async () => {});
		expect(nodeCard('alpha').queryByText(/can't find job/)).toBeNull();
		expect(nodeCard('alpha').getByText(/Backing up 'analytics'… started/)).toBeTruthy();
	});

	it('closes a dialog when the page moves to another database under it', async () => {
		state.handlers['ins-a:list_backups'] = () => [2, 1].map((backup_id) => ({ backup_id }));
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 2' })).toBeTruthy());
		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Keep newest…' }));
		expect(screen.getByRole('alertdialog')).toBeTruthy();

		fireEvent.change(screen.getByRole('combobox', { name: 'Database', hidden: true }), { target: { value: 'data' } });
		await waitFor(() =>
			expect(nodes.get('ins-a')!.bodies()).toContainEqual({ operation: 'list_backups', database: 'data' })
		);
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 2', hidden: true })).toBeTruthy());
		expect(screen.queryByRole('alertdialog')).toBeNull();

		fireEvent.change(screen.getByRole('combobox', { name: 'Database' }), { target: { value: 'analytics' } });
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 2' })).toBeTruthy());
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(nodes.get('ins-a')!.bodies().map((body) => body.operation)).not.toContain('purge_backups');
	});

	it('never states a purge count Harper did not send', async () => {
		state.handlers['ins-a:list_backups'] = () => [2, 1].map((backup_id) => ({ backup_id }));
		state.handlers['ins-a:purge_backups'] = () => ({ ok: true });
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 2' })).toBeTruthy());
		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Keep newest…' }));
		const dialog = within(screen.getByRole('alertdialog'));
		fireEvent.change(dialog.getByLabelText('Backups to keep'), { target: { value: '1' } });
		fireEvent.click(dialog.getByRole('button', { name: 'Delete 1 backup' }));
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Kept the newest 1 of 'analytics' on alpha", {
				description: expect.stringMatching(/didn't say how many/),
			})
		);
	});

	it('stops following a job Studio is no longer allowed to read, and frees the node', async () => {
		state.handlers['ins-a:create_backup'] = () => ({ job_id: 'job-x' });
		state.handlers['ins-a:get_job'] = () => {
			throw harperRefusal('Forbidden', 403);
		};
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Take backup' }));
		fireEvent.click(screen.getByRole('button', { name: 'Take backup' }));

		await waitFor(() => expect(nodeCard('alpha').getByText(/no longer allowed to read job job-x/)).toBeTruthy());
		expect(nodeCard('alpha').queryByText(/keeps trying/)).toBeNull();
		expect((nodeCard('alpha').getByRole('button', { name: 'Take backup' }) as HTMLButtonElement).disabled).toBe(false);
		expect(nodeCard('alpha').getByRole('button', { name: 'Dismiss' })).toBeTruthy();
	});

	it('holds Verify while a backup of the same database is being taken', async () => {
		state.handlers['ins-a:create_backup'] = () => ({ job_id: 'job-c' });
		state.handlers['ins-a:get_job'] = () => [{ id: 'job-c', status: 'IN_PROGRESS' }];
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Take backup' }));
		fireEvent.click(screen.getByRole('button', { name: 'Take backup' }));
		await waitFor(() => expect(nodeCard('alpha').getByText(/Backing up 'analytics'… started/)).toBeTruthy());
		const verify = within(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).getByRole('button', {
			name: 'Verify',
		}) as HTMLButtonElement;
		expect(verify.disabled).toBe(true);
	});

	it('reads the list again when Harper refuses to verify a backup that is gone', async () => {
		let backups = [{ backup_id: 1 }];
		state.handlers['ins-a:list_backups'] = () => backups;
		state.handlers['ins-a:verify_backup'] = () => {
			throw harperRefusal("Backup 1 not found for database 'analytics'", 404);
		};
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		backups = [];
		fireEvent.click(
			within(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).getByRole('button', { name: 'Verify' }),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
		await waitFor(() => expect(nodeCard('alpha').queryByRole('row', { name: 'Backup 1' })).toBeNull());
	});

	it('deletes a backup only once the deletion is confirmed', async () => {
		state.handlers['ins-a:delete_backup'] = () => ({ ok: true });
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		fireEvent.click(
			within(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).getByRole('button', { name: 'Delete' }),
		);

		const dialog = within(screen.getByRole('dialog'));
		expect(dialog.getByText("1 of 'analytics' on alpha")).toBeTruthy();
		expect(nodes.get('ins-a')!.bodies().map((body) => body.operation)).not.toContain('delete_backup');
		fireEvent.click(dialog.getByRole('button', { name: /Delete/ }));

		await waitFor(() =>
			expect(nodes.get('ins-a')!.bodies()).toContainEqual({
				operation: 'delete_backup',
				database: 'analytics',
				backup_id: 1,
			})
		);
		await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Deleted backup 1 of 'analytics' from alpha"));
	});

	it('names how many backups a purge deletes before it runs, and reports what Harper removed', async () => {
		state.handlers['ins-a:list_backups'] = () =>
			[4, 3, 2, 1].map((backup_id) => ({ backup_id, timestamp: 1_700_000_000 + backup_id, size: 10, blobs: true }));
		state.handlers['ins-a:purge_backups'] = () => ({ deleted: 3, remaining: 1 });
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 4' })).toBeTruthy());
		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Keep newest…' }));

		const dialog = within(screen.getByRole('alertdialog'));
		const confirm = () => dialog.getByRole('button', { name: /^Delete/ }) as HTMLButtonElement;
		expect(confirm().disabled).toBe(true);
		fireEvent.change(dialog.getByLabelText('Backups to keep'), { target: { value: '4' } });
		expect(dialog.getByText('Nothing to delete: there are only 4.')).toBeTruthy();
		expect(confirm().disabled).toBe(true);
		fireEvent.change(dialog.getByLabelText('Backups to keep'), { target: { value: '0' } });
		expect(dialog.getByText('Use a whole number of at least 1.')).toBeTruthy();
		fireEvent.change(dialog.getByLabelText('Backups to keep'), { target: { value: '1' } });
		expect(dialog.getByText("Deletes 3 backups (1, 2 and 3) and keeps the newest one. This can't be undone."))
			.toBeTruthy();
		fireEvent.click(dialog.getByRole('button', { name: 'Delete 3 backups' }));

		await waitFor(() =>
			expect(nodes.get('ins-a')!.bodies()).toContainEqual({
				operation: 'purge_backups',
				database: 'analytics',
				keep_count: 1,
			})
		);
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Deleted 3 backups of 'analytics' from alpha", undefined)
		);
	});

	it('says so when Harper removed a different number than the confirmation named', async () => {
		state.handlers['ins-a:list_backups'] = () => [2, 1].map((backup_id) => ({ backup_id }));
		state.handlers['ins-a:purge_backups'] = () => ({ deleted: 2, remaining: 1 });
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 2' })).toBeTruthy());
		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Keep newest…' }));
		const dialog = within(screen.getByRole('alertdialog'));
		fireEvent.change(dialog.getByLabelText('Backups to keep'), { target: { value: '1' } });
		expect(dialog.getByText("Deletes backup 1 and keeps the newest one. This can't be undone.")).toBeTruthy();
		fireEvent.click(dialog.getByRole('button', { name: 'Delete 1 backup' }));
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Deleted 2 backups of 'analytics' from alpha", {
				description: expect.stringMatching(/not the 1 this page expected/),
			})
		);
	});

	it('drops a dialog meant for one cluster when the page switches to another', async () => {
		const { rerender } = renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		fireEvent.click(nodeCard('alpha').getByRole('button', { name: 'Take backup' }));
		expect(screen.getByRole('alertdialog')).toBeTruthy();

		state.params = { organizationId: 'org-1', clusterId: 'clu-2' };
		await act(async () => {
			rerender(
				<QueryClientProvider client={queryClient}>
					<ConfigBackupsIndex />
				</QueryClientProvider>,
			);
		});
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});
});

describe('ConfigBackupsIndex gates', () => {
	it('never asks for backups as a user who is not a super user', async () => {
		state.canManage = false;
		renderPage();
		expect(screen.getByText('Only super users can view or manage backups.')).toBeTruthy();
		await act(async () => {});
		expect(nodes.has('ins-a')).toBe(false);
	});

	it('waits for sign-in to resolve instead of flashing the denial at a super user', () => {
		state.canManage = false;
		state.signedIn = false;
		renderPage();
		expect(screen.queryByText(/Only super users/)).toBeNull();
	});

	it('says which Harper version backups need when no node of the cluster runs it', async () => {
		state.version = '5.1.4';
		state.cluster = {
			id: 'clu-1',
			instances: [member('ins-a', 'alpha', { version: '5.1.4' }), member('ins-b', 'beta', { version: '5.1.4' })],
		};
		renderPage();
		await waitFor(() =>
			expect(screen.getByText(/Backups need Harper 5.2.0 or later.\s+None of this cluster's nodes runs it yet./))
				.toBeTruthy()
		);
		expect(nodes.has('ins-a')).toBe(false);
	});

	it('says the version could not be read rather than naming an empty one', async () => {
		state.params = { organizationId: 'org-1', clusterId: 'clu-1', instanceId: 'ins-b' };
		state.version = '';
		renderPage();
		await waitFor(() =>
			expect(screen.getByText("This Harper's version could not be read, so its backups are not shown.")).toBeTruthy()
		);
		expect(screen.queryByText(/runs/)).toBeNull();
	});

	it('shows a partly upgraded cluster, even when an old node answers for it', async () => {
		state.version = '5.1.4';
		state.cluster = {
			id: 'clu-1',
			instances: [member('ins-a', 'alpha'), member('ins-b', 'beta', { version: '5.1.4' })],
		};
		renderPage();
		await waitFor(() => expect(nodeCard('alpha').getByRole('row', { name: 'Backup 1' })).toBeTruthy());
		expect(nodeCard('beta').getByText('This node runs Harper 5.1.4. Backups need Harper 5.2.0 or later.')).toBeTruthy();
		expect(nodes.get('ins-b')?.post).not.toHaveBeenCalled();
	});
});

describe('ConfigBackupsIndex on one instance', () => {
	it("uses the page's own connection, which already reaches only that instance", async () => {
		state.params = { organizationId: 'org-1', clusterId: 'clu-1', instanceId: 'ins-b' };
		state.handlers['ins-b:list_backups'] = () => [{ backup_id: 6 }];
		renderPage();
		await waitFor(() => expect(nodeCard('beta').getByRole('row', { name: 'Backup 6' })).toBeTruthy());
		expect(nodes.has('ins-a')).toBe(false);
	});

	it('names the node "This instance" in the Studio a Harper serves', async () => {
		state.local = true;
		state.params = {};
		state.handlers['local:list_backups'] = () => [];
		renderPage();
		await waitFor(() => expect(nodeCard('This instance').getByText(/No backups/)).toBeTruthy());
		expect(screen.getByText("They don't protect against losing that node's disk.")).toBeTruthy();
		fireEvent.click(nodeCard('This instance').getByRole('button', { name: 'Take backup' }));
		expect(screen.getByRole('heading', { name: "Back up 'analytics' on this instance?" })).toBeTruthy();
	});
});
