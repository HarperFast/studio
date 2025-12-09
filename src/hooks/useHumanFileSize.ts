import { humanFileSize } from '@/lib/humanFileSize';
import { useMemo } from 'react';

export function useHumanFileSize(size: number | undefined, multiplier: number = 1): string {
	return useMemo(() => {
		return !size ? '' : humanFileSize(size, multiplier);
	}, [size, multiplier]);
}
