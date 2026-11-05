/** @vitest-environment jsdom */
import { CLUSTER_PRESETS } from '@/features/clusters/presets/clusterPresets';
import {
	forgetPendingPresetSetup,
	getPendingPresetSetup,
	rememberPendingPresetSetup,
	resetPendingPresetSetupsForTests,
} from '@/features/clusters/presets/pendingPresetSetup';
import {
	isPresetApplied,
	owedPreset,
	useClusterPreset,
	useOwedPresetSetup,
} from '@/features/clusters/presets/usePresetSetup';
import type { ResolvedExtensionPage } from '@/features/instance/extensions/manifest';
import type { StudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { answer } = vi.hoisted(() => ({
	answer: { configuration: undefined as StudioConfiguration | undefined, fetches: 0 },
}));

vi.mock('@/config/constants', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/config/constants')>()),
	clusterPresetsEnabled: true,
}));
vi.mock('@/config/useInstanceClient', () => ({
	getInstanceClientIdFromParams: ({ clusterId }: { clusterId: string }) => ({
		instanceClient: {},
		entityId: clusterId,
		entityType: 'cluster',
	}),
}));
vi.mock('@/integrations/api/instance/studio/getStudioConfiguration', () => ({
	getStudioConfigurationQueryOptions: ({ entityId, enabled }: { entityId: string; enabled?: boolean }) => ({
		queryKey: [entityId, 'get_studio_configuration'],
		queryFn: async () => {
			answer.fetches++;
			return answer.configuration;
		},
		retry: false,
		enabled: enabled !== false,
	}),
}));

const [redirects, prerendering] = CLUSTER_PRESETS;
const page = (key: string) => ({ key, placement: 'tab' }) as ResolvedExtensionPage;
const configured: StudioConfiguration = {
	navigation: redirects.studio.navigation,
	landing: redirects.studio.landing,
	pages: [page(redirects.studio.landing)],
};
const blank: StudioConfiguration = { navigation: {}, pages: [] };
const unavailable: StudioConfiguration = { ...blank, unavailable: true };

describe('isPresetApplied', () => {
	it("needs a landing and the preset's own page, not just a landing that matches", () => {
		expect(isPresetApplied(redirects, configured)).toBe(true);
		// Set by hand with nothing installed.
		expect(isPresetApplied(redirects, { ...blank, landing: redirects.studio.landing })).toBe(false);
		// Installed, but the configure step never ran.
		expect(isPresetApplied(redirects, { ...configured, landing: undefined })).toBe(false);
	});

	it('still reads as applied after an admin moves the landing elsewhere', () => {
		expect(isPresetApplied(redirects, { ...configured, landing: 'databases' })).toBe(true);
	});
});

describe('owedPreset', () => {
	it("lets the cluster's config decide once it has loaded, over this browser's record", () => {
		expect(owedPreset({ remembered: redirects, recorded: undefined, configuration: configured })).toBeUndefined();
		expect(owedPreset({ remembered: redirects, recorded: redirects, configuration: configured })).toBeUndefined();
		expect(owedPreset({ remembered: redirects, recorded: undefined, configuration: blank })).toBe(redirects);
	});

	it("owes this browser's record while the config is unknown or unavailable", () => {
		expect(owedPreset({ remembered: redirects, recorded: undefined, configuration: undefined })).toBe(redirects);
		expect(owedPreset({ remembered: redirects, recorded: undefined, configuration: unavailable })).toBe(redirects);
	});

	it("owes a recorded preset only once the cluster's config shows it was never applied", () => {
		expect(owedPreset({ remembered: undefined, recorded: redirects, configuration: blank })).toBe(redirects);
		expect(owedPreset({ remembered: undefined, recorded: redirects, configuration: configured })).toBeUndefined();
	});

	it('owes nothing before the config can be read, so a signed-out home offers no setup', () => {
		expect(owedPreset({ remembered: undefined, recorded: redirects, configuration: undefined })).toBeUndefined();
	});

	it('owes nothing on a cluster that cannot report its configuration, such as Harper before 5.4', () => {
		expect(owedPreset({ remembered: undefined, recorded: redirects, configuration: unavailable })).toBeUndefined();
	});

	it("lets central-manager's preset decide over a different one this browser remembers", () => {
		expect(owedPreset({ remembered: redirects, recorded: prerendering, configuration: blank })).toBe(prerendering);
	});

	it('owes nothing for a blank cluster', () => {
		expect(owedPreset({ remembered: undefined, recorded: undefined, configuration: blank })).toBeUndefined();
	});
});

