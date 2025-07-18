const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function humanNumber(input: number): string {
	const thresh = 1000;
	let value = input;

	if (Math.abs(value) < thresh) {
		return String(Math.round(value));
	}

	let u = -1;
	const r = 10;

	do {
		value /= thresh;
		++u;
	} while (Math.round(Math.abs(value) * r) / r >= thresh && u < units.length - 1);

	return `${new Intl.NumberFormat().format(Math.round(value))} ${units[u]}`;
}
