const units = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

export function humanFileSize(input: number, multiplier: number = 1) {
	const thresh = 1024;
	const bytes = input * multiplier;
	let value = bytes;

	if (Math.abs(value) < thresh) {
		return value + ' B';
	}

	let u = -1;
	const r = 10;

	do {
		value /= thresh;
		++u;
	} while (Math.round(Math.abs(value) * r) / r >= thresh && u < units.length - 1);

	return value.toFixed(0) + ' ' + units[u];
}
