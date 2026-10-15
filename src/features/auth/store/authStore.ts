import { isLocalStudio, localStudioDevUrl } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { getCurrentUser } from '@/features/auth/queries/getCurrentUser';
import {
	forgetAllEntitySettings,
	forgetEntitySettings,
	pruneStaleEntitySettings,
	scrubLegacySettings,
} from '@/features/instance/apis/explorer/settings';
import { SchemaCluster, SchemaHdbInstance } from '@/integrations/api/api.gen';
import { Cluster, Instance, LocalUser, User } from '@/integrations/api/api.patch';
import {
	createInstanceAuthenticationTokens,
	refreshInstanceOperationToken,
} from '@/integrations/api/instance/auth/createInstanceAuthenticationTokens';
import { onInstanceLogoutSubmit } from '@/integrations/api/instance/auth/onInstanceLogoutSubmit';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { sleep } from '@/lib/sleep';
import { clearLocalStorage } from '@/lib/storage/clearLocalStorage';
import { isCluster } from '@/lib/types/isCluster';
import { isInstance } from '@/lib/types/isInstance';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { isDirectOperationsUrl } from '@/lib/urls/isDirectOperationsUrl';
import {
	migrateLegacySignInMarkers,
	mirrorLegacySignInMarker,
	readLegacySignInMarkers,
	readSignInMarkers,
	signInMarkerKey,
	signInMarkerPrefix,
} from './signInMarkers';

type AuthStoreListenerCleanup = () => void;

export type AuthenticatedConnectionKey =
	| OverallAppSignInType
	| Required<SchemaHdbInstance>['instanceFqdn']
	| Required<SchemaCluster>['fqdn'];

export interface AuthenticatedConnection {
	isLoading: boolean;
	user: User | LocalUser | null;
}

export interface AuthenticatedInstanceConnection {
	isLoading: boolean;
	user: LocalUser | null;
}

export interface AuthenticatedCloudConnection {
	isLoading: boolean;
	user: User | null;
}

export const OverallAppSignIn = 'OverallAppSignIn' as const;
type OverallAppSignInType = typeof OverallAppSignIn;

export type EntityIds = OverallAppSignInType | Instance['id'] | Cluster['id'];
type EntityTypes = OverallAppSignInType | Instance | Cluster | null;

// A best-effort logout must not hold the sign-out for getInstanceClient's default 60s per unreachable instance.
const LOGOUT_TIMEOUT_MS = 10_000;

class AuthStore {
	private readonly broadListeners: Array<(connection: AuthenticatedConnection, id: EntityIds) => void> = [];
	private readonly specificListeners: Record<
		EntityIds,
		Array<(connection: AuthenticatedConnection, id: EntityIds) => void>
	> = {};

	private readonly basicAuthKeyPrefix = 'Studio:BasicAuth:';
	private readonly fabricConnectKeyPrefix = 'Studio:FabricConnect:';
	private readonly lastConnectModeKeyPrefix = 'Studio:LastConnectMode:';
	// Storage can refuse a removal yet still answer reads, so a credential it kept belongs to the session
	// that ended. This tab reads such a key as absent until a write replaces it.
	private readonly unremovedKeys = new Set<string>();
	// Sign-ins storage refused to record, which the next sign-in or check of them writes again.
	private readonly unrecordedSignIns = new Set<EntityIds>();
	private readonly potentiallyAuthenticated: Record<EntityIds, AuthenticatedConnectionKey>;
	private readonly checkedAuthentication: Record<EntityIds, boolean> = {};
	private readonly allConnections: Record<EntityIds, AuthenticatedConnection> = {};

	// In Fabric Connect mode, the JWT we exchange for direct access is kept in memory ONLY (never
	// persisted) so it can't be exfiltrated from storage. `direct` means we verified a direct Bearer
	// connection and hold its token; `proxy` means direct connect was unreachable and we fall back to
	// routing operations through the Fabric Connect proxy. A missing entry means "not yet resolved
	// this session" — re-resolved on the next instance navigation (see establishFabricConnectAuth).
	private readonly fabricConnectAuth = new Map<
		EntityIds,
		{ mode: 'direct'; token: string; refreshToken?: string } | { mode: 'proxy' }
	>();
	private readonly fabricConnectInFlight = new Map<EntityIds, Promise<LocalUser>>();
	private readonly operationTokenRefreshInFlight = new Map<EntityIds, Promise<string | null>>();
	// An entity can be disconnected and reconnected as a different user while a mint is in flight, so
	// `mode === 'direct'` alone cannot tell one connection's credential from the next one's.
	private readonly directConnectionGeneration = new Map<EntityIds, number>();
	// Sign-outs per entity plus a global `'*'` slot. Memory only, unlike the explorer's epoch below: a
	// storage clear at sign-out would otherwise reset it to a value an in-flight resolution already holds.
	private readonly signOutGenerations = new Map<EntityIds | '*', number>();

	// Sign-out generations for the API explorer, per entity plus a global `'*'` slot. The explorer keeps
	// its credential per browser tab (sessionStorage), which SURVIVES a reload — so an event-only signal
	// is not enough: a tab that reloads after another tab signed out would never see the event. The
	// generation therefore lives in localStorage (durable, shared) and each stored credential records the
	// generation it was created under, so a stale credential is detected by comparison at read time
	// regardless of whether this tab was running when the sign-out happened.
	private readonly explorerAuthEpochKey = 'Studio:ExplorerAuthEpoch';
	/** Same-tab epoch writes fire no `storage` event, so in-process subscribers are notified directly. */
	private readonly explorerInvalidationListeners = new Set<() => void>();
	private explorerSignOutUnwritten = false;
	// A full sign-out's one collapsed write covers every entity's own bump, so those are skipped while it runs.
	private fullSignOutInProgress = false;

