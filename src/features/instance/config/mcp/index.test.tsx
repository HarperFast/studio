/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigMcpIndex } from '.';

interface Member {
	id: string;
	name: string;
	version?: string;
	status?: string;
	instanceFqdn: string;
	operationsApiPort: number;
	operationsApiSecure: boolean;
}

const { state, queriesSeen, onConfigUpdate, rollingOptions } = vi.hoisted(() => ({
	rollingOptions: [] as unknown[],
	state: {
		canManage: true,
		version: '5.3.6' as string | undefined,
		configuration: {} as Record<string, unknown> | undefined,
		members: [] as Member[],
		params: { clusterId: 'clu-1' } as { clusterId?: string; instanceId?: string },
		entityType: 'cluster' as 'cluster' | 'instance',
	},
	queriesSeen: [] as Array<{ queryKey: readonly unknown[]; enabled?: boolean }>,
	onConfigUpdate: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: (options: { queryKey: readonly unknown[]; enabled?: boolean }) => {
		queriesSeen.push(options);
		if (options.queryKey[0] === 'registration_info') {
			return { data: state.version === undefined ? undefined : { version: state.version }, isError: false };
		}
		if (options.queryKey[0] === 'get_configuration') {
			return { data: options.enabled === false ? undefined : state.configuration, isError: false };
		}
		return { data: { id: 'clu-1', instances: state.members } };
	},
}));
vi.mock('@tanstack/react-router', () => ({ useParams: () => state.params }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'clu-1', entityType: state.entityType }),
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('@/hooks/useRollingConfigUpdate', () => ({
	useRollingConfigUpdate: (options: unknown) => {
		rollingOptions.push(options);
		return { onConfigUpdate, isPending: false };
	},
}));

function member(id: string, version: string): Member {
	return {
		id,
		name: id,
		version,
		status: 'RUNNING',
		instanceFqdn: `${id}.example.com`,
		operationsApiPort: 9925,
		operationsApiSecure: true,
	};
}

const configurationQuery = () => queriesSeen.filter((options) => options.queryKey[0] === 'get_configuration').at(-1);

function partSwitch(name: 'Operations' | 'Application') {
	return screen.getByRole('switch', { name: `${name} part` });
}

function saveAndConfirm() {
	fireEvent.click(screen.getByRole('button', { name: 'Save & Restart' }));
	const dialog = screen.getByRole('dialog');
	fireEvent.click(within(dialog).getByRole('button', { name: 'Save & Restart' }));
}

beforeAll(() => {
	// Radix Select and Tabs measure and observe; jsdom has neither.
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView ??= () => {};
	Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
	queriesSeen.length = 0;
	onConfigUpdate.mockReset();
	Object.assign(state, {
		canManage: true,
		version: '5.3.6',
		configuration: {},
		members: [member('node-a', '5.3.6'), member('node-b', '5.3.6')],
		params: { clusterId: 'clu-1' },
		entityType: 'cluster',
	});
});

afterEach(cleanup);

