import { clearAuthStateLocally } from '@/features/auth/handlers/clearAuthStateLocally';
import { queryClient } from '@/react-query/queryClient';

export async function logoutOnSuccess() {
	clearAuthStateLocally();
	await queryClient.invalidateQueries({ refetchType: 'none' });
}