	private readonly appSignOutKey = 'Studio:AppSignOut';
	private unannouncedSignOutUser: string | null = null;
	// The last app user this tab held, kept through the blanking a sweep or a check does until a sign-out
	// announces them or a follower drops them: the session that ends is theirs.
	private heldAppUser: string | null = null;
	private signOutHeardDuringCheck: string | null = null;

	constructor() {
		migrateLegacySignInMarkers();
		this.potentiallyAuthenticated = Object.fromEntries(readSignInMarkers());
	}

	private readExplorerGenerations(): Record<string, number> {
		try {
			const raw = JSON.parse(localStorage.getItem(this.explorerAuthEpochKey) || '{}') as unknown;
			return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, number> : {};
		} catch {
			return {};
		}
	}

	/**
	 * Current sign-out generation for an entity — its own count plus the global (`'*'`) count, so a
	 * global logout advances every entity's generation. The explorer stamps a credential with this and
	 * compares before using it (and before applying an in-flight mint).
	 */
	public getExplorerAuthEpoch(id: EntityIds): number {
		const generations = this.readExplorerGenerations();
		return countIn(generations, id) + countIn(generations, '*');
	}

	private writeExplorerInvalidation(next: (generations: Record<string, number>) => Record<string, number>): boolean {
		try {
			// The value changes on every write, so other tabs' `storage` listeners still fire.
			localStorage.setItem(this.explorerAuthEpochKey, JSON.stringify(next(this.readExplorerGenerations())));
		} catch {
			// Storage disabled or full: the durable generation doesn't move, and this tab's explorer keeps its
			// credential until the render-time comparison is re-run against a generation that does.
			return false;
		}
		// `storage` only reaches *other* tabs, so this tab's own subscribers hear it from here.
		for (const listener of this.explorerInvalidationListeners) {
			// One subscriber's failure must not abort the sign-out that is notifying it.
			try {
				listener();
			} catch (error) {
				console.error(error);
			}
		}
		return true;
	}

	private bumpExplorerAuthEpoch(id: EntityIds): void {
		if (this.fullSignOutInProgress) {
			return;
		}
		if (this.explorerSignOutUnwritten) {
			// A full sign-out storage refused is still owed, and its collapse covers this entity too.
			this.bumpExplorerAuthEpochAll();
			return;
		}
		this.writeExplorerInvalidation(generations => ({ ...generations, [id]: countIn(generations, id) + 1 }));
	}

	/**
	 * Signal every tab's explorer to clear, regardless of entity — used on a global (all-entity) logout. The
	 * record outlives the sign-out's storage wipe, so it collapses to one global slot above every entity's
	 * generation rather than carry the signed-out instances' ids into the next account's session.
	 */
	private bumpExplorerAuthEpochAll(): void {
		this.explorerSignOutUnwritten = !this.writeExplorerInvalidation(generations => {
			let highestOwn = 0;
			for (const id of Object.keys(generations)) {
				if (id !== '*') {
					highestOwn = Math.max(highestOwn, countIn(generations, id));
				}
			}
			return { '*': countIn(generations, '*') + highestOwn + 1 };
		});
	}

	/**
	 * Keeps the explorer's sign-out generation: a tab that missed the sign-out compares its stored explorer
	 * credential against it when it reloads, so removing it would make that credential current again. Then,
	 * with room made, writes what a full store refused.
	 */
	public wipeLocalStorageForSignOut(): void {
		try {
			clearLocalStorage([this.explorerAuthEpochKey]);
		} finally {
			this.retrySignOutWritesAfterWipe();
		}
	}

	private retrySignOutWritesAfterWipe(): void {
		if (this.explorerSignOutUnwritten) {
			this.bumpExplorerAuthEpochAll();
		}
		const user = this.unannouncedSignOutUser;
		// Right after the wipe is the last chance: sent any later, the announcement could end a session the user
		// has signed back into in another tab.
		this.unannouncedSignOutUser = null;
		if (user !== null && this.writeAppSignOut(user)) {
			// The other tabs have the value from the event; leaving it would carry the ended user into the next
			// account's session, which the wipe exists to prevent.
			this.removeStoredItem(this.appSignOutKey);
		}
	}

	/**
	 * Subscribe to a change in `id`'s explorer sign-out generation — its own or a global logout, which
	 * advances every entity's. The comparison lives here rather than in the caller because the signal
	 * itself names no entity: the durable epoch is one shared key, so every subscriber sees every
	 * sign-out and would otherwise act on one belonging to an instance it knows nothing about. Fires for
	 * a same-tab sign-out too, which emits no `storage` event of its own.
	 *
	 * The render-time generation comparison is still the real guard (it also catches a sign-out that
	 * happened while the tab was closed); this is about reacting promptly to one seen live.
	 */
	public onExplorerAuthInvalidated(id: EntityIds, callback: () => void): () => void {
		let observed = this.getExplorerAuthEpoch(id);
		const fire = () => {
			const epoch = this.getExplorerAuthEpoch(id);
			if (epoch === observed) {
				return;
			}
			observed = epoch;
			callback();
		};
		const onStorage = (event: StorageEvent) => {
			if (event.key === this.explorerAuthEpochKey) {
				fire();
			}
		};
		window.addEventListener('storage', onStorage);
		this.explorerInvalidationListeners.add(fire);
		// A sign-out landing between the baseline read and this line was dispatched before anyone was
		// listening, so no event will ever arrive for it. Re-check now that we are subscribed; `fire`
		// compares against the baseline, so this is a no-op unless the gap actually swallowed one.
		fire();
		return () => {
			window.removeEventListener('storage', onStorage);
			this.explorerInvalidationListeners.delete(fire);
		};
	}