describe('useOwedPresetSetup', () => {
	beforeEach(() => {
		localStorage.clear();
		resetPendingPresetSetupsForTests();
		answer.configuration = undefined;
		answer.fetches = 0;
	});
	afterEach(cleanup);

	function renderOwed(connected: boolean, preset?: string) {
		const client = new QueryClient();
		const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
		return renderHook(() => useOwedPresetSetup({ id: 'clu-1', preset }, connected), { wrapper });
	}

	it('reads the config although this browser remembers the setup, and forgets it once the config shows it done', async () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		answer.configuration = configured;
		const { result } = renderOwed(true);

		await waitFor(() => expect(getPendingPresetSetup('clu-1')).toBeUndefined());
		expect(result.current).toBeUndefined();
		expect(answer.fetches).toBe(1);
	});

	it('keeps the record, and the offer, while the config shows the setup unfinished', async () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		answer.configuration = blank;
		const { result } = renderOwed(true);

		await waitFor(() => expect(answer.fetches).toBe(1));
		expect(result.current?.id).toBe('redirects');
		expect(getPendingPresetSetup('clu-1')).toBe('redirects');
	});

	it('keeps the record on a cluster that cannot report its configuration', async () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		answer.configuration = unavailable;
		const { result } = renderOwed(true);

		await waitFor(() => expect(answer.fetches).toBe(1));
		expect(result.current?.id).toBe('redirects');
		expect(getPendingPresetSetup('clu-1')).toBe('redirects');
	});

	it('offers the remembered setup to a signed-out viewer without reading the config', async () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		answer.configuration = configured;
		const { result } = renderOwed(false);

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(answer.fetches).toBe(0);
		expect(result.current?.id).toBe('redirects');
	});

	it("lets a recorded preset's config decide without any record in this browser", async () => {
		answer.configuration = blank;
		const { result } = renderOwed(true, 'redirects');

		await waitFor(() => expect(result.current?.id).toBe('redirects'));
	});

	it("owes central-manager's preset, not a different one this browser remembers, and forgets the record", async () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		answer.configuration = blank;
		const { result } = renderOwed(true, 'prerendering');

		await waitFor(() => expect(result.current?.id).toBe('prerendering'));
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
	});

	it('never offers a signed-out viewer the record, not even before forgetting it, once central-manager records another preset', async () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		const offered: (string | undefined)[] = [];
		const client = new QueryClient();
		const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
		renderHook(() => {
			const owed = useOwedPresetSetup({ id: 'clu-1', preset: 'prerendering' }, false);
			offered.push(owed?.id);
			return owed;
		}, { wrapper });

		await waitFor(() => expect(getPendingPresetSetup('clu-1')).toBeUndefined());
		expect(offered.length).toBeGreaterThan(0);
		expect(offered.every((id) => id === undefined)).toBe(true);
	});
});

describe('useClusterPreset', () => {
	beforeEach(() => {
		localStorage.clear();
		resetPendingPresetSetupsForTests();
	});
	afterEach(cleanup);

	const renderPreset = (preset?: string) => renderHook(() => useClusterPreset({ id: 'clu-1', preset }));

	it("takes central-manager's preset over a different one this browser remembers, and forgets the record", async () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		const { result } = renderPreset('prerendering');

		expect(result.current?.id).toBe('prerendering');
		await waitFor(() => expect(getPendingPresetSetup('clu-1')).toBeUndefined());
	});

	it('keeps a record central-manager agrees with, or has not recorded yet', async () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		expect(renderPreset('redirects').result.current?.id).toBe('redirects');
		expect(renderPreset(undefined).result.current?.id).toBe('redirects');

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(getPendingPresetSetup('clu-1')).toBe('redirects');
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
		localStorage.removeItem('Studio:PendingPresetSetup:clu-1');
		localStorage.setItem('Studio:PendingPresetSetup:clu-2', JSON.stringify({ preset: 'redirects', since: 1 }));
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();

		rememberPendingPresetSetup('clu-3', 'redirects');
		expect(getPendingPresetSetup('clu-2')).toBe('redirects');
	});

	it('survives corrupt storage', () => {
		localStorage.setItem('Studio:PendingPresetSetup:clu-1', '[not json');
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
	});
});
