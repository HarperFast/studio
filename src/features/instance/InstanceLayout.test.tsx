import { afterEach, describe, expect, it, vi } from 'vitest';

const STUBBED = {
	'@/features/instance/InstanceNavBar': { InstanceNavBar: () => null },
	'@/features/restart/RestartingNotice': { RestartingNotice: () => null },
	'@/features/auth/store/authStore': { OverallAppSignIn: 'studio' },
	'@/features/instance/applications/components/Chat/FloatingChat': { FloatingChat: () => null },
};
const PROTOTYPE_PANEL = '@/features/instance/extensions/prototype/PrototypePanel';

describe('the dev prototype panel', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		for (const module of ['react', PROTOTYPE_PANEL, ...Object.keys(STUBBED)]) {
			vi.doUnmock(module);
		}
	});

	/**
	 * Whether a fresh layout, evaluated as the given build would, hands the panel's chunk to `lazy()`. A build
	 * emits a chunk for every `import()` it can reach, loaded or not, so rendering can't tell: the panel's
	 * render is gated either way, and only its declaration decides whether production ships the demo.
	 */
	async function panelReachableWhen(dev: boolean) {
		vi.stubEnv('DEV', dev);
		vi.resetModules();
		const factories: Array<() => Promise<unknown>> = [];
		vi.doMock('react', async (importOriginal) => {
			const react = await importOriginal<typeof import('react')>();
			const lazy: typeof react.lazy = (factory) => {
				factories.push(factory);
				return react.lazy(factory);
			};
			return { ...react, lazy };
		});
		for (const [module, exports] of Object.entries(STUBBED)) {
			vi.doMock(module, () => exports);
		}
		let loaded = false;
		vi.doMock(PROTOTYPE_PANEL, () => {
			loaded = true;
			return { PrototypePanel: () => null };
		});
		await import('@/features/instance/InstanceLayout');
		await Promise.all(factories.map((factory) => factory()));
		return loaded;
	}

	it('is reachable on the dev server', async () => {
		expect(await panelReachableWhen(true)).toBe(true);
	});

	it('is unreachable in a production build', async () => {
		expect(await panelReachableWhen(false)).toBe(false);
	});
});
