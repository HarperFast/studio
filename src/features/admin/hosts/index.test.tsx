/**
 * @vitest-environment jsdom
 */
import { apiClient } from '@/config/apiClient';
import {
	describeUnresolvedOrganization,
	formatCpu,
	formatUsage,
	hostMatchesSearch,
	HostsIndex,
	resolveOrganization,
} from '@/features/admin/hosts/index';
import type { AdminHost } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn() } }));
const mockedGet = vi.mocked(apiClient.get);

const auth = vi.hoisted(() => ({ canReadOrganizations: true }));
vi.mock('@/hooks/useAuth', () => ({
	useStaffPermission: (permission: string) => permission !== 'org:read' || auth.canReadOrganizations,
}));

function host(overrides: Partial<AdminHost>): AdminHost {
	return {
		id: 'h-1',
		name: 'host-1',
		status: 'RUNNING',
		fqdn: null,
		ipAddress: null,
		cloudInstanceType: null,
		cloudInstanceId: null,
		locationId: 'linode-us-ord',
		location: 'us-ord',
		locationName: 'Chicago, Illinois, USA',
		cloudProvider: 'linode',
		regions: ['US'],
		organizationIds: null,
		dynamicallyAssignable: null,
		underMaintenance: null,
		gpu: null,
		gpuType: null,
		gpuCount: null,
		embedHub: null,
		canaryHost: null,
		maxCPUCores: 8,
		maxMemoryMb: 16384,
		maxStorageGb: 100,
		usedCPUCores: 2,
		usedMemoryMb: 4096,
		usedStorageGb: 25,
		instanceCount: 0,
		organizations: [],
		createdAt: null,
		updated: null,
		terminatedAt: null,
		...overrides,
	};
}

const ORGS = [{ id: 'org-1', name: 'Acme' }, { id: 'org-2', name: 'Globex' }, { id: 'org-3', name: 'Acme' }];
const HOSTS = [
	host({
		id: 'h-shared',
		name: 'shared-1',
		ipAddress: '10.0.0.7',
		instanceCount: 3,
		organizations: [{ id: 'org-1', instanceCount: 3 }],
	}),
	host({
		id: 'h-dedicated',
		name: 'dedicated-1',
		organizationIds: ['org-2'],
		gpu: true,
		gpuCount: 1,
		gpuType: 'nvidia-l4',
	}),
];

const requests = (prefix: string) =>
	mockedGet.mock.calls.map(([url]) => url as string).filter((url) => url.startsWith(prefix));
const hostRequests = () => requests('/Admin/Host/');

let failHosts = false;
let organizationsResponse: () => Promise<unknown>;

beforeEach(() => {
	auth.canReadOrganizations = true;
	failHosts = false;
	organizationsResponse = async () => ({ data: ORGS });
	mockedGet.mockReset();
	mockedGet.mockImplementation(async (url) => {
		const path = url as string;
		if (path.startsWith('/Admin/Organization/')) { return organizationsResponse() as never; }
		if (path.startsWith('/Location/')) { return { data: [] } as never; }
		if (failHosts) { throw new Error('boom'); }
		return { data: HOSTS } as never;
	});
});
afterEach(cleanup);

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<HostsIndex />
		</QueryClientProvider>,
	);
}