	/**
	 * App-level cleanup, installed once at bootstrap. Runs immediately — reconciling credentials stored
	 * in this tab's sessionStorage (which survives a reload) against the durable generation, so a
	 * sign-out that happened while this tab was closed or reloading is still honored — and again whenever
	 * the generation changes, so an unmounted explorer's credential is dropped too.
	 */
	public installExplorerCrossTabCleanup(): () => void {
		const reconcile = () => {
			pruneStaleEntitySettings(entityId => this.getExplorerAuthEpoch(entityId));
			scrubLegacySettings();
		};
		reconcile();
		const handler = (event: StorageEvent) => {
			if (event.key === this.explorerAuthEpochKey) {
				reconcile();
			}
		};
		window.addEventListener('storage', handler);
		return () => window.removeEventListener('storage', handler);
	}

	public getAllConnections(): Record<EntityIds, AuthenticatedConnection> {
		if (!this.potentiallyAuthenticated.OverallAppSignIn) {
			this.allConnections[OverallAppSignIn] = {
				user: null,
				isLoading: false,
			};
		}
		return this.allConnections;
	}

	public getConnectionById(id: EntityIds): AuthenticatedConnection {
		if (!this.allConnections[id]) {
			this.allConnections[id] = {
				user: null,
				isLoading: !!this.potentiallyAuthenticated[id],
			};
		}
		return this.allConnections[id];
	}

	/**
	 * Whether this page load already knows `id` is signed out: its check came back with no user, or a sign-out
	 * cleared it.
	 */
	public isKnownSignedOut(id: EntityIds): boolean {
		const connection = this.allConnections[id];
		return !!this.checkedAuthentication[id] && !!connection && !connection.isLoading && !connection.user;
	}

	public listenToAllEntities(
		listener: (connection: AuthenticatedConnection, id: EntityIds) => void,
	): AuthStoreListenerCleanup | undefined {
		if (!this.broadListeners.includes(listener)) {
			this.broadListeners.push(listener);
		}
		// Only the app sign-in: the markers span every organization ever visited. An instance or cluster
		// is checked once something subscribes to it, or the instance guard navigates into it.
		if (this.potentiallyAuthenticated[OverallAppSignIn]) {
			this.startSignInCheck(OverallAppSignIn);
		}
		return () => {
			const index = this.broadListeners.indexOf(listener);
			if (index >= 0) {
				this.broadListeners.splice(index, 1);
			}
		};
	}

	public listenToEntity(
		id: EntityIds | null | undefined,
		listener: (connection: AuthenticatedConnection) => void,
	): AuthStoreListenerCleanup | undefined {
		if (!id) {
			return undefined;
		}
		if (!this.specificListeners[id]) {
			this.specificListeners[id] = [];
		}
		if (!this.specificListeners[id].includes(listener)) {
			this.specificListeners[id].push(listener);
		}
		void this.ensureUserIsLoaded(id);
		return () => {
			const index = this.specificListeners[id].indexOf(listener);
			if (index >= 0) {
				this.specificListeners[id].splice(index, 1);
			}
		};
	}

	public setUserForEntity(entity: EntityTypes, user: AuthenticatedConnection['user']): void {
		const id = this.calculateIdFromEntity(entity);
		const key = this.calculateKeyFromEntity(entity);
		if (!id || !key) {
			return;
		}
		return this.setUserForIdAndKey(id, key, user);
	}

	public setUserForIdAndKey(
		id: EntityIds,
		key: AuthenticatedConnectionKey,
		user: AuthenticatedConnection['user'],
	): void {
		if (user) {
			this.flagKeyAsSignedIn(id, key);
			this.updateConnectionIfChanged(id, false, user);
		} else {
			// Clears the API explorer's stored credentials too, or the next user to sign into this entity
			// would inherit them.
			this.clearSignIn(id);
		}
	}

	public updateUserForEntity(entity: EntityTypes, changes: Partial<AuthenticatedConnection['user']>): void {
		const id = this.calculateIdFromEntity(entity);
		if (!id) {
			return;
		}
		const connection = this.getConnectionById(id);
		if (!connection.user) {
			return;
		}
		this.updateConnectionIfChanged(id, false, {
			...connection.user,
			...changes,
		});
	}

	public calculateIdFromEntity(entity: EntityTypes | EntityIds | undefined): EntityIds | undefined {
		if (isLocalStudio || entity === OverallAppSignIn) {
			return OverallAppSignIn;
		}
		if (isInstance(entity)) {
			return entity.id;
		}
		if (isCluster(entity)) {
			return entity.id;
		}
		if (typeof entity === 'string') {
			return entity;
		}
		return undefined;
	}

	public flagForBasicAuth(id: EntityIds, credentials: null | { username: string; password: string }) {
		if (credentials !== null) {
			this.writeStoredItem(this.basicAuthKeyPrefix + id, btoa(JSON.stringify(credentials)));
		} else {
			this.removeStoredItem(this.basicAuthKeyPrefix + id);
		}
	}

	public flagForFabricConnect(id: EntityIds, toggled: boolean) {
		if (toggled) {
			this.writeStoredItem(this.fabricConnectKeyPrefix + id, 'true');
		} else {
			this.fabricConnectAuth.delete(id);
			this.bumpConnectionGeneration(id);
			this.removeStoredItem(this.fabricConnectKeyPrefix + id);
		}
	}

	private readStoredItem(key: string): string | null {
		return this.unremovedKeys.has(key) ? null : localStorage.getItem(key);
	}

