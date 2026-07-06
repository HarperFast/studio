/**
 * Detect the whitespace conventions of an existing schema file so regenerated
 * tables mimic it (requirement: "mimic the patterns in the existing file — tabs
 * vs some number of spaces"). Defaults match the old New-Table generator: a tab
 * indent and `\n` newlines.
 */

/** Return the indentation unit used by the first indented line — a tab or N spaces. */
export function detectIndent(source: string): string {
	for (const line of source.split('\n')) {
		const match = line.match(/^(\t+| +)\S/);
		if (!match) {
			continue;
		}
		const whitespace = match[1];
		if (whitespace[0] === '\t') {
			return '\t';
		}
		// Spaces: assume the first indented line sits one level deep.
		return whitespace;
	}
	return '\t';
}

/** Return the dominant newline sequence (`\r\n` if the file uses Windows endings). */
export function detectNewline(source: string): string {
	return /\r\n/.test(source) ? '\r\n' : '\n';
}
