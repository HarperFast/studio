export type PasteCut = { pasted: number; kept: number };

type PasteMeasurement = {
	text: string;
	before: string;
	after: string;
	selection: readonly [number, number];
	maxLength: number;
};

export function measurePasteCut({ text, before, after, selection, maxLength }: PasteMeasurement): PasteCut | null {
	// What a single-line input inserts: trailing line breaks dropped, the rest turned into spaces.
	const inserted = text.replace(/[\r\n]+$/, '').replace(/\r\n|\r|\n/g, ' ');
	// The browser cuts only by filling the field, though it may stop one short rather than split a surrogate pair.
	if (!inserted || after.length < maxLength - 1) {
		return null;
	}
	const outside = before.length - (selection[1] - selection[0]);
	const room = Math.max(0, maxLength - outside);
	if (room >= inserted.length) {
		return null;
	}
	// What landed, which is short of the room when the browser stopped before a surrogate pair.
	return { pasted: inserted.length, kept: Math.min(room, Math.max(0, after.length - outside)) };
}
