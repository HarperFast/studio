// @ts-expect-error Not sure why node:path is complaining about esModuleInterop here
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		// Worker threads spin up faster than forked processes, trimming
		// per-file startup overhead. Isolation stays on (the default) because
		// several suites rely on vi.mock, which is unreliable without it.
		pool: 'threads',
		include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
		],
		setupFiles: ['./src/features/instance/status/analytics/__tests__/setup.ts'],
		globals: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
