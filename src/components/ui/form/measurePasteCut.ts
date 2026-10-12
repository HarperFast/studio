export type PasteCut = { pasted: number; kept: number };

type PasteMeasurement = {
	text: string;
	before: string;
	after: string;
	/** `[selectionStart, selectionEnd]` at paste time, or null where the input hides it (`type="email"`). */
	selection: readonly [number, number] | null;
	maxLength: number;
};

export function measurePasteCut({ text, before, after, selection, maxLength }: PasteMeasurement): PasteCut | null {
	// What a single-line input inserts: trailing line breaks dropped, the rest turned into spaces.
	const inserted = text.replace(/[\r\n]+$/, '').replace(/\r\n|\r|\n/g, ' ');
	// The browser cuts only by filling the field, though it may stop one short rather than split a surrogate pair.
	if (!inserted || after.length < maxLength - 1) {
		return null;
	}
	if (selection) {
		const outside = before.length - (selection[1] - selection[0]);
		const room = Math.max(0, maxLength - outside);
		if (room >= inserted.length) {
			return null;
		}
		// What landed, which is short of the room when the browser stopped before a surrogate pair.
		return { pasted: inserted.length, kept: Math.min(room, Math.max(0, after.length - outside)) };
	}
	// An email field also trims its value.
	const sought = inserted.trim();
	const kept = keptWithoutSelection(sought, before, after);
	return kept < sought.length ? { pasted: sought.length, kept } : null;
}

// Reads `after` as a start of `before`, then the start of `sought` that fit, then an end of `before`, and
// takes the longest such reading. Text already in the field therefore can't pass for pasted text, and an
// unchanged value means nothing went in, rather than an identical selection being replaced.
function keptWithoutSelection(sought: string, before: string, after: string): number {
	if (after === before) {
		return 0;
	}
	const shortest = Math.min(before.length, after.length);
	let head = 0;
	while (head < shortest && before[head] === after[head]) {
		head++;
	}
	let tail = 0;
	while (tail < shortest && before[before.length - 1 - tail] === after[after.length - 1 - tail]) {
		tail++;
	}
	let kept = 0;
	for (let start = 0; start <= head; start++) {
		for (let end = 0; end <= tail && start + end <= shortest; end++) {
			const length = after.length - start - end;
			if (length > kept && length <= sought.length && after.startsWith(sought.slice(0, length), start)) {
				kept = length;
			}
		}
	}
	return kept;
}