	private writeStoredItem(key: string, value: string): void {
		localStorage.setItem(key, value);
		this.unremovedKeys.delete(key);
	}

	/** `console.error`, not `debug`: a credential storage kept is worth an Error Tracking entry. */
	private removeStoredItem(key: string): void {
		try {
			localStorage.removeItem(key);
			this.unremovedKeys.delete(key);
		} catch (error) {
			console.error(error);
			try {
				// Every reader treats an empty value as absent, and unlike the in-memory set it outlives a reload.
				this.writeStoredItem(key, '');
			} catch {
				this.unremovedKeys.add(key);
			}
		}
	}

	/**
	 * Remembers which connection mode the user last chose for an entity, so the cluster landing page
	 * can highlight it with a "Last used" pill. Persisted (unlike the JWT) — it's a preference, not a
	 * secret.
	 */
	public setLastConnectMode(id: EntityIds, mode: 'fabric' | 'direct') {
		localStorage.setItem(this.lastConnectModeKeyPrefix + id, mode);
	}

	public getLastConnectMode(id: EntityIds): 'fabric' | 'direct' | undefined {
		const value = localStorage.getItem(this.lastConnectModeKeyPrefix + id);
		return value === 'fabric' || value === 'direct' ? value : undefined;
	}

	/**
	 * Moves on every sign-out of `id`, and of everything. An auth resolution reads it before its first
	 * await and commits only if it has not moved, so a result that outlived its session is dropped.
	 */
	public getSignOutGeneration(id: EntityIds): number {
		return (this.signOutGenerations.get(id) ?? 0) + (this.signOutGenerations.get('*') ?? 0);
	}

	private bumpSignOutGeneration(id: EntityIds | '*'): void {
		this.signOutGenerations.set(id, (this.signOutGenerations.get(id) ?? 0) + 1);
	}

	public getConnectionGeneration(id: EntityIds): number {
		return this.directConnectionGeneration.get(id) ?? 0;
	}

	private bumpConnectionGeneration(id: EntityIds): void {
		this.directConnectionGeneration.set(id, this.getConnectionGeneration(id) + 1);
		this.operationTokenRefreshInFlight.delete(id);
	}

	/** The in-memory Fabric Connect JWT for direct connect, or undefined if not connected directly. */
	public getOperationToken(id: EntityIds): string | undefined {
		const fabric = this.fabricConnectAuth.get(id);
		return fabric?.mode === 'direct' ? fabric.token : undefined;
	}

	/** Whether Fabric Connect auth has been resolved (direct or proxy) for this id this session. */
	public hasResolvedFabricConnect(id: EntityIds): boolean {
		return this.fabricConnectAuth.has(id);
	}

	/**
	 * True when operations for this id go straight to the instance (Basic auth, a direct
	 * operation-token Bearer, or a non-Fabric-Connect direct URL) rather than through the
	 * central-manager proxy. The proxy buffers `text/event-stream`, so only direct
	 * connections can consume SSE live — callers gate streaming features on this.
	 */
	public isDirectConnection(id: EntityIds): boolean {
		// A direct operation token always streams straight from the instance. Otherwise it's
		// direct only when Fabric Connect isn't in play — when the flag is set with no token,
		// operations route through the buffering proxy (proxy wins, mirroring getInstanceClient).
		if (this.getOperationToken(id)) {
			return true;
		}
		return !this.checkForFabricConnect(id);
	}

	/**
	 * Recovers a fresh operation token for a direct-connect id whose token was rejected (typically 401
	 * from mid-session expiry — Harper operation tokens default to ~1 day). Prefers exchanging the
	 * refresh token directly at the instance; falls back to re-minting a fresh pair through the proxy.
	 * Returns the new token, or null if recovery failed or the id isn't in direct mode. Concurrent
	 * callers for the same id share one recovery.
	 */
	public recoverExpiredOperationToken(id: EntityIds): Promise<string | null> {
		const fabric = this.fabricConnectAuth.get(id);
		if (fabric?.mode !== 'direct') {
			return Promise.resolve(null);
		}
		const inFlight = this.operationTokenRefreshInFlight.get(id);
		if (inFlight) {
			return inFlight;
		}
		const generation = this.getConnectionGeneration(id);
		const promise = this.mintFreshOperationToken(id, fabric.refreshToken, generation);
		this.operationTokenRefreshInFlight.set(id, promise);
		return promise.finally(() => {
			// Only evict our own entry: a reconnect clears the map, and the replacement connection may
			// already have registered its refresh by the time this one settles.
			if (this.operationTokenRefreshInFlight.get(id) === promise) {
				this.operationTokenRefreshInFlight.delete(id);
			}
		});
	}

	private async mintFreshOperationToken(
		id: EntityIds,
		refreshToken: string | undefined,
		generation: number,
	): Promise<string | null> {
		// Cheap path: exchange the refresh token for a new operation token, directly at the instance.
		// forceOperationToken keeps getInstanceClient on the direct URL (not the proxy) even if a stale
		// basic-auth entry exists; refreshInstanceOperationToken overrides the Bearer with the refresh token.
		if (refreshToken) {
			try {
				const token = await refreshInstanceOperationToken({
					instanceClient: getInstanceClient({ id, forceOperationToken: true, disableTokenRecovery: true }),
					refreshToken,
				});
				return this.updateDirectOperationToken(id, token, refreshToken, generation) ? token : null;
			} catch (err) {
				console.debug(
					'Operation token refresh failed; re-minting via proxy',
					err instanceof Error ? err.message : err,
				);
			}
		}

		// Fall back to minting a fresh pair through the proxy.
		if (this.getConnectionGeneration(id) !== generation) {
			return null;
		}
		try {
			const { operationToken, refreshToken: newRefreshToken } = await createInstanceAuthenticationTokens({
				instanceClient: getInstanceClient({ id, forceFabricConnect: true }),
			});
			return this.updateDirectOperationToken(id, operationToken, newRefreshToken ?? refreshToken, generation)
				? operationToken
				: null;
		} catch (err) {
			console.debug('Operation token re-mint failed', err instanceof Error ? err.message : err);
			return null;
		}
	}

