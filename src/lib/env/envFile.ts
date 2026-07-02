/**
 * Client-side helpers for inspecting and editing `.env` files.
 *
 * This is a browser-safe port of Harper core's `utility/envFile.ts` (HarperFast/harper#1527) and
 * must stay behaviorally in lockstep with it: the filename matching decides which files the
 * editor treats as secret stores, and the parse/serialise logic mirrors what `set_env_value` /
 * `delete_env_value` do server-side, so a Studio edit against an older (pre-5.2) Harper writes
 * exactly the file a newer Harper would have produced.
 *
 * Parsing follows dotenv 16's exact semantics (the parser Harper's runtime loader uses):
 *
 *   - keys match `[\w.-]+`, optionally prefixed with `export `;
 *   - an unquoted value runs to the first `#` (inline comment) or newline;
 *   - single-quoted values are taken literally (only the surrounding quotes are stripped) and may
 *     span multiple lines;
 *   - double-quoted values are stripped of their quotes and then have `\n`/`\r` expanded — dotenv
 *     does NOT un-escape `\"` or `\\`, which constrains how we serialise values below.
 */

/** The placeholder substituted for every value in a masked rendering. */
export const ENV_VALUE_MASK = '********';

/** dotenv's accepted key character set. Keys written through the API must match this. */
export const ENV_KEY_REGEX = /^[\w.-]+$/;

// An assignment line: optional indentation + optional `export ` prefix, a key, `=`, then the raw
// value text. The value may begin a quoted region that continues onto subsequent lines.
const ASSIGNMENT_LINE = /^(\s*(?:export\s+)?)([\w.-]+)\s*=(.*)$/;

function basename(file: string): string {
	return file.split('/').pop() ?? '';
}

/**
 * True for `.env` and `.env.<suffix>` (e.g. `.env.local`), matched by basename at any depth.
 * Case-insensitive: a protection feature should err toward over-matching (e.g. catch `.ENV` on a
 * case-insensitive filesystem) rather than let a secret slip through on a casing technicality.
 */
export function isEnvFile(file: string | undefined): boolean {
	if (!file) { return false; }
	const base = basename(file).toLowerCase();
	return base === '.env' || base.startsWith('.env.');
}

// Template/example env files conventionally hold placeholders, not real secrets, so they are NOT
// protected — the editor reads and writes them verbatim like any other file. Matched by suffix.
const EXAMPLE_ENV_SUFFIXES = ['.example', '.sample', '.template'];

