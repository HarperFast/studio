import { deployModes } from '@/config/constants';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const envDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.github/deploy-public-env');

function envNameByMode() {
	const byMode = new Map<string, string>();
	for (const file of readdirSync(envDir)) {
		// Only `.env.<mode>` names a build mode; anything else here (a subdirectory, `.DS_Store`)
		// would either throw from `readFileSync` or invent a mode that cannot be built.
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