	/**
	 * Commit a freshly minted direct token, but only onto the connection that asked for it: a
	 * drop-and-reconnect leaves `mode` unchanged while the identity behind it changes.
	 */
	private updateDirectOperationToken(
		id: EntityIds,
		token: string,
		refreshToken: string | undefined,
		generation: number,
	): boolean {
		if (this.fabricConnectAuth.get(id)?.mode !== 'direct' || this.getConnectionGeneration(id) !== generation) {
			return false;
		}
		this.fabricConnectAuth.set(id, { mode: 'direct', token, refreshToken });
		return true;
	}

	/**
	 * Establishes Fabric Connect auth for an instance/cluster: grabs a JWT through the proxy, then
	 * tries to use it to connect to the instance directly (Bearer token, no proxy). If the instance
	 * isn't directly reachable (e.g. CORS/mixed-content from cloud Studio to a local instance), we
	 * drop the token and fall back to routing everything through the proxy. The verified user is
	 * recorded in the connection state either way. The JWT is held in memory only.
	 *
	 * Concurrent calls for the same id share one in-flight request.
	 */
	public establishFabricConnectAuth(
		{ id, operationsUrl }: { id: EntityIds; operationsUrl?: string | null },
	): Promise<LocalUser> {
		const inFlight = this.fabricConnectInFlight.get(id);
		if (inFlight) {
			return inFlight;
		}
		const promise = this.resolveFabricConnectAuth(id, operationsUrl);
		this.fabricConnectInFlight.set(id, promise);
		return promise.finally(() => {
			// A sign-out empties the map, so a replacement may already be registered under this id.
			if (this.fabricConnectInFlight.get(id) === promise) {
				this.fabricConnectInFlight.delete(id);
			}
		});
	}

	private async resolveFabricConnectAuth(
		id: EntityIds,
		operationsUrl: string | null | undefined,
	): Promise<LocalUser> {
		const signOutGeneration = this.getSignOutGeneration(id);
		const throwIfSignedOut = () => {
			if (this.getSignOutGeneration(id) !== signOutGeneration) {
				throw new SignedOutWhileConnectingError();
			}
		};
		let claimedGeneration: number | undefined;
		const claim = (auth: { mode: 'direct'; token: string; refreshToken?: string } | { mode: 'proxy' }) => {
			this.bumpConnectionGeneration(id);
			claimedGeneration = this.getConnectionGeneration(id);
			this.fabricConnectAuth.set(id, auth);
		};
		try {
			const { operationToken, refreshToken } = await createInstanceAuthenticationTokens({
				instanceClient: getInstanceClient({ id, forceFabricConnect: true }),
			});
			throwIfSignedOut();

			// Only attempt a direct Bearer connection when we have a concrete DIRECT operations URL.
			// Without one, getInstanceClient would fall back to the stored connection key, and if that
			// (or the passed URL) is a proxy URL we'd send the instance JWT to the central-manager origin.
			// In that case skip straight to the proxy fallback.
			if (isDirectOperationsUrl(operationsUrl)) {
				claim({ mode: 'direct', token: operationToken, refreshToken });
				let directUser: LocalUser | undefined;
				try {
					// forceOperationToken so a stale basic-auth entry for this id can't shadow the token we
					// just minted (basic auth otherwise wins in getInstanceClient).
					const directClient = getInstanceClient({ id, operationsUrl, forceOperationToken: true });
					directUser = await getInstanceUserInfo({ instanceClient: directClient });
				} catch (directErr) {
					// Direct connect unreachable — fall back to the proxy. Log only the message: the full
					// axios error carries the Bearer token in error.config.headers.
					console.debug(
						'Fabric Connect direct connect unavailable; falling back to proxy',
						directErr instanceof Error ? directErr.message : directErr,
					);
				}
				throwIfSignedOut();
				if (directUser) {
					this.flagForFabricConnect(id, true);
					this.setLastConnectMode(id, 'fabric');
					this.setUserForIdAndKey(id, operationsUrl, directUser);
					return directUser;
				}
			}

			// Proxy fallback: route every operation through the central-manager proxy.
			claim({ mode: 'proxy' });
			const proxyClient = getInstanceClient({ id, forceFabricConnect: true });
			const user = await getInstanceUserInfo({ instanceClient: proxyClient });
			throwIfSignedOut();
			this.flagForFabricConnect(id, true);
			this.setLastConnectMode(id, 'fabric');
			this.setUserForIdAndKey(id, operationsUrl || proxyClient.defaults.baseURL!, user);
			return user;
		} catch (err) {
			// Couldn't establish either mode — clear the half-resolved state so we retry next time. Only
			// this resolution's own: after a sign-out, a newer one for the same id may have claimed it.
			const ownsState = claimedGeneration === undefined
				? this.getSignOutGeneration(id) === signOutGeneration
				: this.getConnectionGeneration(id) === claimedGeneration;
			if (ownsState) {
				this.fabricConnectAuth.delete(id);
				this.bumpConnectionGeneration(id);
			}
			throw err;
		}
	}

	public checkForBasicAuth(id: EntityIds): undefined | { username: string; password: string } {
		const value = this.readStoredItem(this.basicAuthKeyPrefix + id);
		return value ? JSON.parse(atob(value)) : undefined;
	}

