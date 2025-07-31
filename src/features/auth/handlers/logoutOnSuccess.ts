import { authStore, OverallAppSignIn } from '@/lib/authStore';
import { queryClient } from '@/react-query/queryClient';

export async function logoutOnSuccess() {
	authStore.setUserForEntity(OverallAppSignIn, null);
	queryClient.getQueryCache().clear();
	await queryClient.invalidateQueries({ refetchType: 'none' });
}