describe('HostsIndex', () => {
	it('asks for RUNNING hosts by default', async () => {
		renderPage();
		await screen.findByText('shared-1');
		expect(hostRequests()).toEqual(['/Admin/Host/?status=RUNNING']);
	});

	it('lists only the organizations a host is dedicated to, by name', async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText('org-2 (Globex)')).toBeTruthy());
		expect(screen.getByText('Shared')).toBeTruthy();
		// org-1 only has instances on the shared host.
		expect(screen.queryByText('org-1 (Acme)')).toBeNull();
		expect(screen.getByText('GPU 1× nvidia-l4')).toBeTruthy();
	});

	it("opens a host's details from its row, with the organizations that have instances on it", async () => {
		renderPage();
		await screen.findByText('shared-1');
		expect(screen.queryByRole('dialog')).toBeNull();
		await act(async () => {
			fireEvent.click(screen.getByText('h-shared'));
		});
		const panel = screen.getByRole('dialog');
		expect(await within(panel).findByText('org-1 (Acme)')).toBeTruthy();
		expect(within(panel).getByText('3 instances')).toBeTruthy();
		expect(within(panel).getByText('10.0.0.7')).toBeTruthy();
	});

	it('opens the details from the host name for keyboard users', async () => {
		renderPage();
		await act(async () => {
			fireEvent.click(await screen.findByRole('button', { name: 'dedicated-1' }));
		});
		expect(within(screen.getByRole('dialog')).getByText('None.')).toBeTruthy();
	});

	it('shows the location code and provider, and a host id only when it differs from the name', async () => {
		mockedGet.mockImplementation(async (url) => {
			const path = url as string;
			if (path.startsWith('/Admin/Organization/')) { return { data: ORGS } as never; }
			if (path.startsWith('/Location/')) { return { data: [] } as never; }
			return { data: [...HOSTS, host({ id: 'hos-same', name: 'hos-same', fqdn: 'hos-same.example.com' })] } as never;
		});
		renderPage();
		await screen.findByText('shared-1');
		expect(screen.getAllByText('us-ord · linode')).toHaveLength(3);
		expect(screen.queryByText('Chicago, Illinois, USA')).toBeNull();
		expect(screen.getByText('h-shared')).toBeTruthy();
		expect(screen.getAllByText('hos-same')).toHaveLength(1);
		expect(screen.getByText('hos-same.example.com')).toBeTruthy();
	});

	it('narrows the rows client-side without another request', async () => {
		renderPage();
		await screen.findByText('shared-1');
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Search hosts'), { target: { value: '10.0.0.7' } });
		});
		expect(screen.queryByText('dedicated-1')).toBeNull();
		expect(screen.getByText('1 of 2 hosts')).toBeTruthy();
		expect(hostRequests()).toHaveLength(1);
	});

	it('sends the picked organization to the server', async () => {
		renderPage();
		await screen.findByText('shared-1');
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'org-1 (Acme)' } });
		});
		await waitFor(() => expect(hostRequests()).toContain('/Admin/Host/?status=RUNNING&organizationId=org-1'));
	});

	async function typeOrganization(value: string) {
		await screen.findByText('shared-1');
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Organization'), { target: { value } });
		});
	}

	it('never sends text that names no organization', async () => {
		renderPage();
		await typeOrganization('Ac');
		expect(await screen.findByText('No organization matches “Ac”.')).toBeTruthy();
		expect(hostRequests()).toEqual(['/Admin/Host/?status=RUNNING']);
	});

	it('asks which organization when a name is shared', async () => {
		renderPage();
		await typeOrganization('acme');
		expect(await screen.findByText('2 organizations are named “acme” — pick one from the list.')).toBeTruthy();
		expect(hostRequests()).toEqual(['/Admin/Host/?status=RUNNING']);
	});

	it('skips the directory without org:read but still accepts a pasted id', async () => {
		auth.canReadOrganizations = false;
		renderPage();
		await typeOrganization('org-2');
		await waitFor(() => expect(hostRequests()).toContain('/Admin/Host/?status=RUNNING&organizationId=org-2'));
		expect(requests('/Admin/Organization/')).toEqual([]);

		await act(async () => {
			fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'Globex' } });
		});
		expect(await screen.findByText('Enter an organization id (org-…).')).toBeTruthy();
	});

	// A name the directory hasn't listed yet is not a name that matches nothing.
	it('says the organization list is loading rather than that nothing matches', async () => {
		organizationsResponse = () => new Promise(() => {});
		renderPage();
		await typeOrganization('Globex');
		expect(await screen.findByText('The organization list is still loading. Paste an org- id to filter now.'))
			.toBeTruthy();
		expect(screen.queryByText(/No organization matches/)).toBeNull();
		expect(hostRequests()).toEqual(['/Admin/Host/?status=RUNNING']);

		await act(async () => {
			fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'org-2' } });
		});
		await waitFor(() => expect(hostRequests()).toContain('/Admin/Host/?status=RUNNING&organizationId=org-2'));
	});

	it('says the organization list failed when it cannot load', async () => {
		organizationsResponse = async () => {
			throw new Error('boom');
		};
		renderPage();
		await typeOrganization('Globex');
		expect(await screen.findByText("Couldn't load the organization list. Paste an org- id to filter.")).toBeTruthy();
	});

	it('says so when the host list fails to load', async () => {
		failHosts = true;
		renderPage();
		expect(await screen.findByText("Couldn't load hosts.")).toBeTruthy();
	});
});