describe('ConfigMcpIndex', () => {
	it('is for super users: a deep link reads no configuration', () => {
		state.canManage = false;
		render(<ConfigMcpIndex />);
		expect(screen.getByText('Only super users can view or change the MCP server.')).toBeTruthy();
		expect(configurationQuery()?.enabled).toBe(false);
	});

	it('names the build it needs below 5.1', () => {
		state.version = '5.0.14';
		render(<ConfigMcpIndex />);
		expect(screen.getByText("Harper's MCP server needs Harper 5.1.0-beta.1 or later. This instance runs 5.0.14."))
			.toBeTruthy();
		expect(configurationQuery()?.enabled).toBe(false);
	});

	it('turns the operations part on below 5.4 by writing its mount path, after warning it cannot be undone here', () => {
		render(<ConfigMcpIndex />);
		expect(screen.queryByText('Connect an AI tool')).toBeNull();

		fireEvent.click(partSwitch('Operations'));
		expect(screen.getByText(/Studio can't turn this part off again once it's on/)).toBeTruthy();

		saveAndConfirm();
		expect(onConfigUpdate).toHaveBeenCalledWith({ mcp_operations_mountPath: '/mcp' });
		// The operations part mounts on the operations server, which only a full restart restarts.
		expect(rollingOptions.at(-1)).toMatchObject({ restartOperation: 'restart' });
	});

	it('says the instances restart, one at a time, before it saves', () => {
		render(<ConfigMcpIndex />);
		fireEvent.click(partSwitch('Application'));
		fireEvent.click(screen.getByRole('button', { name: 'Save & Restart' }));
		const dialog = screen.getByRole('dialog');
		expect(within(dialog).getByText(/restarts them one at a time/)).toBeTruthy();
		expect(within(dialog).getByText('Turn the application part on.')).toBeTruthy();
		expect(onConfigUpdate).not.toHaveBeenCalled();
	});

	it('keeps a part on below 5.4, where nothing Studio can write turns it off', () => {
		state.configuration = { mcp: { operations: {} } };
		render(<ConfigMcpIndex />);
		const toggle = partSwitch('Operations');
		expect(toggle.getAttribute('aria-checked')).toBe('true');
		expect((toggle as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText(/Turning this off needs Harper 5.4 or later/)).toBeTruthy();
	});

	it('turns a part off from 5.4 with the enabled flag', () => {
		state.version = '5.4.0-beta.4';
		state.members = [member('node-a', '5.4.0-beta.4')];
		state.configuration = { mcp: { application: {} } };
		render(<ConfigMcpIndex />);

		fireEvent.click(partSwitch('Application'));
		saveAndConfirm();
		expect(onConfigUpdate).toHaveBeenCalledWith({ mcp_application_enabled: false });
	});

	it('cannot turn a part off while any member predates the flag', () => {
		state.version = '5.4.0-beta.4';
		state.members = [member('node-a', '5.4.0-beta.4'), member('node-b', '5.3.6')];
		state.configuration = { mcp: { application: {} } };
		render(<ConfigMcpIndex />);
		expect((partSwitch('Application') as HTMLButtonElement).disabled).toBe(true);
	});

	it('removes a default command by denying it', () => {
		state.configuration = { mcp: { operations: {} } };
		render(<ConfigMcpIndex />);

		fireEvent.click(screen.getByRole('button', { name: 'Remove read_log' }));
		expect(screen.getByRole('button', { name: 'Put back read_log' })).toBeTruthy();
		saveAndConfirm();
		expect(onConfigUpdate).toHaveBeenCalledWith({ mcp_operations_allow: [], mcp_operations_deny: ['read_log'] });
	});

	it('locks the command list below 5.4 while the operations part is off, since saving it would turn the part on', () => {
		render(<ConfigMcpIndex />);
		expect(screen.queryByRole('button', { name: 'Remove read_log' })).toBeNull();
		expect(screen.getByText(/saving a command list turns the operations part on/)).toBeTruthy();
	});

	it("shows each instance's own addresses and a sign-in that keeps the password out of the AI tool", () => {
		state.configuration = { mcp: { operations: {}, application: { mountPath: '/ai' } } };
		render(<ConfigMcpIndex />);

		expect(screen.getByText('https://node-a.example.com:9925/mcp')).toBeTruthy();
		expect(screen.getByText('https://node-a.example.com/ai')).toBeTruthy();
		expect(screen.getByText('harper login https://node-a.example.com:9925')).toBeTruthy();
		const settings = screen.getByText(/"mcpServers"/).textContent ?? '';
		expect(JSON.parse(settings)).toEqual({
			mcpServers: {
				harper: { command: 'harper', args: ['mcp', '--target', 'https://node-a.example.com:9925'] },
				'harper-application': {
					command: 'harper',
					args: ['mcp', '--profile', 'application', '--target', 'https://node-a.example.com', '--mount-path', '/ai'],
				},
			},
		});
	});

	it('marks a command list that lets AI tools change data', () => {
		state.configuration = { mcp: { operations: { allow: ['describe_*', 'insert'] } } };
		render(<ConfigMcpIndex />);
		expect(screen.getByText(/AI tools can run 1 command here that change or delete data/)).toBeTruthy();
		expect(screen.getByText(/leaves out some of Harper's default read-only commands/)).toBeTruthy();
	});
});
