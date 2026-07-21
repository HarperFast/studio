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
			// Nested git worktrees live under .claude/worktrees/; without this
			// their test files get swept into runs from the main checkout.
			'**/.claude/worktrees/**',
			// The standalone Playwright integration harness under e2e/ has its own
			// runner; its *.spec.ts import '@playwright/test' and crash vitest's
			// collector ("test.describe() ... not expected here").
			'**/e2e/**',
		],
		setupFiles: [
			'./src/testSetup/failOnRenderPhaseUpdate.ts',
			'./src/features/instance/status/analytics/__tests__/setup.ts',
			'./src/lib/monaco/__tests__/setup.ts',
		],
		globals: true,
		coverage: {
			provider: 'v8',
			// json-summary + json feed the PR coverage comment in CI
			// (vitest-coverage-report-action); lcov stays for Sonar.
			reporter: ['text', 'lcov', 'json-summary', 'json'],
			// Still write coverage output when tests fail, so CI can post
			// the coverage report alongside the failure.
			reportOnFailure: true,
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
