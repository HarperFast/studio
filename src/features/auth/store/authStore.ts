import { isLocalStudio, localStudioDevUrl } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { getCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { onInstanceLogoutSubmit } from '@/features/instance/operations/mutations/onInstanceLogoutSubmit';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { SchemaCluster, SchemaHdbInstance } from '@/lib/api.gen';
import { Cluster, Instance, LocalUser, User } from '@/lib/api.patch';
import { sleep } from '@/lib/sleep';
import { isCluster } from '@/lib/types/isCluster';
import { isInstance } from '@/lib/types/isInstance';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';

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
	private readonly specificListeners: Record<EntityIds, Array<(connection: AuthenticatedConnection, id: EntityIds) => void>> = {};

	private readonly potentiallyAuthenticatedKey = 'Studio:PotentiallyAuthenticated';
	private readonly basicAuthKeyPrefix = 'Studio:BasicAuth:';
	private readonly potentiallyAuthenticated: Record<EntityIds, AuthenticatedConnectionKey>;
	private readonly checkedAuthentication: Record<EntityIds, boolean> = {};
	private readonly allConnections: Record<EntityIds, AuthenticatedConnection> = {};

	constructor() {
		this.potentiallyAuthenticated = JSON.parse(localStorage.getItem(this.potentiallyAuthenticatedKey) || '{}');
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

	public listenToAllEntities(listener: (connection: AuthenticatedConnection, id: EntityIds) => void): AuthStoreListenerCleanup | undefined {
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

	public listenToEntity(id: EntityIds | null | undefined, listener: (connection: AuthenticatedConnection) => void): AuthStoreListenerCleanup | undefined {
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
		if (user) {
			this.flagKeyAsSignedIn(id, key);
		} else {
			this.flagKeyAsSignedOut(id);
		}
		this.updateConnectionIfChanged(id, false, user);
	}

	public updateUserForEntity(entity: EntityTypes, changes: Partial<AuthenticatedConnection['user']>): void {
		const id = this.calculateIdFromEntity(entity);
		const key = this.calculateKeyFromEntity(entity);
		if (!id || !key) {
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

	public flagForBasicAuth(id: EntityIds, credentials: null | { username: string; password: string; }) {
		if (credentials === null) {
			localStorage.removeItem(this.basicAuthKeyPrefix + id);
		} else {
			localStorage.setItem(this.basicAuthKeyPrefix + id, btoa(JSON.stringify(credentials)));
		}
	}

	public checkForBasicAuth(id: EntityIds): undefined | { username: string; password: string; } {
		const value = localStorage.getItem(this.basicAuthKeyPrefix + id);
		return value ? JSON.parse(atob(value)) : undefined;
	}

	public async signOutFromPotentiallyAuthenticatedInstances() {
		for (const entityId in this.potentiallyAuthenticated) {
			this.allConnections[entityId].user = null;
			this.allConnections[entityId].isLoading = false;
			this.flagKeyAsSignedOut(entityId);
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
		let changes = false;
		if (connection.isLoading !== isLoading) {
			connection.isLoading = isLoading;
			changes = true;
		}
		if (connection.user !== user) {
			connection.user = user;
			changes = true;
		}
		if (changes) {
			void this.updateListeners(id);
		}
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
