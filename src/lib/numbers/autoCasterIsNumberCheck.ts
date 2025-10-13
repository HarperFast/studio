import { isNumber } from '@/lib/numbers/isNumber';

/**
 * function to check if a string is a number based on the rules used by our autocaster
 */
export function autoCasterIsNumberCheck(data: string): boolean {
	if (data.startsWith('0.') && isNumber(data)) {
		return true;
	}

	const containsE = data.toUpperCase().includes('E');
	const startsWithZero = data !== '0' && data.startsWith('0');
	return !startsWithZero && !containsE && isNumber(data);
}
