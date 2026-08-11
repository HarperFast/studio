/**
 * The record editors highlight JSON with a worker-free language (see
 * `workerFreeJsonLanguage.ts`), so nothing validates the buffer as it is typed —
 * that is the point of it. This is the replacement signal, and it runs at submit
 * time: {@link tryParseRecordJson} is the authoritative, caught parse the submit
 * handlers run once, and a failure carries the parser's reason plus a 1-based
 * location, so Save can explain itself (a toast, and a marker on the offending
 * line — see `recordJsonErrorMarker.ts`) instead of going quietly dead.
 */

/** Where a record buffer stopped parsing, 1-based, as Monaco counts lines and columns. */
export type RecordJsonLocation = { lineNumber: number; column: number };

/** Why a record buffer could not be parsed, and — when the engine says — where. */
export type RecordJsonError = {
	/** The parser's reason, e.g. `Unterminated string`. */
	message: string;
	/** Absent when the engine reported no position: V8 omits it for very short inputs, and
	 * JavaScriptCore never reports one. */
	location?: RecordJsonLocation;
};

/** A record, or a list of them — the shapes the ops API takes as `records`. */
export type RecordJsonValue = Record<string, unknown> | Record<string, unknown>[];

export type ParsedRecordJson = { ok: true; value: RecordJsonValue } | { ok: false; error: RecordJsonError };

/** Parse `content` as one or more records, returning a result object rather than throwing. */
export function tryParseRecordJson(content: string): ParsedRecordJson {
	if (!content.trim()) {
		// `JSON.parse('')` reports "Unexpected end of JSON input", which reads like a truncated
		// record rather than an editor the user emptied.
		return { ok: false, error: { message: 'The editor is empty, so there is nothing to save.' } };
	}
	let value: unknown;
	try {
		value = JSON.parse(content);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: { message: withoutEngineLocation(message), location: locate(message, content) } };
	}
	const shapeError = recordShapeError(value);
	return shapeError ? { ok: false, error: { message: shapeError } } : { ok: true, value: value as RecordJsonValue };
}

/** One-line rendering of a {@link RecordJsonError}, for a toast description. */
export function describeRecordJsonError({ message, location }: RecordJsonError): string {
	return location ? `Line ${location.lineNumber}, column ${location.column}: ${message}` : message;
}

/** V8 (`… in JSON at position 30 (line 3 column 5)`) and SpiderMonkey (`… at line 3 column 5 of the
 * JSON data`) both name the spot; older V8 gave only the character offset. */
const LINE_AND_COLUMN = /\bline (\d+) column (\d+)/i;
const CHARACTER_OFFSET = /\bposition (\d+)/i;

function locate(message: string, content: string): RecordJsonLocation | undefined {
	const lineAndColumn = LINE_AND_COLUMN.exec(message);
	if (lineAndColumn) {
		return { lineNumber: Number(lineAndColumn[1]), column: Number(lineAndColumn[2]) };
	}
	const characterOffset = CHARACTER_OFFSET.exec(message);
	return characterOffset ? locationOfOffset(content, Number(characterOffset[1])) : undefined;
}

/** Walked rather than sliced/split: these buffers run to hundreds of KB, and neither a copy of
 * the prefix nor an array of its lines is worth allocating to count two numbers. */
function locationOfOffset(content: string, offset: number): RecordJsonLocation {
	const end = Math.max(0, Math.min(offset, content.length));
	let lineNumber = 1;
	let lineStart = 0;
	for (
		let lineBreak = content.indexOf('\n');
		lineBreak !== -1 && lineBreak < end;
		lineBreak = content.indexOf('\n', lineBreak + 1)
	) {
		lineNumber++;
		lineStart = lineBreak + 1;
	}
	return { lineNumber, column: end - lineStart + 1 };
}

/** Records reach the ops API as `records`, which holds objects. A primitive, a `null`, or a
 * nested array parses cleanly and then fails on the wire in the server's wording (or, for the
 * edit modal, as a lone object the `update` operation won't take), so name it here instead. */
function recordShapeError(value: unknown): string | undefined {
	if (Array.isArray(value)) {
		const notARecord = value.findIndex(entry => !isRecord(entry));
		return notARecord === -1 ? undefined : `Item ${notARecord + 1} of the array isn't a JSON object.`;
	}
	return isRecord(value) ? undefined : 'A record has to be a JSON object, or an array of them.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strip the engine's own position clause: {@link describeRecordJsonError} renders the location
 * itself, in one wording across engines, so leaving it in reads as a stutter. */
function withoutEngineLocation(message: string): string {
	return message
		.replace(/^JSON\.parse:\s*/, '')
		.replace(/\s*in JSON at position \d+.*$/i, '')
		.replace(/\s*at line \d+ column \d+ of the JSON data\.?$/i, '')
		.trim();
}
