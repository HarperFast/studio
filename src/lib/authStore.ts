import { Cluster, Instance, LocalUser, User } from '@/lib/api.patch';
import { isLocalStudio } from '@/config/constants';
import { getUserInfo } from '@/features/instance/operations/queries/getUserInfo';
import { getCloudUser } from '@/features/auth/queries/getCurrentUser';
import { SchemaCluster, SchemaHdbInstance } from '@/lib/api.gen';
import { sleep } from '@/lib/sleep';
import { isInstance } from '@/lib/types/isInstance';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { isCluster } from '@/lib/types/isCluster';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';

type AuthStoreListenerCleanup = () => void;

export type AuthenticatedConnectionKey =
	| OverallAppSignInType
	| Required<SchemaHdbInstance>['instanceFqdn']
	| Required<SchemaCluster>['fqdn'];

export interface AuthenticatedConnection {
	isLoading: boolean;
	user: User | LocalUser | null;
}

export const OverallAppSignIn = 'OverallAppSignIn' as const;
type OverallAppSignInType = typeof OverallAppSignIn;
type EntityTypes = OverallAppSignInType | Instance | Cluster | null;

class AuthStore {
	private readonly users: Record<AuthenticatedConnectionKey, User | LocalUser | null> = {};
	private readonly loading: Record<AuthenticatedConnectionKey, boolean> = {};
	private readonly listeners: Record<AuthenticatedConnectionKey, Array<(connection: AuthenticatedConnection) => void>> = {};

	private readonly localStorageKey = 'Harper:Fabric:Auth:PotentiallyAuthenticatedHosts';
	private readonly potentiallyAuthenticatedKeys: AuthenticatedConnectionKey[];

	constructor() {
		this.potentiallyAuthenticatedKeys = localStorage.getItem(this.localStorageKey)?.split(',').filter(Boolean) || [];
	}

	public listenToEntity(entity: EntityTypes, listener: (connection: AuthenticatedConnection) => void): AuthStoreListenerCleanup | undefined {
		const key = this.calculateKeyFromEntity(entity);
		if (!key) {
			return undefined;
		}
		if (!this.listeners[key]) {
			this.listeners[key] = [];
			void this.loadUserByKey(key).then(() => this.updateListeners(key));
		}
		if (!this.listeners[key].includes(listener)) {
			this.listeners[key].push(listener);
		}
		this.updateListener(key, listener);
		return () => {
			const index = this.listeners[key].indexOf(listener);
			if (index >= 0) {
				this.listeners[key].splice(index, 1);
			}
		};
	}

	public setUserForEntity(entity: EntityTypes, user: User | LocalUser | null): void {
		const key = this.calculateKeyFromEntity(entity);
		if (!key) {
			return;
		}
		this.users[key] = user;
		this.loading[key] = false;
		if (user) {
			this.flagKeyAsSignedIn(key);
		} else {
			this.flagKeyAsSignedOut(key);
		}
		void this.updateListeners(key);
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

	private flagKeyAsSignedIn(key: AuthenticatedConnectionKey) {
		if (!this.potentiallyAuthenticatedKeys.includes(key)) {
			this.potentiallyAuthenticatedKeys.push(key);
			localStorage.setItem(this.localStorageKey, this.potentiallyAuthenticatedKeys.join(','));
		}
	}

	private flagKeyAsSignedOut(key: AuthenticatedConnectionKey) {
		const index = this.potentiallyAuthenticatedKeys.indexOf(key);
		if (index >= 0) {
			this.potentiallyAuthenticatedKeys.splice(index, 1);
			localStorage.setItem(this.localStorageKey, this.potentiallyAuthenticatedKeys.join(','));
		}
	}

	private async updateListeners(key: AuthenticatedConnectionKey): Promise<void> {
		await sleep(1);
		if (this.listeners[key]) {
			for (const listener of this.listeners[key]) {
				this.updateListener(key, listener);
			}
		}
	}

	private updateListener(key: AuthenticatedConnectionKey, listener: (connection: AuthenticatedConnection) => void) {
		listener({
			isLoading: this.loading[key] || false,
			user: this.users[key] || null,
		});
	}

	private async loadUserByKey(key: AuthenticatedConnectionKey): Promise<void> {
		if (!this.potentiallyAuthenticatedKeys.includes(key)) {
			this.loading[key] = false;
			this.users[key] = null;
			return;
		}
		this.loading[key] = true;
		let user: User | LocalUser | null = null;
		try {
			if (key === OverallAppSignIn) {
				if (isLocalStudio) {
					user = await getUserInfo();
				} else {
					user = await getCloudUser();
				}
			} else if (key) {
				user = await getUserInfo({ operationsUrl: key });
			}
		} catch (error) {
			// TODO: Only catch the errors we expect here (401? 403? w/e)
			console.error(error);
			user = null;
		}
		if (user) {
			this.flagKeyAsSignedIn(key);
		} else {
			this.flagKeyAsSignedOut(key);
		}
		this.users[key] = user;
		this.loading[key] = false;
	}
}

export const authStore = new AuthStore();
