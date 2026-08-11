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

export type ParsedRecordJson = { ok: true; value: unknown } | { ok: false; error: RecordJsonError };

/** Parse `content` as JSON, returning a result object rather than throwing. */
export function tryParseRecordJson(content: string): ParsedRecordJson {
	if (!content.trim()) {
		// `JSON.parse('')` reports "Unexpected end of JSON input", which reads like a truncated
		// record rather than an editor the user emptied.
		return { ok: false, error: { message: 'The editor is empty, so there is nothing to save.' } };
	}
	try {
		return { ok: true, value: JSON.parse(content) };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: { message: withoutEngineLocation(message), location: locate(message, content) } };
	}
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

function locationOfOffset(content: string, offset: number): RecordJsonLocation {
	const upToOffset = content.slice(0, Math.max(0, Math.min(offset, content.length)));
	const lastLineBreak = upToOffset.lastIndexOf('\n');
	return { lineNumber: upToOffset.split('\n').length, column: upToOffset.length - lastLineBreak };
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