	public checkForFabricConnect(id: EntityIds | undefined): boolean {
		return this.readStoredItem(this.fabricConnectKeyPrefix + id) === 'true';
	}

	public async signOutFromPotentiallyAuthenticatedInstances() {
		// Dooms connects for entities not yet marked, which the loop skips.
		this.bumpSignOutGeneration('*');
		forgetAllEntitySettings();
		const signIns = this.rememberedSignIns();
		// Built first: the clears below drop the credentials and token they are built with.
		const clients = signIns.map(([entityId, operationsUrl]) => this.buildLogoutClient(entityId, operationsUrl));
		for (const entityId of new Set(signIns.map(([entityId]) => entityId))) {
			this.signOutLocally(entityId);
		}
		const logouts = signIns.flatMap(([entityId], index) => {
			const instanceClient = clients[index];
			return instanceClient ? [this.sendBestEffortLogout(entityId, instanceClient)] : [];
		});
		// After the logout clients are built, which carry their credential in a header of their own. A
		// failed CM logout skips `signOutAllLocally`, so this is the only clear those connects get.
		this.dropFabricConnectState();
		await Promise.all(logouts);
	}

	private buildLogoutClient(entityId: EntityIds, operationsUrl?: string): ReturnType<typeof getInstanceClient> | null {
		if (entityId === OverallAppSignIn) {
			return null;
		}
		try {
			const instanceClient = getInstanceClient({ id: entityId, operationsUrl });
			instanceClient.defaults.timeout = LOGOUT_TIMEOUT_MS;
			// No gateway-error retries (5s + 10s + 20s) and no token recovery for a best-effort logout.
			instanceClient.interceptors.response.clear();
			// The request interceptor re-reads the store at send time, and the caller clears the store
			// before posting — leaving it on would strip the very credential the logout must present.
			// The constructor-baked header carries it instead.
			instanceClient.interceptors.request.clear();
			return instanceClient;
		} catch (err: unknown) {
			reportLogoutFailure(entityId, err);
			return null;
		}
	}

	/**
	 * Clears every locally-held credential and flag for an entity — the potentially-authenticated
	 * marker, stored basic-auth credentials, the Fabric Connect flag and its in-memory token, and the
	 * API explorer's persisted server/credentials — without posting a logout to it. For when a
	 * server-side logout elsewhere already invalidated the entity's session, e.g. signing out of an
	 * instance also signs Studio out of its cluster.
	 */
	public signOutLocally(id: EntityIds): void {
		this.clearSignIn(id);
		this.flagForBasicAuth(id, null);
		this.flagForFabricConnect(id, false);
	}

	/** Never throws: one id that fails to clear must not keep the rest, or fail the caller's own work. */
	public signOutEntitiesLocally(ids: Iterable<EntityIds>): void {
		for (const id of new Set(ids)) {
			try {
				this.signOutLocally(id);
			} catch (error) {
				console.error(error);
			}
		}
	}

	/** For a server that outlives Studio's record of it. Never rejects. */
	public async signOutEntities(ids: Iterable<EntityIds>): Promise<void> {
		const unique = [...new Set(ids)];
		const signIns = this.rememberedSignIns();
		const logouts = unique.flatMap((entityId) =>
			signIns.filter(([id]) => id === entityId).map(([, operationsUrl]) => ({
				entityId,
				instanceClient: this.buildLogoutClient(entityId, operationsUrl),
			}))
		);
		this.signOutEntitiesLocally(unique);
		await Promise.all(
			logouts.map(({ entityId, instanceClient }) =>
				instanceClient ? this.sendBestEffortLogout(entityId, instanceClient) : Promise.resolve()
			),
		);
	}

	/** Sent after the caller has forgotten `entityId`, so whatever is recorded for it by the answer, in any tab, is newer. */
	private sendBestEffortLogout(
		entityId: EntityIds,
		instanceClient: ReturnType<typeof getInstanceClient>,
	): Promise<void> {
		const sentWith = this.signInSnapshot(entityId);
		const signedInSince = () => this.signInSnapshot(entityId) !== sentWith;
		return onInstanceLogoutSubmit({ entityId, instanceClient, signedInSince }).then(
			() => undefined,
			(err: unknown) => reportLogoutFailure(entityId, err),
		);
	}

	/**
	 * This tab's sign-ins, every stored one, and every one a previous-release tab recorded, once per URL: another tab
	 * may have signed in again at a newer URL, and the older one's session is still open. A sweep that reaches more
	 * only signs more out.
	 */
	private rememberedSignIns(): Array<[EntityIds, AuthenticatedConnectionKey]> {
		const signIns = [
			...Object.entries(this.potentiallyAuthenticated),
			...readSignInMarkers(),
			...Object.entries(readLegacySignInMarkers() ?? {}),
		];
		return signIns.filter(([id, key], index) => signIns.findIndex(([i, k]) => i === id && k === key) === index);
	}

	/** Read raw, not through `readStoredItem`, because another tab may have written them. */
	private signInSnapshot(id: EntityIds): string {
		const stored = (key: string) => {
			try {
				return localStorage.getItem(key);
			} catch {
				return null;
			}
		};
		return JSON.stringify([
			stored(this.basicAuthKeyPrefix + id),
			stored(this.fabricConnectKeyPrefix + id),
			this.getConnectionGeneration(id),
		]);
	}

	private clearSignIn(id: EntityIds): void {
		this.bumpSignOutGeneration(id);
		// That attempt will now reject; the next connect for this id must not join it.
		this.fabricConnectInFlight.delete(id);
		this.updateConnectionIfChanged(id, false, null);
		this.flagKeyAsSignedOut(id);
		forgetEntitySettings(id);
		this.bumpExplorerAuthEpoch(id);
	}

