/**
 * Turning a full-text hit's `$highlights` into text to show, with the matched spans marked.
 *
 * Harper groups highlights by source field, one entry per matched value (`valueIndex` picks the
 * value out of a `[String]` source). Each entry has `spans` into that value and, when the index sets
 * `highlighting.fragmentLength`, `fragments`: excerpts of the value around the matches, each with
 * its own spans. Offsets are positions in the value's text.
 */
import { FullTextSpan, FullTextValueHighlight } from '@/integrations/api/instance/database/searchFullText';

export interface HighlightSegment {
	text: string;
	match: boolean;
}

/**
 * `text` split into matched and unmatched runs. Spans are clamped to the text, sorted and merged, so
 * an overlapping or out-of-range span from the server can never duplicate or drop characters.
 */
export function highlightSegments(text: string, spans: readonly FullTextSpan[]): HighlightSegment[] {
	const ranges = spans
		.map(({ start, end }) => [Math.max(0, Math.min(start, text.length)), Math.max(0, Math.min(end, text.length))])
		.filter(([start, end]) => end > start)
		.sort((a, b) => a[0] - b[0]);
	const merged: number[][] = [];
	for (const range of ranges) {
		const last = merged.at(-1);
		if (last && range[0] <= last[1]) {
			last[1] = Math.max(last[1], range[1]);
		} else {
			merged.push([...range]);
		}
	}
	const segments: HighlightSegment[] = [];
	let at = 0;
	for (const [start, end] of merged) {
		if (start > at) {
			segments.push({ text: text.slice(at, start), match: false });
		}
		segments.push({ text: text.slice(start, end), match: true });
		at = end;
	}
	if (at < text.length || segments.length === 0) {
		segments.push({ text: text.slice(at), match: false });
	}
	return segments;
}

export interface HighlightedExcerpt {
	segments: HighlightSegment[];
	/** Text of the value comes before this excerpt. */
	leadingEllipsis: boolean;
	/** Text of the value comes after it. */
	trailingEllipsis: boolean;
}

/** The value `entry` highlights: the record's field itself, or its `valueIndex`th item for a list. */
function highlightedValue(fieldValue: unknown, entry: FullTextValueHighlight): string | undefined {
	const value = Array.isArray(fieldValue) ? fieldValue[entry.valueIndex] : fieldValue;
	return typeof value === 'string' ? value : undefined;
}

/**
 * What to show for one highlighted value: its fragments when Harper sent them, otherwise the value
 * itself (when the record carries it as text — a Blob source doesn't) with its spans marked.
 */
export function highlightedExcerpts(fieldValue: unknown, entry: FullTextValueHighlight): HighlightedExcerpt[] {
	if (entry.fragments && entry.fragments.length > 0) {
		const valueLength = highlightedValue(fieldValue, entry)?.length;
		return entry.fragments.map(fragment => ({
			segments: highlightSegments(fragment.text, fragment.spans),
			leadingEllipsis: fragment.start > 0,
			trailingEllipsis: valueLength === undefined || fragment.start + fragment.text.length < valueLength,
		}));
	}
	const value = highlightedValue(fieldValue, entry);
	return value === undefined
		? []
		: [{ segments: highlightSegments(value, entry.spans), leadingEllipsis: false, trailingEllipsis: false }];
}
