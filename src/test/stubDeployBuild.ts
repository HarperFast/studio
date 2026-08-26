import { vi } from 'vitest';

/**
 * Stub the four values `isDeployedBuild` reads, so a test that needs telemetry on (or off) says so
 * instead of inheriting it. Vitest runs in mode `test` and loads the developer's root `.env.local`,
 * which may set `VITE_ENV_NAME` or `VITE_LOCAL_STUDIO` — leaving any of them unstubbed makes the
 * result differ between that machine and CI. Call before importing the module under test: the
 * predicate is evaluated once at module scope.
 */
export function stubDeployBuild({ mode, envName }: { mode: string | undefined; envName: string | undefined }) {
	vi.stubEnv('DEV', false);
	vi.stubEnv('VITE_LOCAL_STUDIO', 'false');
	vi.stubEnv('MODE', mode);
	vi.stubEnv('VITE_ENV_NAME', envName);
}
