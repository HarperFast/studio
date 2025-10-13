import { autoCasterIsNumberCheck } from '@/lib/numbers/autoCasterIsNumberCheck';

const autoCastCommonStringsMap: Record<string, boolean | null | number> = {
	true: true,
	TRUE: true,
	false: false,
	FALSE: false,
	undefined: null,
	null: null,
	NULL: null,
	NaN: NaN,
};
const isoDateRegex =
	/^((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))$/;

/**
 * Takes a raw string value and casts it to a potentially correct data type.
 * @param data
 * @returns
 */
export function autoCast(data: unknown) {
	if (data === null || data === undefined || data === '') {
		return data;
	}

	//if this is already typed other than string, return data
	if (typeof data !== 'string') {
		return data;
	}

	// Try to make it a common string
	if (autoCastCommonStringsMap[data] !== undefined) {
		return autoCastCommonStringsMap[data];
	}

	if (autoCasterIsNumberCheck(data)) {
		return Number(data);
	}

	if (isoDateRegex.test(data)) return new Date(data);

	return data;
}
