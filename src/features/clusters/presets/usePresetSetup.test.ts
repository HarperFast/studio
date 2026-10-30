/** @vitest-environment jsdom */
import { CLUSTER_PRESETS } from '@/features/clusters/presets/clusterPresets';
import {
	forgetPendingPresetSetup,
	getPendingPresetSetup,
	rememberPendingPresetSetup,
	resetPendingPresetSetupsForTests,
} from '@/features/clusters/presets/pendingPresetSetup';
import { owedPreset } from '@/features/clusters/presets/usePresetSetup';
import { beforeEach, describe, expect, it } from 'vitest';

const [redirects] = CLUSTER_PRESETS;
const configured = { navigation: redirects.studio.navigation, landing: redirects.studio.landing, pages: [] };
const blank = { navigation: {}, pages: [] };

describe('owedPreset', () => {
	it("owes the setup this browser started until it finishes, whatever the cluster's config says", () => {
		expect(owedPreset({ remembered: redirects, recorded: undefined, configuration: undefined })).toBe(redirects);
		expect(owedPreset({ remembered: redirects, recorded: redirects, configuration: configured })).toBe(redirects);
	});

	it("owes a recorded preset only once the cluster's config shows it was never applied", () => {
		expect(owedPreset({ remembered: undefined, recorded: redirects, configuration: blank })).toBe(redirects);
		expect(owedPreset({ remembered: undefined, recorded: redirects, configuration: configured })).toBeUndefined();
	});

	it('owes nothing before the config can be read, so a signed-out home offers no setup', () => {
		expect(owedPreset({ remembered: undefined, recorded: redirects, configuration: undefined })).toBeUndefined();
	});

	it('owes nothing on a cluster that cannot report its configuration, such as Harper before 5.4', () => {
		const unavailable = { ...blank, unavailable: true as const };
		expect(owedPreset({ remembered: undefined, recorded: redirects, configuration: unavailable })).toBeUndefined();
	});

	it('owes nothing for a blank cluster', () => {
		expect(owedPreset({ remembered: undefined, recorded: undefined, configuration: blank })).toBeUndefined();
	});
});

describe('pendingPresetSetup', () => {
	beforeEach(() => {
		localStorage.clear();
		resetPendingPresetSetupsForTests();
	});

	it('remembers a cluster until its setup is forgotten', () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		resetPendingPresetSetupsForTests();
		expect(getPendingPresetSetup('clu-1')).toBe('redirects');

		forgetPendingPresetSetup('clu-1');
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
	});

	it('sees what another tab wrote, so none offers or restores a finished setup', () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		localStorage.setItem('Studio:PendingPresetSetups', JSON.stringify({ 'clu-2': { preset: 'redirects', since: 1 } }));
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();

		rememberPendingPresetSetup('clu-3', 'redirects');
		expect(getPendingPresetSetup('clu-2')).toBe('redirects');
	});

	it('survives corrupt storage', () => {
		localStorage.setItem('Studio:PendingPresetSetups', '[not json');
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
	});
});
