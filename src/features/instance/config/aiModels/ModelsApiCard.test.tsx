/** @vitest-environment jsdom */
import type { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelsApiCard } from './ModelsApiCard';

const { state, onConfigUpdate, queriesSeen } = vi.hoisted(() => ({
	state: {
		restUrl: 'https://my-cluster.example.com/' as string | null,
		components: undefined as unknown,
		configFiles: {} as Record<string, string>,
		isPending: false,
		local: false,
	},
	onConfigUpdate: vi.fn(),
	queriesSeen: [] as Array<{ queryKey: readonly unknown[]; enabled?: boolean }>,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: (options: { queryKey: readonly unknown[]; enabled?: boolean }) => {
		queriesSeen.push(options);
		return { data: options.enabled === false ? undefined : state.components };
	},
	useQueries: ({ queries }: { queries: Array<{ queryKey: readonly unknown[] }> }) =>
		queries.map(({ queryKey }) => {
			const text = state.configFiles[queryKey[2] as string];
			return { data: text === undefined ? undefined : { message: text } };
		}),
}));
vi.mock('@/config/constants', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/config/constants')>()),
	get isLocalStudio() {
		return state.local;
	},
}));
vi.mock('@/config/useEntityRestURL', () => ({ useEntityRestURL: () => state.restUrl }));
vi.mock('@/hooks/useRollingConfigUpdate', () => ({
	useRollingConfigUpdate: () => ({ onConfigUpdate, isPending: state.isPending }),
}));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => [vi.fn()] }));

const instanceParams = {
	instanceClient: { defaults: { baseURL: 'http://localhost:9925/' } },
	entityId: 'clu-1',
} as InstanceClientIdConfig;

function show(configuration: unknown) {
	render(<ModelsApiCard instanceParams={instanceParams} configuration={configuration} targetNoun="cluster" />);
}

beforeEach(() => {
	Object.assign(state, {
		restUrl: 'https://my-cluster.example.com/',
		components: { name: 'components', entries: [] },
		configFiles: {},
		isPending: false,
		local: false,
	});
	onConfigUpdate.mockReset();
	queriesSeen.length = 0;
});
afterEach(cleanup);

describe('the /v1 API switch', () => {
	it('turns it on through the settings save and restart, by the name Harper takes', () => {
		show({ rest: true });
		expect(screen.getByText('Off')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Turn On & Restart' }));
		expect(onConfigUpdate).toHaveBeenCalledWith({ modelsGateway_enabled: true });
	});

	it('turns it off again', () => {
		show({ rest: true, modelsGateway: { enabled: true } });
		expect(screen.getByText('On')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Turn Off & Restart' }));
		expect(onConfigUpdate).toHaveBeenCalledWith({ modelsGateway_enabled: false });
	});

	it('cannot be clicked again while the save is running', () => {
		state.isPending = true;
		show({ rest: true });
		expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("shows the address on the cluster's own HTTPS address, and that it needs an admin user", () => {
		show({ rest: true });
		expect(screen.getByText('https://my-cluster.example.com/v1')).toBeTruthy();
		expect(screen.getByText(/Every request needs an admin \(super user\) user/)).toBeTruthy();
		expect(screen.getByText('POST /v1/embeddings · POST /v1/chat/completions · GET /v1/models')).toBeTruthy();
	});

	it('on Local Studio, shows the HTTP port from the config rather than the operations address', () => {
		state.local = true;
		show({ rest: true, http: { port: 9926, securePort: null } });
		expect(screen.getByText('http://localhost:9926/v1')).toBeTruthy();
	});

	it('says the address is not known rather than showing a wrong one', () => {
		state.restUrl = null;
		show({ rest: true });
		expect(screen.getByText('Not known')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Copy the /v1 address' })).toBeNull();
	});
});

describe('the REST warning', () => {
	const warning = /Nothing turns on REST here/;

	it('stays away, and reads no app, when the root config turns REST on', () => {
		show({ rest: true });
		expect(screen.queryByText(warning)).toBeNull();
		expect(queriesSeen.every((query) => query.enabled === false)).toBe(true);
	});

	it('warns when no app and no root setting turns REST on', () => {
		state.components = { name: 'components', entries: [{ name: 'site', entries: [{ name: 'config.yaml' }] }] };
		state.configFiles = { site: 'static:\n  files: web/**\n' };
		show({ modelsGateway: { enabled: true } });
		expect(screen.getByText(warning).textContent).toContain("/v1 won't answer until something does");
	});

	it('says the same ahead of time while the API is still off', () => {
		show({});
		expect(screen.getByText(warning).textContent).toContain("/v1 won't answer once it is on until something does");
	});

	it('stays away when an app turns REST on, by its config or by having none', () => {
		state.components = { name: 'components', entries: [{ name: 'api', entries: [{ name: 'config.yaml' }] }] };
		state.configFiles = { api: 'rest: true\n' };
		show({});
		expect(screen.queryByText(warning)).toBeNull();
		cleanup();
		state.components = { name: 'components', entries: [{ name: 'bare', entries: [{ name: 'resources.js' }] }] };
		state.configFiles = {};
		show({});
		expect(screen.queryByText(warning)).toBeNull();
	});

	it('stays away while it cannot tell: the apps, or one app’s config, not read yet', () => {
		state.components = undefined;
		show({});
		expect(screen.queryByText(warning)).toBeNull();
		cleanup();
		state.components = { name: 'components', entries: [{ name: 'site', entries: [{ name: 'config.yaml' }] }] };
		show({});
		expect(screen.queryByText(warning)).toBeNull();
	});
});
