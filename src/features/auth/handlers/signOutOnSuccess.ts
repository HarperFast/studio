import { authStore } from '@/lib/authStore';
import { queryClient } from '@/react-query/queryClient';

export async function signOutOnSuccess() {
	authStore.setUser('global', null);
	queryClient.getQueryCache().clear();
	await queryClient.invalidateQueries({ refetchType: 'none' });
}
