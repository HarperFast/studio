import type { TabVisibility } from '@/features/instance/extensions/parseStudioConfiguration';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { useSyncExternalStore } from 'react';

/**
 * PROTOTYPE ONLY: the scenario switcher's state — which demo components are "installed" on the
 * cluster, which role extension pages are evaluated against, and which focus preset stands in for the
 * cluster's `studio` config. Persisted so a reload keeps the scenario. Built-in tabs keep using the real
 * role; only extension pages read the simulated one.
 *
 * Dev server only: a production build or a test run always sees {@link INACTIVE_STATE}, so no demo page,
 * simulated role or preset can reach a real user or a test that didn't ask for one.
 */
export const PROTOTYPE_AVAILABLE = import.meta.env.DEV && import.meta.env.MODE !== 'test';

export type SimulatedRole = 'actual' | 'super_user' | 'editor' | 'viewer' | 'none';
export type FocusPreset = 'none' | 'redirects' | 'cache';

export interface PrototypeState {
	enabled: boolean;
	installed: Record<string, boolean>;
	role: SimulatedRole;
	focus: FocusPreset;
	panelOpen: boolean;
}

/** What a cluster's `studio` block would say for each preset. */
export const FOCUS_PRESETS: Record<
	FocusPreset,
	{ label: string; description: string; navigation: Record<string, TabVisibility>; landing?: string }
> = {
	none: { label: 'No preset', description: 'every built-in tab visible', navigation: {} },
	redirects: {
		label: 'Redirects cluster',
		description: 'apps/APIs/operations hidden, status/logs tucked, opens on Redirects',
		navigation: { applications: 'hidden', apis: 'hidden', operations: 'hidden', status: 'tucked', logs: 'tucked' },
		landing: 'harper-redirects.redirects',
	},
	cache: {
		label: 'Caching cluster',
		description: 'apps/operations tucked, opens on Cache Insights',
		navigation: { applications: 'tucked', operations: 'tucked', apis: 'tucked' },
		landing: 'cache-insights.insights',
	},
};

const STORAGE_KEY = 'Studio:ExtensionsPrototype';

const INACTIVE_STATE: PrototypeState = Object.freeze({
	enabled: false,
	installed: {},
	role: 'actual',
	focus: 'none',
	panelOpen: false,
});

const DEFAULT_STATE: PrototypeState = {
	enabled: true,
	installed: { 'harper-redirects': true, 'harper-prerender': true, 'cache-insights': true },
	role: 'actual',
	focus: 'none',
	panelOpen: true,
};

function readState(): PrototypeState {
	if (!PROTOTYPE_AVAILABLE) {
		return INACTIVE_STATE;
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE;
	} catch {
		return DEFAULT_STATE;
	}
}

let state = readState();
const listeners = new Set<() => void>();

export function setPrototypeState(update: Partial<PrototypeState>) {
	if (!PROTOTYPE_AVAILABLE) {
		return;
	}
	state = { ...state, ...update };
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Private mode: the scenario just won't survive a reload.
	}
	for (const listener of listeners) {
		listener();
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function usePrototypeState(): PrototypeState {
	return useSyncExternalStore(subscribe, () => state);
}

const editorTables = {
	redirects: { tables: { Rule: grant(true, true, true, true) } },
	cache: { tables: { Stat: grant(true, false, false, false) } },
};

const viewerTables = {
	redirects: { tables: { Rule: grant(true, false, false, false) } },
	cache: { tables: { Stat: grant(true, false, false, false) } },
};

export const SIMULATED_ROLES: Record<
	Exclude<SimulatedRole, 'actual'>,
	{ label: string; description: string; permission: LocalRolePermission }
> = {
	super_user: {
		label: 'Super user',
		description: 'super_user: true',
		permission: { super_user: true },
	},
	editor: {
		label: 'Redirects editor',
		description: 'read/insert/update/delete on redirects.Rule, read on cache.Stat',
		permission: { super_user: false, ...editorTables },
	},
	viewer: {
		label: 'Read-only',
		description: 'read on redirects.Rule and cache.Stat',
		permission: { super_user: false, ...viewerTables },
	},
	none: {
		label: 'No grants',
		description: 'a role with no table permissions',
		permission: { super_user: false },
	},
};

function grant(read: boolean, insert: boolean, update: boolean, remove: boolean) {
	return { read, insert, update, delete: remove, attribute_permissions: [] };
}
