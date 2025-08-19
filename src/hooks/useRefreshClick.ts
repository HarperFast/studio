import { sleep } from '@/lib/sleep';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function useRefreshClick(refetch: () => Promise<unknown>) {
	return useCallback(async () => {
		const toastId = toast.loading('Refreshing...');
		const startedAt = Date.now();
		await refetch();
		if (Date.now() - startedAt < 500) {
			await sleep(500);
		}
		toast.dismiss(toastId);
		toast.success('Refreshed!');
	}, [refetch]);
}