	/** Every in-memory Fabric Connect token and in-flight connect, for all entities. */
	private dropFabricConnectState(): void {
		for (const id of this.fabricConnectAuth.keys()) {
			this.bumpConnectionGeneration(id);
		}
		this.fabricConnectAuth.clear();
		this.fabricConnectInFlight.clear();
		this.operationTokenRefreshInFlight.clear();
	}

	/**
	 * Local-only full sign-out: clears every in-memory connection, Fabric token,
	 * and flag for ALL entities, plus the cloud slot — WITHOUT posting a logout to
	 * CM or any instance. For a session already known-dead (e.g. a 401 from CM),
	 * where the in-memory maps would otherwise survive until a page reload and a
	 * same-tab re-login could inherit the prior user's connections/tokens/cache.
	 * Distinct from signOutFromPotentiallyAuthenticatedInstances, which also posts
	 * per-instance logouts.
	 */
	public signOutAllLocally(): void {
		const endedUser = this.heldAppUser;
		this.heldAppUser = null;
		try {
			this.fullSignOutInProgress = true;
			this.bumpSignOutGeneration('*');
			forgetAllEntitySettings();
			// Snapshot keys first — signOutLocally mutates the flags as it goes.
			for (const id of new Set(this.rememberedSignIns().map(([id]) => id))) {
				this.signOutLocally(id);
			}
			this.dropFabricConnectState();
			this.setUserForEntity(OverallAppSignIn, null);
		} finally {
			this.fullSignOutInProgress = false;
			// Broadcast a global clear so other tabs' explorers drop their credentials even for entities not
			// in this tab's potentiallyAuthenticated set, or skipped by a step above that threw.
			this.bumpExplorerAuthEpochAll();
			this.announceAppSignOut(endedUser);
		}
	}

	private appUser(): string | null {
		return userIdentity(this.allConnections[OverallAppSignIn]?.user);
	}

	private announceAppSignOut(user: string | null): void {
		this.unannouncedSignOutUser = user !== null && !this.writeAppSignOut(user) ? user : null;
	}

	private writeAppSignOut(user: string): boolean {
		try {
			// A new value every time, since storage fires an event only for a change.
			localStorage.setItem(this.appSignOutKey, JSON.stringify({ user, at: `${Date.now()}:${Math.random()}` }));
			return true;
		} catch (error) {
			console.debug('Could not tell the other tabs about this sign-out', error);
			return false;
		}
	}

	public onAppSignedOutElsewhere(onSignedOut: () => void): () => void {
		const handler = (event: StorageEvent) => {
			if (event.key !== this.appSignOutKey || !event.newValue) {
				return;
			}
			const ended = signedOutUser(event.newValue);
			const user = this.appUser();
			if (user !== null) {
				if (ended === user) {
					onSignedOut();
				}
			} else if (typeof ended === 'string' && this.allConnections[OverallAppSignIn]?.isLoading) {
				this.signOutHeardDuringCheck = ended;
			}
		};
		window.addEventListener('storage', handler);
		return () => window.removeEventListener('storage', handler);
	}

	public forgetAppSignInEndedElsewhere(): void {
		this.heldAppUser = null;
		this.bumpSignOutGeneration('*');
		forgetAllEntitySettings();
		const entityIds = new Set([...Object.keys(this.potentiallyAuthenticated), ...Object.keys(this.allConnections)]);
		entityIds.delete(OverallAppSignIn);
		for (const id of Object.keys(this.potentiallyAuthenticated)) {
			delete this.potentiallyAuthenticated[id];
		}
		this.dropFabricConnectState();
		for (const id of entityIds) {
			this.updateConnectionIfChanged(id, false, null);
		}
		this.updateConnectionIfChanged(OverallAppSignIn, false, null);
	}

	private calculateKeyFromEntity(entity: EntityTypes): AuthenticatedConnectionKey | undefined {
		if (isLocalStudio || entity === OverallAppSignIn) {
			return OverallAppSignIn;
		}
		if (isInstance(entity)) {
			return getOperationsUrlForInstance(entity);
		}
		if (isCluster(entity)) {
			return getOperationsUrlForCluster(entity) || undefined;
		}
		return undefined;
	}

	private updateConnectionIfChanged(id: EntityIds, isLoading: boolean, user: AuthenticatedConnection['user']) {
		this.checkedAuthentication[id] = true;
		if (id === OverallAppSignIn && user) {
			this.heldAppUser = userIdentity(user);
		}
		const connection = this.getConnectionById(id);
		if (connection.isLoading === isLoading && connection.user === user) {
			return;
		}
		// Replace the connection instead of mutating it: listeners hand the
		// connection to React state setters, which bail out when they receive
		// the same object reference and would never re-render.
		this.allConnections[id] = { isLoading, user };
		void this.updateListeners(id);
	}

	/** Other tabs, and the next load, read a marker this tab couldn't remove, so every marker write tries again. */
	private retryUnremovedSignInMarkers(): void {
		for (const key of this.unremovedKeys) {
			if (key.startsWith(signInMarkerPrefix)) {
				try {
					localStorage.removeItem(key);
					this.unremovedKeys.delete(key);
				} catch {
					// The next marker write tries again.
				}
			}
		}
	}

	// A check of a sign-in this tab already marked writes nothing, so it can't put back a marker another tab's
	// sign-out removed.
	private flagKeyAsSignedIn(id: EntityIds, key: AuthenticatedConnectionKey) {
		if (this.potentiallyAuthenticated[id] === key && !this.unrecordedSignIns.has(id)) {
			return;
		}
		this.potentiallyAuthenticated[id] = key;
		this.retryUnremovedSignInMarkers();
		try {
			this.writeStoredItem(signInMarkerKey(id), key);
			this.unrecordedSignIns.delete(id);
		} catch (error) {
			// Not thrown: the sign-in itself worked, and unrecorded it only looks signed out on the next load.
			this.unrecordedSignIns.add(id);
			console.debug('Could not record a sign-in', error);
		}
		mirrorLegacySignInMarker(id, key);
	}

