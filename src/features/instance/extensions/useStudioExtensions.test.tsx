/** @vitest-environment jsdom */
import { useStudioConfiguration } from '@/features/instance/extensions/useStudioExtensions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const harper = vi.hoisted(() => {
	const state = {
		signedIn: true,
		registration: (): Promise<unknown> => Promise.resolve({ version: '5.4.0' }),
		// The instance client, answering each operation the hook sends.
		post: vi.fn(async (_path: string, body: { operation: string }) =>
			body.operation === 'registration_info'
				? { data: await state.registration() }
				: { data: { navigation: { logs: 'tucked' }, pages: [] } }
		),
	};
	return state;
});

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ clusterId: 'clu-1' }) }));
vi.mock('@/hooks/useAuth', () => {
	const user = { username: 'admin' };
	return { useInstanceAuth: () => ({ user: harper.signedIn ? user : undefined }) };
});
vi.mock('@/config/useInstanceClient', () => {
	// One object, as the real hook memoizes it: it lands in query keys and dependency arrays.
	const params = { entityId: 'clu-1', instanceClient: { post: harper.post } };
	return { useInstanceClientIdParams: () => params, useInstanceClient: () => params.instanceClient };
});

afterEach(() => {
	harper.signedIn = true;
	harper.registration = () => Promise.resolve({ version: '5.4.0' });
	harper.post.mockClear();
});

function renderConfiguration() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrapper = ({ children }: PropsWithChildren) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return renderHook(() => useStudioConfiguration(), { wrapper });
}

const sent = () => harper.post.mock.calls.map(([, body]) => (body as { operation: string }).operation);

function forbidden() {
	const config = { headers: new AxiosHeaders() };
	return new AxiosError('forbidden', AxiosError.ERR_BAD_REQUEST, config, undefined, {
		status: 403,
		statusText: '',
		headers: {},
		config,
		data: { error: 'not authorized' },
	});
}

describe('useStudioConfiguration', () => {
	it('never asks a Harper older than 5.4, and is not left pending', async () => {
		harper.registration = () => Promise.resolve({ version: '5.3.4' });
		const { result } = renderConfiguration();
		await waitFor(() => expect(result.current.isPending).toBe(false));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(sent()).toEqual(['registration_info']);
		expect(result.current.configuration).toEqual({ navigation: {}, pages: [], unavailable: true });
	});

	it.each(['5.4.0-0', '5.4.0-alpha.2', '5.4.0'])('asks %s, pending until it answers', async (version) => {
		harper.registration = () => Promise.resolve({ version });
		const { result } = renderConfiguration();
		expect(result.current.isPending).toBe(true);
		await waitFor(() => expect(result.current.isPending).toBe(false));
		expect(sent()).toEqual(['registration_info', 'get_studio_configuration']);
		expect(result.current.configuration.navigation).toEqual({ logs: 'tucked' });
	});

	it('asks as before when it cannot read the version', async () => {
		harper.registration = () => Promise.reject(forbidden());
		const { result } = renderConfiguration();
		await waitFor(() => expect(result.current.configuration.navigation).toEqual({ logs: 'tucked' }));
		expect(result.current.isPending).toBe(false);
		expect(sent()).toEqual(['registration_info', 'get_studio_configuration']);
	});

	it('stays pending while the version is still loading, asking nothing yet', async () => {
		let answer: (info: unknown) => void = () => {};
		harper.registration = () => new Promise((resolve) => (answer = resolve));
		const { result } = renderConfiguration();
		await waitFor(() => expect(sent()).toEqual(['registration_info']));
		expect(result.current.isPending).toBe(true);
		answer({ version: '5.4.0' });
		await waitFor(() => expect(sent()).toEqual(['registration_info', 'get_studio_configuration']));
		await waitFor(() => expect(result.current.isPending).toBe(false));
	});

	it('asks nothing, and is not pending, until the viewer is signed in', async () => {
		harper.signedIn = false;
		const { result } = renderConfiguration();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(result.current.isPending).toBe(false);
		expect(sent()).toEqual([]);
	});
});

const PROTOTYPE_MODULES = {
	data: '@/features/instance/extensions/prototype/demoDataSource',
	extensions: '@/features/instance/extensions/prototype/demoExtensions',
	state: '@/features/instance/extensions/prototype/prototypeState',
};

describe('the dev prototype', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		for (const module of Object.values(PROTOTYPE_MODULES)) {
			vi.doUnmock(module);
		}
	});

	// A fresh copy of the hooks, evaluated as the given build would: the prototype is chosen at module load.
	async function prototypeModulesLoadedWhen(dev: boolean) {
		const loaded: string[] = [];
		vi.stubEnv('DEV', dev);
		vi.resetModules();
		for (const [name, module] of Object.entries(PROTOTYPE_MODULES)) {
			vi.doMock(module, (importOriginal) => {
				loaded.push(name);
				return importOriginal();
			});
		}
		await import('@/features/instance/extensions/useStudioExtensions');
		return loaded.sort();
	}

	it('loads on the dev server', async () => {
		expect(await prototypeModulesLoadedWhen(true)).toEqual(['data', 'extensions', 'state']);
	});

	it('stays out of a production build', async () => {
		expect(await prototypeModulesLoadedWhen(false)).toEqual([]);
	});
});
