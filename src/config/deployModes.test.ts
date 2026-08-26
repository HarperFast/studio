import { deployModes } from '@/config/constants';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envDir = path.join(repoRoot, '.github/deploy-public-env');
const deployAction = path.join(repoRoot, '.github/actions/studio-deploy/action.yaml');

function envNameByMode() {
	const byMode = new Map<string, string>();
	for (const file of readdirSync(envDir)) {
		// A subdirectory or a stray `.DS_Store` is not a build mode.
		if (!file.startsWith('.env.')) {
			continue;
		}
		const mode = file.slice('.env.'.length);
		const name = readFileSync(path.join(envDir, file), 'utf8').match(/^VITE_ENV_NAME=(.+)$/m)?.[1];
		if (name) {
			byMode.set(mode, name.trim());
		}
	}
	return byMode;
}

// Adding a deploy environment without adding it to `deployModes` ships it with telemetry silently
// off — an absence of data, which nothing else in the suite would notice.
describe('deployModes', () => {
	it('matches the build modes that define an environment name', () => {
		expect([...deployModes].sort()).toEqual([...envNameByMode().keys()].sort());
	});

	it('names each environment the same as its mode, so the reported env tag is the mode', () => {
		for (const [mode, envName] of envNameByMode()) {
			expect(envName).toBe(mode);
		}
	});
});

// Losing this env key is the one way telemetry can go to zero across every environment without
// anything failing: the build succeeds, the deploy succeeds, and the only symptom is an absence of
// data nobody watches. It is asserted here because no other test reaches the deploy action.
describe('the deploy action', () => {
	const action = readFileSync(deployAction, 'utf8');

	it('sets VITE_TELEMETRY_ENABLED on the step that builds the deployed bundle', () => {
		const buildStep = action.slice(action.indexOf('- name: Build '), action.indexOf('- name: Upload sourcemaps'));

		expect(buildStep).toContain('pnpm build --mode');
		expect(buildStep).toMatch(/^\s*VITE_TELEMETRY_ENABLED: 'true'$/m);
	});

	it('is the only place that enables telemetry — an env file would also enable local builds', () => {
		for (const file of readdirSync(envDir)) {
			expect(readFileSync(path.join(envDir, file), 'utf8')).not.toContain('VITE_TELEMETRY_ENABLED');
		}
	});
});
