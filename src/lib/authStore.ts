import { isLocalStudio } from '@/config/constants';
import { getCloudUser } from '@/features/auth/queries/getCurrentUser';
import { getUserInfo } from '@/features/instance/operations/queries/getUserInfo';
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

export interface AuthenticatedGlobalConnection {
	isLoading: boolean;
	user: User | null;
}

export interface AuthenticatedInstanceConnection {
	isLoading: boolean;
	user: LocalUser | null;
}

export const OverallAppSignIn = 'OverallAppSignIn' as const;
type OverallAppSignInType = typeof OverallAppSignIn;

type EntityIds = OverallAppSignInType | Instance['id'] | Cluster['id'];
type EntityTypes = OverallAppSignInType | Instance | Cluster | null;

class AuthStore {
	private readonly users: Record<EntityIds, User | LocalUser | null> = {};
	private readonly loading: Record<EntityIds, boolean> = {};
	private readonly listeners: Record<EntityIds, Array<(connection: AuthenticatedConnection) => void>> = {};

	private readonly localStorageKey = 'Studio:PotentiallyAuthenticated';
	private readonly potentiallyAuthenticated: Record<EntityIds, AuthenticatedConnectionKey>;

	constructor() {
		this.potentiallyAuthenticated = JSON.parse(localStorage.getItem(this.localStorageKey) || '{}');
	}

	public listenToEntity(id: EntityIds | null | undefined, listener: (connection: AuthenticatedConnection) => void): AuthStoreListenerCleanup | undefined {
		if (!id) {
			return undefined;
		}
		if (!this.listeners[id]) {
			this.listeners[id] = [];
			void this.loadUserById(id).then(() => this.updateListeners(id));
		}
		if (!this.listeners[id].includes(listener)) {
			this.listeners[id].push(listener);
		}
		this.updateListener(id, listener);
		return () => {
			const index = this.listeners[id].indexOf(listener);
			if (index >= 0) {
				this.listeners[id].splice(index, 1);
			}
		};
	}

	public setUserForEntity(entity: EntityTypes, user: User | LocalUser | null): void {
		const id = this.calculateIdFromEntity(entity);
		const key = this.calculateKeyFromEntity(entity);
		if (!id || !key) {
			return;
		}
		this.users[key] = user;
		this.loading[key] = false;
		if (user) {
			this.flagKeyAsSignedIn(id, key);
		} else {
			this.flagKeyAsSignedOut(id);
		}
		void this.updateListeners(id);
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

	private flagKeyAsSignedIn(id: EntityIds, key: AuthenticatedConnectionKey) {
		if (this.potentiallyAuthenticated[id] !== key) {
			this.potentiallyAuthenticated[id] = key;
			localStorage.setItem(this.localStorageKey, JSON.stringify(this.potentiallyAuthenticated));
		}
	}

	private flagKeyAsSignedOut(id: EntityIds) {
		if (this.potentiallyAuthenticated[id]) {
			delete this.potentiallyAuthenticated[id];
			localStorage.setItem(this.localStorageKey, JSON.stringify(this.potentiallyAuthenticated));
		}
	}

	private async updateListeners(id: EntityIds): Promise<void> {
		await sleep(1);
		if (this.listeners[id]) {
			for (const listener of this.listeners[id]) {
				this.updateListener(id, listener);
			}
		}
	}

	private updateListener(id: EntityIds, listener: (connection: AuthenticatedConnection) => void) {
		listener({
			isLoading: this.loading[id] || false,
			user: this.users[id] || null,
		});
	}

	private async loadUserById(id: EntityIds): Promise<void> {
		if (!this.potentiallyAuthenticated[id]) {
			this.loading[id] = false;
			this.users[id] = null;
			return;
		}
		const key = this.potentiallyAuthenticated[id];
		this.loading[id] = true;
		let user: User | LocalUser | null = null;
		try {
			if (id === OverallAppSignIn) {
				if (isLocalStudio) {
					user = await getUserInfo();
				} else {
					user = await getCloudUser();
				}
			} else if (id) {
				user = await getUserInfo({ operationsUrl: key });
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
		this.users[id] = user;
		this.loading[id] = false;
	}
}

export const authStore = new AuthStore();
