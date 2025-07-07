import { authStore } from '@/lib/authStore';
import { queryClient } from '@/react-query/queryClient';

export async function signOutOnSuccess() {
	authStore.setUser('global', null);
	queryClient.getQueryCache().clear();
	void queryClient.invalidateQueries({ refetchType: 'none' });
}
