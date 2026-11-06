/** Shown in place of a stored value that can't be written out as text. */
export const UNREADABLE_VALUE = '[unreadable value]';

/**
 * A stored value as text, for a cell, an input or a name. It never throws: a record can hold any JSON,
 * and `String()` throws on an object whose `toString` isn't a function, such as `{"toString": null}`,
 * which Harper stores and returns as given. Objects and arrays read as JSON, as in Browse's plain cells.
 */
export function displayText(value: unknown): string {
	switch (typeof value) {
		case 'string':
			return value;
		case 'number':
		case 'boolean':
		case 'bigint':
			return String(value);
		case 'undefined':
			return '';
		case 'object':
			if (value === null) {
				return '';
			}
			try {
				return JSON.stringify(value, (_key, nested) => typeof nested === 'bigint' ? String(nested) : nested)
					?? UNREADABLE_VALUE;
			} catch {
				// A cycle, or a `toJSON` that throws.
				return UNREADABLE_VALUE;
			}
		default:
			return UNREADABLE_VALUE;
	}
}

/**
 * A record's own value for an attribute. Indexing alone would hand an attribute named `toString` or
 * `constructor` that the record lacks Object.prototype's function.
 */
export function attributeValue(record: Record<string, unknown> | undefined, attribute: string): unknown {
	return record !== undefined && Object.hasOwn(record, attribute) ? record[attribute] : undefined;
}

/**
 * A value the data table can search and sort: primitives as they are, anything else as its text. Its
 * search calls `String()` on every value and its default sort compares with `>`, and both throw on
 * `{"toString": null}`.
 */
export function primitiveValue(value: unknown): string | number | boolean | null | undefined {
	return value === null || value === undefined || typeof value === 'string' || typeof value === 'number'
			|| typeof value === 'boolean'
		? value
		: displayText(value);
}
