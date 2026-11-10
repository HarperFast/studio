import { sleep } from '@/lib/sleep';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function useRefreshClick(refetch: () => Promise<unknown>) {
	return useCallback(async () => {
		toast.loading('Refreshing...', { id: 'refreshing' });
		const startedAt = Date.now();
		let failed = false;
		try {
			await refetch();
		} catch {
			failed = true;
		}
		if (Date.now() - startedAt < 500) {
			await sleep(500);
		}
		if (failed) {
			toast.error("Couldn't refresh everything", { id: 'refreshing' });
		} else {
			toast.success('Refreshed!', { id: 'refreshing' });
		}
	}, [refetch]);
}