	/** `checkedKey`: the URL a failed check used, which says nothing about a newer one another tab stored. */
	private flagKeyAsSignedOut(id: EntityIds, checkedKey?: AuthenticatedConnectionKey) {
		delete this.potentiallyAuthenticated[id];
		this.unrecordedSignIns.delete(id);
		this.retryUnremovedSignInMarkers();
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(signInMarkerKey(id));
		} catch {
			// Unreadable, so there is nothing this tab can remove.
		}
		if (checkedKey !== undefined && stored && stored !== checkedKey) {
			return;
		}
		if (stored) {
			// Blanks or hides a marker storage won't remove: one left behind makes the next page load probe this
			// entity with its cookies, and a session that outlived the sign-out would sign it back in.
			this.removeStoredItem(signInMarkerKey(id));
		}
		mirrorLegacySignInMarker(id, null, checkedKey);
	}

	private async updateListeners(id: EntityIds): Promise<void> {
		await sleep(1);
		if (this.broadListeners) {
			for (const listener of this.broadListeners) {
				this.updateListener(id, listener);
			}
		}
		if (this.specificListeners[id]) {
			for (const listener of this.specificListeners[id]) {
				this.updateListener(id, listener);
			}
		}
	}

	private updateListener(id: EntityIds, listener: (connection: AuthenticatedConnection, id: EntityIds) => void) {
		listener(this.getConnectionById(id), id);
	}

	/**
	 * Starts checking whether the remembered sign-in for `id` is still live. Does nothing once this page
	 * load has started, or settled, that entity's check; the answer arrives through the listeners.
	 */
	public startSignInCheck(id: EntityIds): void {
		if (!this.checkedAuthentication[id]) {
			void this.ensureUserIsLoaded(id);
		}
	}

	private async ensureUserIsLoaded(id: EntityIds): Promise<void> {
		if (this.checkedAuthentication[id]) {
			return;
		}
		await this.reloadUser(id);
	}

	public getOperationsUrl(id: EntityIds): string | undefined {
		if (isLocalStudio) {
			return localStudioDevUrl;
		}
		if (id === OverallAppSignIn) {
			return this.potentiallyAuthenticated[OverallAppSignIn];
		}
		return this.potentiallyAuthenticated[id];
	}

	public async reloadUser(id: EntityIds): Promise<AuthenticatedConnection['user']> {
		if (!this.potentiallyAuthenticated[id]) {
			this.updateConnectionIfChanged(id, false, null);
			return null;
		}
		return this.loadUser(id);
	}

	private async loadUser(id: EntityIds): Promise<AuthenticatedConnection['user']> {
		const key = this.potentiallyAuthenticated[id];
		const signOutGeneration = this.getSignOutGeneration(id);
		this.updateConnectionIfChanged(id, true, null);
		let user: AuthenticatedConnection['user'] = null;
		try {
			if (id === OverallAppSignIn) {
				if (isLocalStudio) {
					user = await getInstanceUserInfo({ instanceClient: getInstanceClient() });
				} else {
					user = await getCurrentUser();
				}
			} else if (id) {
				user = await getInstanceUserInfo({ instanceClient: getInstanceClient({ id }) });
			}
		} catch (error) {
			// TODO: Only catch the errors we expect here (401? 403? w/e)
			console.error(error);
			user = null;
		}
		const signOutHeard = id === OverallAppSignIn ? this.signOutHeardDuringCheck : null;
		if (id === OverallAppSignIn) {
			this.signOutHeardDuringCheck = null;
		}
		if (this.getSignOutGeneration(id) !== signOutGeneration) {
			return null;
		}
		if (this.potentiallyAuthenticated[id] !== key) {
			// This tab signed in again at another URL while the check was out, so its answer is about a sign-in that ended.
			return this.getConnectionById(id).user;
		}
		if (user) {
			this.flagKeyAsSignedIn(id, key);
		} else {
			this.flagKeyAsSignedOut(id, key);
		}
		this.updateConnectionIfChanged(id, false, user);
		if (signOutHeard !== null && signOutHeard === this.appUser()) {
			void this.reloadUser(id);
		}
		return user;
	}
}

class SignedOutWhileConnectingError extends Error {
	constructor() {
		super('Signed out before Fabric Connect finished connecting.');
		this.name = 'SignedOutWhileConnectingError';
	}
}

function userIdentity(user: AuthenticatedConnection['user'] | undefined): string | null {
	const identity: unknown = !user ? null : 'id' in user ? user.id : user.username;
	return typeof identity === 'string' && identity ? identity : null;
}

function signedOutUser(announcement: string): unknown {
	try {
		return (JSON.parse(announcement) as { user?: unknown } | null)?.user;
	} catch {
		return undefined;
	}
}

function countIn(generations: Record<string, number>, slot: string): number {
	return typeof generations[slot] === 'number' ? generations[slot] : 0;
}

// `console.debug`, never `console.error`: the RUM SDK reports `console.error` as an error, which would
// put a failure the sign-out deliberately carries past into Error Tracking. Message only: the full
// Axios error carries the request credentials.
function reportLogoutFailure(entityId: EntityIds, err: unknown): void {
	console.debug(`Failed to log out from ${entityId}, carrying on`, err instanceof Error ? err.message : err);
}

export const authStore = new AuthStore();
