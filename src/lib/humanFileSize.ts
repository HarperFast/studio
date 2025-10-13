import { scaleValueToUnits, determineUnits } from '@/lib/units.ts';

export function humanFileSize(input: number, multiplierFromBytes: number = 1) {
	const initialValue = input * multiplierFromBytes;
	const units = determineUnits('bytes', initialValue);
	const scaled = scaleValueToUnits(initialValue, 'bytes', units);

	const value = new Intl.NumberFormat().format(Math.round(scaled));
	return `${value} ${units}`;
}
