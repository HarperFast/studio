import { useMemo, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';

export function useAgo(msOrDate: number | Date | undefined | null): string {
	const startMs = useMemo(() => !msOrDate ? null : msOrDate instanceof Date ? msOrDate.getTime() : msOrDate, [msOrDate]);
	const [formattedDate, setFormattedDate] = useState('');

	useInterval(() => {
		if (!startMs && formattedDate) {
			setFormattedDate('');
		} else if (startMs) {
			const elapsed = Date.now() - startMs;
			const secondsElapsed = Math.round(elapsed / 1000);
			const newlyFormattedDate = translateSecondsToAgo(secondsElapsed);
			if (formattedDate !== newlyFormattedDate) {
				setFormattedDate(newlyFormattedDate);
			}
		}
	}, 1000 / 10);

	return formattedDate;
}

export function translateSecondsToAgo(secondsElapsed: number): string {
	if (secondsElapsed < 45) {
		return 'a few seconds ago';
	}
	if (secondsElapsed < 120) {
		return 'a minute ago';
	}
	const minutesElapsed = Math.floor(secondsElapsed / 60);
	if (minutesElapsed < 60) {
		return `${minutesElapsed} minutes ago`;
	}
	if (minutesElapsed < 120) {
		return 'an hour ago';
	}
	const hoursElapsed = Math.floor(secondsElapsed / 3600);
	return `${hoursElapsed} hours ago`;
}
