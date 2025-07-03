import { useMemo } from 'react';
import { humanFileSize } from '@/lib/humanFileSize';

export function useHumanFileSize(size: number | undefined, multiplier: number = 1): string {
	return useMemo(() => {
		return !size ? '' : humanFileSize(size, multiplier);
	}, [size, multiplier]);
}