describe('formatCpu / formatUsage', () => {
	it('shows sampled CPU as a share of the host cores', () => {
		expect(formatCpu(2, 8)).toBe('25% of 8 cores');
		expect(formatCpu(0.1, 4)).toBe('3% of 4 cores');
		expect(formatCpu(null, 4)).toBe('? of 4 cores');
		expect(formatCpu(1, null)).toBe('—');
	});

	it('treats the -1 a host leaves for an unreported value as unknown', () => {
		expect(formatCpu(-1, 4)).toBe('? of 4 cores');
		expect(formatUsage(-1, 16384, 1024)).toBe('? / 16');
		expect(formatUsage(8499.2, 16384, 1024)).toBe('8.3 / 16');
	});
});

describe('describeUnresolvedOrganization', () => {
	it('claims no match only for a fully loaded directory', () => {
		expect(describeUnresolvedOrganization('Acme', 'complete')).toBe('No organization matches “Acme”.');
		for (const state of ['loading', 'failed', 'truncated', 'unavailable'] as const) {
			expect(describeUnresolvedOrganization('Acme', state)).not.toMatch(/No organization matches/);
			expect(describeUnresolvedOrganization('Acme', state)).toMatch(/org-/);
		}
	});
});

describe('resolveOrganization', () => {
	it('maps a picked label, an exact id, or a unique name to the id', () => {
		expect(resolveOrganization('org-1 (Acme)', ORGS)).toEqual({ id: 'org-1' });
		expect(resolveOrganization(' org-2 ', ORGS)).toEqual({ id: 'org-2' });
		expect(resolveOrganization('globex', ORGS)).toEqual({ id: 'org-2' });
	});

	// Names repeat across tenants; picking the first match would show the wrong tenant's fleet.
	it('refuses a name more than one organization shares', () => {
		expect(resolveOrganization('Acme', ORGS)).toEqual({ ambiguous: 2 });
	});

	it('accepts a pasted id the directory does not list, and nothing else', () => {
		expect(resolveOrganization('org-pasted9', ORGS)).toEqual({ id: 'org-pasted9' });
		expect(resolveOrganization('Ac', ORGS)).toEqual({ unresolved: true });
		expect(resolveOrganization('Org-Chart', [])).toEqual({ unresolved: true });
	});

	it('treats blank as no filter', () => {
		expect(resolveOrganization('   ', ORGS)).toBeNull();
	});
});

describe('hostMatchesSearch', () => {
	it('matches name, id, FQDN, IP and cloud instance id, case-insensitively', () => {
		const target = host({ name: 'Edge-1', fqdn: 'edge-1.example.net', ipAddress: '10.1.2.3', cloudInstanceId: '987' });
		for (const query of ['edge-1', 'H-1', 'example.net', '10.1.2', '987', '']) {
			expect(hostMatchesSearch(target, query)).toBe(true);
		}
		expect(hostMatchesSearch(target, 'nope')).toBe(false);
	});
});
