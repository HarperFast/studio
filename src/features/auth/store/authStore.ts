import { isLocalStudio, localStudioDevUrl } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { getCurrentUser } from '@/features/auth/queries/getCurrentUser';
import {
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
import { isCluster } from '@/lib/types/isCluster';
import { isInstance } from '@/lib/types/isInstance';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { isDirectOperationsUrl } from '@/lib/urls/isDirectOperationsUrl';

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

class AuthStore {
	private readonly broadListeners: Array<(connection: AuthenticatedConnection, id: EntityIds) => void> = [];
	private readonly specificListeners: Record<
		EntityIds,
		Array<(connection: AuthenticatedConnection, id: EntityIds) => void>
	> = {};

	private readonly potentiallyAuthenticatedKey = 'Studio:PotentiallyAuthenticated';
	private readonly basicAuthKeyPrefix = 'Studio:BasicAuth:';
	private readonly fabricConnectKeyPrefix = 'Studio:FabricConnect:';
	private readonly lastConnectModeKeyPrefix = 'Studio:LastConnectMode:';
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

	// Sign-out generations for the API explorer, per entity plus a global `'*'` slot. The explorer keeps
	// its credential per browser tab (sessionStorage), which SURVIVES a reload — so an event-only signal
	// is not enough: a tab that reloads after another tab signed out would never see the event. The
	// generation therefore lives in localStorage (durable, shared) and each stored credential records the
	// generation it was created under, so a stale credential is detected by comparison at read time
	// regardless of whether this tab was running when the sign-out happened.
	private readonly explorerAuthEpochKey = 'Studio:ExplorerAuthEpoch';

	constructor() {
		this.potentiallyAuthenticated = JSON.parse(localStorage.getItem(this.potentiallyAuthenticatedKey) || '{}');
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
		const own = typeof generations[id] === 'number' ? generations[id] : 0;
		const all = typeof generations['*'] === 'number' ? generations['*'] : 0;
		return own + all;
	}

	private writeExplorerInvalidation(id: EntityIds | '*'): void {
		try {
			const generations = this.readExplorerGenerations();
			const current = typeof generations[id] === 'number' ? generations[id] : 0;
			// The value changes on every write, so other tabs' `storage` listeners still fire.
			localStorage.setItem(this.explorerAuthEpochKey, JSON.stringify({ ...generations, [id]: current + 1 }));
		} catch {
			// Storage disabled: the explorer's per-tab clearing on sign-out still applies within this tab.
		}
	}

	private bumpExplorerAuthEpoch(id: EntityIds): void {
		this.writeExplorerInvalidation(id);
	}

	/** Signal every tab's explorer to clear, regardless of entity — used on a global (all-entity) logout. */
	private bumpExplorerAuthEpochAll(): void {
		this.writeExplorerInvalidation('*');
	}

	/**
	 * Subscribe to a change in the explorer sign-out generation (any entity, or a global logout). The
	 * caller re-compares its own entity's stamped generation rather than trusting the event to name one,
	 * which is the same check that runs at bootstrap — so a missed event can't leave a stale credential.
	 */
	public onExplorerAuthInvalidated(_id: EntityIds, callback: () => void): () => void {
		const handler = (event: StorageEvent) => {
			if (event.key === this.explorerAuthEpochKey) {
				callback();
			}
		};
		window.addEventListener('storage', handler);
		return () => window.removeEventListener('storage', handler);
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

	public listenToAllEntities(
		listener: (connection: AuthenticatedConnection, id: EntityIds) => void,
	): AuthStoreListenerCleanup | undefined {
		if (!this.broadListeners.includes(listener)) {
			this.broadListeners.push(listener);
		}
		for (const id in this.potentiallyAuthenticated) {
			void this.ensureUserIsLoaded(id);
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
		} else {
			this.flagKeyAsSignedOut(id);
			// Every per-entity disconnect funnels through here (ClusterHome/ClusterCard call
			// setUserForEntity(entity, null)), so clear the API explorer's stored credentials for the
			// entity here too — otherwise the next user to sign into the same entity would inherit them.
			forgetEntitySettings(id);
			this.bumpExplorerAuthEpoch(id);
		}
		this.updateConnectionIfChanged(id, false, user);
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
			localStorage.setItem(this.basicAuthKeyPrefix + id, btoa(JSON.stringify(credentials)));
		} else {
			localStorage.removeItem(this.basicAuthKeyPrefix + id);
		}
	}

	public flagForFabricConnect(id: EntityIds, toggled: boolean) {
		if (toggled) {
			localStorage.setItem(this.fabricConnectKeyPrefix + id, 'true');
		} else {
			localStorage.removeItem(this.fabricConnectKeyPrefix + id);
			this.fabricConnectAuth.delete(id);
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
		const promise = this.mintFreshOperationToken(id, fabric.refreshToken);
		this.operationTokenRefreshInFlight.set(id, promise);
		return promise.finally(() => this.operationTokenRefreshInFlight.delete(id));
	}

	private async mintFreshOperationToken(id: EntityIds, refreshToken: string | undefined): Promise<string | null> {
		// Cheap path: exchange the refresh token for a new operation token, directly at the instance.
		// forceOperationToken keeps getInstanceClient on the direct URL (not the proxy) even if a stale
		// basic-auth entry exists; refreshInstanceOperationToken overrides the Bearer with the refresh token.
		if (refreshToken) {
			try {
				const token = await refreshInstanceOperationToken({
					instanceClient: getInstanceClient({ id, forceOperationToken: true }),
					refreshToken,
				});
				this.updateDirectOperationToken(id, token, refreshToken);
				return token;
			} catch (err) {
				console.debug(
					'Operation token refresh failed; re-minting via proxy',
					err instanceof Error ? err.message : err,
				);
			}
		}

		// Fall back to minting a fresh pair through the proxy.
		try {
			const { operationToken, refreshToken: newRefreshToken } = await createInstanceAuthenticationTokens({
				instanceClient: getInstanceClient({ id, forceFabricConnect: true }),
			});
			this.updateDirectOperationToken(id, operationToken, newRefreshToken ?? refreshToken);
			return operationToken;
		} catch (err) {
			console.debug('Operation token re-mint failed', err instanceof Error ? err.message : err);
			return null;
		}
	}

	/** Update the in-memory direct token, but only if a concurrent logout/flag-off hasn't cleared it. */
	private updateDirectOperationToken(id: EntityIds, token: string, refreshToken: string | undefined): void {
		if (this.fabricConnectAuth.get(id)?.mode === 'direct') {
			this.fabricConnectAuth.set(id, { mode: 'direct', token, refreshToken });
		}
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
		return promise.finally(() => this.fabricConnectInFlight.delete(id));
	}

	private async resolveFabricConnectAuth(
		id: EntityIds,
		operationsUrl: string | null | undefined,
	): Promise<LocalUser> {
		try {
			const { operationToken, refreshToken } = await createInstanceAuthenticationTokens({
				instanceClient: getInstanceClient({ id, forceFabricConnect: true }),
			});

			// Only attempt a direct Bearer connection when we have a concrete DIRECT operations URL.
			// Without one, getInstanceClient would fall back to the stored connection key, and if that
			// (or the passed URL) is a proxy URL we'd send the instance JWT to the central-manager origin.
			// In that case skip straight to the proxy fallback.
			if (isDirectOperationsUrl(operationsUrl)) {
				this.fabricConnectAuth.set(id, { mode: 'direct', token: operationToken, refreshToken });
				try {
					// forceOperationToken so a stale basic-auth entry for this id can't shadow the token we
					// just minted (basic auth otherwise wins in getInstanceClient).
					const directClient = getInstanceClient({ id, operationsUrl, forceOperationToken: true });
					const user = await getInstanceUserInfo({ instanceClient: directClient });
					this.flagForFabricConnect(id, true);
					this.setLastConnectMode(id, 'fabric');
					this.setUserForIdAndKey(id, operationsUrl, user);
					return user;
				} catch (directErr) {
					// Direct connect unreachable — fall back to the proxy. Log only the message: the full
					// axios error carries the Bearer token in error.config.headers.
					console.debug(
						'Fabric Connect direct connect unavailable; falling back to proxy',
						directErr instanceof Error ? directErr.message : directErr,
					);
				}
			}

			// Proxy fallback: route every operation through the central-manager proxy.
			this.fabricConnectAuth.set(id, { mode: 'proxy' });
			const proxyClient = getInstanceClient({ id, forceFabricConnect: true });
			const user = await getInstanceUserInfo({ instanceClient: proxyClient });
			this.flagForFabricConnect(id, true);
			this.setLastConnectMode(id, 'fabric');
			this.setUserForIdAndKey(id, operationsUrl || proxyClient.defaults.baseURL!, user);
			return user;
		} catch (err) {
			// Couldn't establish either mode — clear the half-resolved state so we retry next time.
			this.fabricConnectAuth.delete(id);
			throw err;
		}
	}

	public checkForBasicAuth(id: EntityIds): undefined | { username: string; password: string } {
		const value = localStorage.getItem(this.basicAuthKeyPrefix + id);
		return value ? JSON.parse(atob(value)) : undefined;
	}

	public checkForFabricConnect(id: EntityIds | undefined): boolean {
		return localStorage.getItem(this.fabricConnectKeyPrefix + id) === 'true';
	}

	public async signOutFromPotentiallyAuthenticatedInstances() {
		for (const entityId in this.potentiallyAuthenticated) {
			this.updateConnectionIfChanged(entityId, false, null);
			this.flagKeyAsSignedOut(entityId);
			this.fabricConnectAuth.delete(entityId);
			forgetEntitySettings(entityId);
			this.bumpExplorerAuthEpoch(entityId);
			if (entityId === OverallAppSignIn) {
				continue;
			}
			try {
				const instanceClient = getInstanceClient({ id: entityId });
				await onInstanceLogoutSubmit({ entityId, instanceClient });
			} catch (err: unknown) {
				console.error(`Failed to log out from ${entityId}, carrying on`, err);
			}
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
		this.flagForBasicAuth(id, null);
		this.flagForFabricConnect(id, false);
		this.flagKeyAsSignedOut(id);
		this.updateConnectionIfChanged(id, false, null);
		forgetEntitySettings(id);
		this.bumpExplorerAuthEpoch(id);
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
		// Snapshot keys first — signOutLocally mutates the flags as it goes.
		for (const id of Object.keys(this.potentiallyAuthenticated)) {
			this.signOutLocally(id);
		}
		this.fabricConnectAuth.clear();
		this.fabricConnectInFlight.clear();
		this.operationTokenRefreshInFlight.clear();
		this.setUserForEntity(OverallAppSignIn, null);
		// Broadcast a global clear so other tabs' explorers drop their credentials even for entities not
		// in this tab's potentiallyAuthenticated set.
		this.bumpExplorerAuthEpochAll();
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

	private flagKeyAsSignedIn(id: EntityIds, key: AuthenticatedConnectionKey) {
		if (this.potentiallyAuthenticated[id] !== key) {
			this.potentiallyAuthenticated[id] = key;
			localStorage.setItem(this.potentiallyAuthenticatedKey, JSON.stringify(this.potentiallyAuthenticated));
		}
	}

	private flagKeyAsSignedOut(id: EntityIds) {
		if (this.potentiallyAuthenticated[id]) {
			delete this.potentiallyAuthenticated[id];
			localStorage.setItem(this.potentiallyAuthenticatedKey, JSON.stringify(this.potentiallyAuthenticated));
		}
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
		if (user) {
			this.flagKeyAsSignedIn(id, key);
		} else {
			this.flagKeyAsSignedOut(id);
		}
		this.updateConnectionIfChanged(id, false, user);
		return user;
	}
}

export const authStore = new AuthStore();
