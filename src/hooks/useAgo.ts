import { useInterval } from '@/hooks/useInterval';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { useMemo, useState } from 'react';

export function useAgo(msOrDate: number | Date | undefined | null): string {
	const startMs = useMemo(() => !msOrDate ? null : msOrDate instanceof Date ? msOrDate.getTime() : msOrDate, [
		msOrDate,
	]);
	const [formattedDate, setFormattedDate] = useState('');

	useInterval(() => {
		if (!startMs && formattedDate) {
			setFormattedDate('');
		} else if (startMs) {
			const elapsed = Date.now() - startMs;
			const secondsElapsed = Math.round(elapsed / 1000);
			const newlyFormattedDate = translateSecondsToAgo(secondsElapsed, startMs);
			if (formattedDate !== newlyFormattedDate) {
				setFormattedDate(newlyFormattedDate);
			}
		}
	}, 1000 / 10);

	return formattedDate;
}
