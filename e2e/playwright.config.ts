import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Load e2e-only env (test account, target URL). Never the app's .env.local —
// this harness deliberately holds only the narrow, disposable credentials it needs.
loadEnv({ path: path.join(dir, '.env.e2e'), quiet: true });

// Where the studio UI under test lives. Default = the deployed dev environment
// (matches the PLAYWRIGHT_BASE_URL the repo already intends). Point it at
// http://localhost:5173 to test a locally-served build instead — when it's a
// localhost URL we start/reuse the app dev server for you (see `webServer`).
const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? 'https://dev.studio.harperfabric.com')
	.replace(/\/$/, '');
const isLocalTarget = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);

export default defineConfig({
	testDir: './tests',
	// Auth state produced by auth.setup.ts and consumed by the "authed" project.
	// Keep runs deterministic and CI-safe.
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: [
		['list'],
		['html', { open: 'never', outputFolder: 'playwright-report' }],
		// Machine-readable results for the automation triage step (results/results.json).
		['json', { outputFile: 'results/results.json' }],
	],
	timeout: 60_000,
	expect: {
		timeout: 10_000,
		// Visual regression: baselines MUST be generated in the Linux container
		// (see README) so font antialiasing matches. Commit only *-linux snapshots.
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.01,
			animations: 'disabled',
			caret: 'hide',
		},
	},
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		actionTimeout: 15_000,
		navigationTimeout: 30_000,
		// In a hardened container (--cap-drop=ALL) Chromium's own sandbox can't initialize, and
		// the container already IS the sandbox — so disable Chromium's when PLAYWRIGHT_NO_SANDBOX
		// is set (the PR-lane sandbox sets it). Never set it for local/CI runs.
		launchOptions: process.env.PLAYWRIGHT_NO_SANDBOX ? { args: ['--no-sandbox'] } : undefined,
		// Route the browser through the sandbox's egress proxy so its requests obey the same
		// allowlist (only the backend). localhost (the served build) bypasses the proxy.
		proxy: process.env.PLAYWRIGHT_PROXY
			? { server: process.env.PLAYWRIGHT_PROXY, bypass: 'localhost,127.0.0.1' }
			: undefined,
		// Force a single theme so screenshot baselines are stable regardless of the
		// runner's OS appearance. (Confirm the app honors this vs. a stored theme —
		// see the theme note in auth.setup.ts once the login flow is wired.)
		colorScheme: 'light',
	},
	projects: [
		// 1. Logs in through the real UI once, saves storage state. Doubles as a
		//    smoke test of the sign-in happy path.
		{
			name: 'setup',
			testMatch: /auth\.setup\.ts$/,
			use: { ...devices['Desktop Chrome'] },
		},
		// 2. Flows that must start UNAUTHENTICATED (sign-in page, validation errors,
		//    unverified-login -> verification). No stored session.
		{
			name: 'anon',
			testMatch: /.*\.anon\.spec\.ts$/,
			use: { ...devices['Desktop Chrome'] },
		},
		// 3. Flows that need a logged-in session (org users, in-app screens).
		{
			name: 'authed',
			testMatch: /.*\.authed\.spec\.ts$/,
			dependencies: ['setup'],
			use: {
				...devices['Desktop Chrome'],
				storageState: path.join(dir, '.auth/user.json'),
			},
		},
	],
	// Only when targeting localhost: bring up (or reuse) the app dev server.
	// When testing a deployed URL (the default), the app is already running.
	// Auto-manage the dev server only when targeting localhost AND not told otherwise. The
	// PR-lane sandbox serves its own built app (via `vite preview`) and sets
	// PLAYWRIGHT_NO_WEBSERVER=1, so Playwright must NOT try to spin up `pnpm dev` on :5173.
	webServer: (isLocalTarget && !process.env.PLAYWRIGHT_NO_WEBSERVER)
		? {
			command: 'pnpm --dir .. run dev',
			url: 'http://localhost:5173',
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
			stdout: 'pipe',
			stderr: 'pipe',
		}
		: undefined,
});
