import { ApiAuth, AuthMethod } from '@/features/instance/apis/explorer/request';
import { getSessionStorage } from '@/lib/storage/getSessionStorage';
import { setSessionStorage } from '@/lib/storage/setSessionStorage';

const KEY = 'ApiExplorerSettings' as const;

/**
 * Per-entity Authorize selections. `method` is the UI credential source; `auth` is the wire
 * credential the request builder consumes. They are stored together (rather than deriving one from
 * the other) so a logged-in `bearer` stays distinguishable from a manually pasted `bearer`. Persisted
 * per browser tab in sessionStorage — cleared when the tab closes — under a single map key.
 */
export interface ExplorerEntitySettings {
	method?: AuthMethod;
	auth?: ApiAuth;
	server?: string;
	/** The server the credential was authorized against; it's only sent when the active server matches. */
	authServer?: string;
	/**
	 * The sign-out generation this credential was created under. sessionStorage survives a reload, so a
	 * tab that restarts after another tab signed out would otherwise keep a revoked credential; comparing
	 * this against the current durable generation catches that without relying on a live event.
	 */
	authGeneration?: number;
}

function normalizeMethod(value: unknown): AuthMethod | undefined {
	return value === 'login' || value === 'basic' || value === 'bearer' || value === 'cookie' ? value : undefined;
}

/** Coerce an untrusted stored `auth` into a known `ApiAuth` shape, dropping unknown types/fields. */
function normalizeAuth(value: unknown): ApiAuth | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const v = value as Record<string, unknown>;
	if (v.type === 'cookie') {
		return { type: 'cookie' };
	}
	if (v.type === 'basic') {
		return {
			type: 'basic',
			username: typeof v.username === 'string' ? v.username : '',
			password: typeof v.password === 'string' ? v.password : '',
		};
	}
	if (v.type === 'bearer') {
		return { type: 'bearer', token: typeof v.token === 'string' ? v.token : '' };
	}
	return undefined;
}

function normalizeEntity(value: unknown): ExplorerEntitySettings {
	if (!value || typeof value !== 'object') {
		return {};
	}
	const v = value as Record<string, unknown>;
	const out: ExplorerEntitySettings = {};
	const method = normalizeMethod(v.method);
	if (method) {
		out.method = method;
	}
	const auth = normalizeAuth(v.auth);
	if (auth) {
		out.auth = auth;
	}
	if (typeof v.server === 'string') {
		out.server = v.server;
	}
	if (typeof v.authServer === 'string') {
		out.authServer = v.authServer;
	}
	if (typeof v.authGeneration === 'number' && Number.isFinite(v.authGeneration)) {
		out.authGeneration = v.authGeneration;
	}
	return out;
}

/**
 * Removal of the pre-sessionStorage `localStorage` map. That map persisted Basic passwords and Bearer
 * tokens in plaintext across sessions; switching this module to sessionStorage would otherwise leave
 * the old value readable indefinitely. It's dropped wholesale (no secret is migrated). Called at app
 * bootstrap (so upgraded users who never open the explorer are still scrubbed) and again on every
 * explorer read — not one-shot, so a pre-upgrade tab that rewrites the key is re-scrubbed on the next
 * read. Idempotent and cheap (a `removeItem`).
 */
export function scrubLegacySettings(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Storage disabled by policy — nothing to scrub, nothing to fail.
	}
}

/** The whole persisted map, guarded so disabled/corrupted storage reads as empty rather than throwing. */
function readMap(): Record<string, ExplorerEntitySettings> {
	let raw: Record<string, unknown> = {};
	try {
		const stored = getSessionStorage<unknown, typeof KEY>(KEY, {});
		if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
			raw = stored as Record<string, unknown>;
		}
	} catch {
		return {};
	}
	const map: Record<string, ExplorerEntitySettings> = {};
	for (const [id, value] of Object.entries(raw)) {
		map[id] = normalizeEntity(value);
	}
	return map;
}

function writeMap(map: Record<string, ExplorerEntitySettings>): void {
	try {
		setSessionStorage<Record<string, ExplorerEntitySettings>, typeof KEY>(KEY, map);
	} catch {
		// Storage disabled/full — the in-memory state still drives the current session's requests.
	}
}

export function readEntitySettings(entityId: string): ExplorerEntitySettings {
	const map = readMap();
	return Object.hasOwn(map, entityId) ? map[entityId] ?? {} : {};
}

/** Persist one entity's settings with a fresh read-merge-write, touching only that entity's slot. */
export function writeEntitySettings(entityId: string, patch: Partial<ExplorerEntitySettings>): void {
	const map = readMap();
	map[entityId] = { ...map[entityId], ...patch };
	writeMap(map);
}

/** Drop one entity's persisted settings — used on per-entity sign-out so credentials aren't reusable. */
export function forgetEntitySettings(entityId: string): void {
	const map = readMap();
	if (Object.hasOwn(map, entityId)) {
		delete map[entityId];
		writeMap(map);
	}
}

/**
 * Strip the credential from every stored entity whose stamped generation no longer matches the current
 * one — i.e. a sign-out happened that this tab may never have observed as an event (it was reloaded, or
 * had not started yet). Non-secret state (server/method selection) is kept. The current generation is
 * injected so this module doesn't depend on the auth store (which depends on this one).
 */
export function pruneStaleEntitySettings(currentGeneration: (entityId: string) => number): void {
	const map = readMap();
	let changed = false;
	for (const [entityId, settings] of Object.entries(map)) {
		if (!settings.auth || settings.auth.type === 'cookie') {
			continue;
		}
		if ((settings.authGeneration ?? -1) !== currentGeneration(entityId)) {
			map[entityId] = { method: settings.method, server: settings.server };
			changed = true;
		}
	}
	if (changed) {
		writeMap(map);
	}
}

/** Drop every entity's persisted settings — used on a global (all-entity) sign-out. */
export function forgetAllEntitySettings(): void {
	try {
		sessionStorage.removeItem(KEY);
	} catch {
		// Storage disabled — nothing to clear.
	}
}
