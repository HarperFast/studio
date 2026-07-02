/**
 * Parses an uploaded JSON file into records for the `insert` operation.
 * Accepts an array of objects or a single object (wrapped into a one-record array).
 * Throws a user-facing Error for anything else.
 */
export function parseJsonRecords(text: string): object[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('The file is not valid JSON.');
	}
	const records = Array.isArray(parsed) ? parsed : [parsed];
	if (records.length === 0) {
		throw new Error('The JSON file contains no records.');
	}
	if (records.some((record) => typeof record !== 'object' || record === null || Array.isArray(record))) {
		throw new Error('The JSON file must contain an object or an array of objects.');
	}
	return records as object[];
}
