export function translateSecondsToAgo(secondsElapsed: number, timeMs: number): string {
	// Note: I used the boundaries that moment.js uses.
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
	if (hoursElapsed > 48) {
		return new Date(timeMs).toLocaleString();
	}
	return `${hoursElapsed} hours ago`;
}