/** True for non-secret template env files: `.env.example`, `.env.sample`, `.env.template`, … */
export function isExampleEnvFile(file: string | undefined): boolean {
	if (!isEnvFile(file)) { return false; }
	const base = basename(file!).toLowerCase();
	return EXAMPLE_ENV_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

/** True for `.env*` files whose values should be masked/guarded — i.e. excluding template files. */
export function isProtectedEnvFile(file: string | undefined): boolean {
	return isEnvFile(file) && !isExampleEnvFile(file);
}

/**
 * Parse env-file text into key/value pairs with dotenv 16's exact semantics (duplicate keys —
 * last assignment wins). This is what Harper's runtime loader sees, so what this returns is what
 * the application actually gets.
 */
export function parseEnv(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	if (!text) { return result; }
	// dotenv's LINE regex, verbatim: quoted values may span lines; unquoted values stop at `#`.
	const line =
		/(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;
	const normalized = text.replace(/\r\n?/g, '\n');
	let match: RegExpExecArray | null;
	while ((match = line.exec(normalized)) !== null) {
		const key = match[1];
		let value = (match[2] ?? '').trim();
		const quote = value[0];
		value = value.replace(/^(['"`])([\s\S]*)\1$/gm, '$2');
		if (quote === '"') {
			value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
		}
		result[key] = value;
	}
	return result;
}

/** The key names of an env file, in file order, de-duplicated — exactly what the runtime loads. */
export function parseEnvKeys(text: string): string[] {
	if (!text) { return []; }
	return Object.keys(parseEnv(text));
}

/** A value-free rendering of an env file: one `KEY=********` line per key. */
export function renderMaskedEnv(keys: string[]): string {
	if (!keys || keys.length === 0) { return ''; }
	return keys.map((key) => `${key}=${ENV_VALUE_MASK}`).join('\n') + '\n';
}

/**
 * Serialise a value so that a dotenv-semantics parse recovers it verbatim.
 *
 * dotenv only *expands* escapes inside double quotes (`\n`, `\r`) and never un-escapes `\"`/`\\`,
 * so single quotes — which it treats literally — are the most faithful container:
 *   - no special chars                 -> bare;
 *   - no single quote                  -> single-quoted (handles spaces, `#`, `"`, `\`, newlines);
 *   - single quote but no `"`/`\`/`\r` -> double-quoted with newlines encoded as `\n`;
 *   - both quote styles                -> unrepresentable; throws.
 */
export function formatEnvValue(value: string): string {
	if (value === '') { return ''; }
	// Bare is safe only without whitespace, `#` (would begin an inline comment), or any quote
	// character. Backslash and `=` stay literal in unquoted values, so they don't force quoting.
	if (!/[\s#'"`]/.test(value)) { return value; }
	if (!value.includes("'")) { return `'${value}'`; }
	if (!value.includes('"') && !value.includes('\\') && !value.includes('\r')) {
		return `"${value.replace(/\n/g, '\\n')}"`;
	}
	throw new Error('Environment value contains an unsupported combination of quote characters');
}

// Does `s` contain an unescaped `quote`? A backslash escapes the following character, but only for
// double-quoted values — dotenv treats single-quoted and backtick-quoted values literally, so a
// value ending in `\` (e.g. a Windows path `'C:\Users\name\'`) still closes at that quote.
function closesQuote(s: string, quote: string): boolean {
	const backslashEscapes = quote !== "'" && quote !== '`';
	for (let i = 0; i < s.length; i++) {
		if (backslashEscapes && s[i] === '\\') {
			i++;
			continue;
		}
		if (s[i] === quote) { return true; }
	}
	return false;
}

// Index of the last line occupied by the value that starts at `lines[startIdx]`. Unquoted values
// are single-line; quoted values extend until their matching quote closes.
function valueEndLine(lines: string[], startIdx: number, rawValue: string): number {
	const trimmed = rawValue.replace(/^\s+/, '');
	const quote = trimmed[0];
	if (quote !== '"' && quote !== "'" && quote !== '`') { return startIdx; }
	if (closesQuote(trimmed.slice(1), quote)) { return startIdx; }
	for (let j = startIdx + 1; j < lines.length; j++) {
		if (closesQuote(lines[j], quote)) { return j; }
	}
	return lines.length - 1; // unterminated — treat the remainder of the file as the value
}

interface ScanState {
	eol: string;
	endedWithNewline: boolean;
	lines: string[];
}

function beginScan(text: string): ScanState {
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const endedWithNewline = /\r?\n$/.test(text);
	const lines = text.length ? text.split(/\r?\n/) : [];
	if (endedWithNewline) {
		// Drop the empty element the trailing newline produces.
		lines.pop();
	}
	return { eol, endedWithNewline, lines };
}

/**
 * Insert or update the given keys, leaving every other line — comments, blank lines, untouched
 * keys, and their formatting — exactly as it was. Existing keys are replaced in place (a duplicate
 * later assignment of an updated key is dropped so the new value wins, as dotenv keeps the last);
 * new keys are appended. The file is created from empty text transparently.
 */
export function upsertEnvValues(text: string, updates: Record<string, string>): string {
	const pending = new Map(Object.entries(updates));
	const applied = new Set<string>();
	const { eol, endedWithNewline, lines } = beginScan(text);

	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const match = ASSIGNMENT_LINE.exec(lines[i]);
		if (match) {
			const [, prefix, key] = match;
			const end = valueEndLine(lines, i, match[3]);
			if (pending.has(key)) {
				if (!applied.has(key)) {
					out.push(`${prefix}${key}=${formatEnvValue(pending.get(key)!)}`);
					applied.add(key);
				}
				// otherwise drop the duplicate assignment of an already-updated key
			} else {
				for (let j = i; j <= end; j++) { out.push(lines[j]); }
			}
			i = end;
			continue;
		}
		out.push(lines[i]);
	}

	let appended = false;
	for (const [key, value] of pending) {
		if (applied.has(key)) { continue; }
		out.push(`${key}=${formatEnvValue(value)}`);
		appended = true;
	}

	let result = out.join(eol);
	if (result.length > 0 && (endedWithNewline || appended)) { result += eol; }
	return result;
}

/** Remove the given keys (and any continuation lines of multi-line values), leaving the rest. */
export function removeEnvKeys(text: string, keys: string | string[]): string {
	const removeSet = new Set(Array.isArray(keys) ? keys : [keys]);
	if (removeSet.size === 0 || !text) { return text; }
	const { eol, endedWithNewline, lines } = beginScan(text);

	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const match = ASSIGNMENT_LINE.exec(lines[i]);
		if (match) {
			const end = valueEndLine(lines, i, match[3]);
			if (!removeSet.has(match[2])) {
				for (let j = i; j <= end; j++) { out.push(lines[j]); }
			}
			i = end;
			continue;
		}
		out.push(lines[i]);
	}

	let result = out.join(eol);
	if (result.length > 0 && endedWithNewline) { result += eol; }
	return result;
}
