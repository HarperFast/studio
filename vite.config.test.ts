import path from 'node:path';
import { describe, expect, it } from 'vitest';
import viteConfig from './vite.config';

function buildOutput() {
	const config = viteConfig({ mode: 'prod', command: 'build', isSsrBuild: false, isPreview: false });
	if (typeof config === 'function' || config instanceof Promise) {
		throw new Error('vite.config.ts no longer returns a plain config object');
	}
	return config.build?.rollupOptions?.output as { manualChunks?: unknown; chunkFileNames?: unknown };
}

// `shouldKeepEvent` reads a `vendor-datadog` frame as neutral instrumentation (#1696).
describe('manualChunks', () => {
	it('builds the translation DOM guard into the Datadog chunk', () => {
		const { manualChunks, chunkFileNames } = buildOutput();
		const guard = path.resolve(__dirname, 'src/lib/installBrowserTranslationDomGuard.ts');
		const chunkOf = manualChunks as (id: string) => string | undefined;

		expect(chunkOf(guard)).toBe('vendor-datadog');
		expect(chunkOf(path.resolve(__dirname, 'node_modules/@datadog/browser-rum/esm/index.js'))).toBe('vendor-datadog');
		expect(chunkFileNames).toBe('assets/[name]-[hash].js');
	});

	it('leaves the rest of Studio to the automatic split', () => {
		const chunkOf = buildOutput().manualChunks as (id: string) => string | undefined;

		expect(chunkOf(path.resolve(__dirname, 'src/main.tsx'))).toBeUndefined();
		expect(chunkOf(path.resolve(__dirname, 'src/lib/installStaleDeployReload.ts'))).toBeUndefined();
	});
});
