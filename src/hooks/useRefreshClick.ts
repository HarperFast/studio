import { sleep } from '@/lib/sleep';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function useRefreshClick(refetch: () => Promise<unknown>) {
	return useCallback(async () => {
		toast.loading('Refreshing...', { id: 'refreshing' });
		const startedAt = Date.now();
		await refetch();
		if (Date.now() - startedAt < 500) {
			await sleep(500);
		}
		toast.success('Refreshed!', { id: 'refreshing' });
	}, [refetch]);
}
