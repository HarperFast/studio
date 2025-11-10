import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { clearLocalStorage } from '@/lib/storage/clearLocalStorage';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { queryClient } from '@/react-query/queryClient';

export async function logoutOnSuccess() {
	authStore.setUserForEntity(OverallAppSignIn, null);
	queryClient.getQueryCache().clear();
	clearLocalStorage();
	clearSessionStorage();
	await queryClient.invalidateQueries({ refetchType: 'none' });
}
