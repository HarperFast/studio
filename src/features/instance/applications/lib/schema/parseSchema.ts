/**
 * Parse a Harper `schema.graphql` into the editable {@link SchemaDocument} model.
 *
 * This is a deliberately small, hand-rolled SDL scanner rather than a full
 * GraphQL parser: it only needs to isolate top-level `type … @table { … }`
 * blocks and read their directives/fields. Everything else — scalars, enums,
 * non-`@table` types, comments, whitespace — is preserved verbatim as `raw`
 * segments, and any `type` block that doesn't parse cleanly falls back to `raw`
 * too. The scanner is string/comment/brace aware so `{`, `@`, or `type` inside a
 * string or comment can't fool it. On a structural failure (unterminated string,
 * unbalanced braces) it returns `ok: false` and the caller shows the text editor.
 */
import { detectIndent, detectNewline } from './indentation';
import { nextFieldKey } from './mutations';
import { Directive, DirectiveArg, FieldModel, findDirective, ParseResult, Segment, TableModel, TypeRef } from './types';

function isIdentChar(char: string): boolean {
	return /[A-Za-z0-9_]/.test(char);
}

/** Skip a `"…"` or `"""…"""` string starting at `i`; return the index after it, or -1 if unterminated. */
function skipString(src: string, i: number): number {
	if (src.startsWith('"""', i)) {
		let j = i + 3;
		while (j < src.length) {
			if (src[j] === '\\') {
				j += 2;
				continue;
			}
			if (src.startsWith('"""', j)) {
				return j + 3;
			}
			j++;
		}
		return -1;
	}
	// Single-line string.
	let j = i + 1;
	while (j < src.length) {
		const char = src[j];
		if (char === '\\') {
			j += 2;
			continue;
		}
		if (char === '"') {
			return j + 1;
		}
		if (char === '\n') {
			return -1;
		}
		j++;
	}
	return -1;
}

/** Skip a `# …` comment starting at `i`; return the index of the terminating newline (or EOF). */
function skipLineComment(src: string, i: number): number {
	let j = i;
	while (j < src.length && src[j] !== '\n') {
		j++;
	}
	return j;
}

/** Skip a balanced `open…close` run starting at `i` (which must be `open`); return index after `close`, or -1. */
function skipBalanced(src: string, i: number, open: string, close: string): number {
	let depth = 0;
	let j = i;
	while (j < src.length) {
		const char = src[j];
		if (char === '"') {
			j = skipString(src, j);
			if (j < 0) {
				return -1;
			}
			continue;
		}
		if (char === '#') {
			j = skipLineComment(src, j);
			continue;
		}
		if (char === open) {
			depth++;
		} else if (char === close) {
			depth--;
			if (depth === 0) {
				return j + 1;
			}
		}
		j++;
	}
	return -1;
}

function skipWhitespace(src: string, i: number): number {
	let j = i;
	while (j < src.length && /[\s,]/.test(src[j])) {
		j++;
	}
	return j;
}

/** True when the word `word` starts at `i` on an identifier boundary. */
function isWordAt(src: string, i: number, word: string): boolean {
	if (!src.startsWith(word, i)) {
		return false;
	}
	if (i > 0 && isIdentChar(src[i - 1])) {
		return false;
	}
	const after = src[i + word.length];
	return after === undefined || !isIdentChar(after);
}

/** Given `i` at the `t` of `type`, return the index just after the matching `}`, or -1 if there's no valid body. */
function readTypeBlockEnd(src: string, start: number): number {
	let i = skipWhitespace(src, start + 4);
	// Type name.
	const nameStart = i;
	while (i < src.length && isIdentChar(src[i])) {
		i++;
	}
	if (i === nameStart) {
		return -1;
	}
	// Header (directives) up to the body's opening brace.
	while (i < src.length) {
		const char = src[i];
		if (char === '"') {
			i = skipString(src, i);
			if (i < 0) {
				return -1;
			}
			continue;
		}
		if (char === '#') {
			i = skipLineComment(src, i);
			continue;
		}
		if (char === '(') {
			i = skipBalanced(src, i, '(', ')');
			if (i < 0) {
				return -1;
			}
			continue;
		}
		if (char === '{') {
			break;
		}
		if (char === '}') {
			return -1;
		}
		i++;
	}
	if (i >= src.length || src[i] !== '{') {
		return -1;
	}
	return skipBalanced(src, i, '{', '}');
}

interface TypeBlock {
	start: number;
	end: number;
}

/** Locate every top-level `type … { … }` block. */
function findTypeBlocks(src: string): { blocks: TypeBlock[]; ok: boolean } {
	const blocks: TypeBlock[] = [];
	let i = 0;
	while (i < src.length) {
		const char = src[i];
		if (char === '"') {
			i = skipString(src, i);
			if (i < 0) {
				return { blocks, ok: false };
			}
			continue;
		}
		if (char === '#') {
			i = skipLineComment(src, i);
			continue;
		}
		if (isWordAt(src, i, 'type')) {
			const end = readTypeBlockEnd(src, i);
			if (end > 0) {
				blocks.push({ start: i, end });
				i = end;
				continue;
			}
		}
		i++;
	}
	return { blocks, ok: true };
}

/* -------------------------------------------------------------------------- */
/* Directive + argument parsing                                                */
/* -------------------------------------------------------------------------- */

/** Read one directive value token (string/list/object/number/enum/…) starting at `i`. */
function readValueToken(src: string, i: number): number {
	const char = src[i];
	if (char === '"') {
		const end = skipString(src, i);
		return end < 0 ? src.length : end;
	}
	if (char === '[') {
		const end = skipBalanced(src, i, '[', ']');
		return end < 0 ? src.length : end;
	}
	if (char === '{') {
		const end = skipBalanced(src, i, '{', '}');
		return end < 0 ? src.length : end;
	}
	let j = i;
	while (j < src.length && !/[\s,)]/.test(src[j])) {
		j++;
	}
	return j;
}

function parseArgs(inner: string): DirectiveArg[] {
	const args: DirectiveArg[] = [];
	let i = 0;
	while (i < inner.length) {
		i = skipWhitespace(inner, i);
		if (i >= inner.length) {
			break;
		}
		if (inner[i] === '#') {
			i = skipLineComment(inner, i);
			continue;
		}
		const nameStart = i;
		while (i < inner.length && isIdentChar(inner[i])) {
			i++;
		}
		const name = inner.slice(nameStart, i);
		if (!name) {
			i++;
			continue;
		}
		i = skipWhitespace(inner, i);
		if (inner[i] !== ':') {
			continue;
		}
		i = skipWhitespace(inner, i + 1);
		const valueStart = i;
		i = readValueToken(inner, i);
		args.push({ name, value: inner.slice(valueStart, i).trim() });
	}
	return args;
}

/** Parse a run of `@directive(...)` from `text`, ignoring surrounding whitespace/comments. */
function parseDirectives(text: string): Directive[] {
	const directives: Directive[] = [];
	let i = 0;
	while (i < text.length) {
		const char = text[i];
		if (/\s/.test(char)) {
			i++;
			continue;
		}
		if (char === '#') {
			i = skipLineComment(text, i);
			continue;
		}
		if (char !== '@') {
			i++;
			continue;
		}
		i++;
		const nameStart = i;
		while (i < text.length && isIdentChar(text[i])) {
			i++;
		}
		const name = text.slice(nameStart, i);
		if (!name) {
			continue;
		}
		// Optional argument list.
		let j = i;
		while (j < text.length && /\s/.test(text[j])) {
			j++;
		}
		let args: DirectiveArg[] = [];
		let hadParens = false;
		if (text[j] === '(') {
			const end = skipBalanced(text, j, '(', ')');
			if (end > 0) {
				hadParens = true;
				args = parseArgs(text.slice(j + 1, end - 1));
				i = end;
			}
		}
		directives.push({ name, args, hadParens });
	}
	return directives;
}

/* -------------------------------------------------------------------------- */
/* Field parsing                                                               */
/* -------------------------------------------------------------------------- */

function parseTypeRef(src: string, i: number): { type: TypeRef; end: number } | null {
	i = skipWhitespace(src, i);
	if (src[i] === '[') {
		const inner = parseTypeRef(src, i + 1);
		if (!inner) {
			return null;
		}
		let j = skipWhitespace(src, inner.end);
		if (src[j] !== ']') {
			return null;
		}
		j++;
		let nonNull = false;
		if (src[j] === '!') {
			nonNull = true;
			j++;
		}
		return { type: { kind: 'list', of: inner.type, nonNull }, end: j };
	}
	const nameStart = i;
	while (i < src.length && isIdentChar(src[i])) {
		i++;
	}
	if (i === nameStart) {
		return null;
	}
	const name = src.slice(nameStart, i);
	let nonNull = false;
	if (src[i] === '!') {
		nonNull = true;
		i++;
	}
	return { type: { kind: 'named', name, nonNull }, end: i };
}

/** Skip only spaces/tabs (not newlines), so field parsing stays on one logical line. */
function skipInlineWhitespace(src: string, i: number): number {
	let j = i;
	while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === ',')) {
		j++;
	}
	return j;
}

/** Parse the fields between a type body's braces; return null if anything is malformed. */
function parseFields(body: string): FieldModel[] | null {
	const fields: FieldModel[] = [];
	let pendingComments: string[] = [];
	let i = 0;
	while (i < body.length) {
		const char = body[i];
		if (/[\s,]/.test(char)) {
			i++;
			continue;
		}
		if (char === '#') {
			const end = skipLineComment(body, i);
			pendingComments.push(body.slice(i, end).replace(/\r$/, '').trim());
			i = end;
			continue;
		}
		if (char === '"') {
			const end = skipString(body, i);
			if (end < 0) {
				return null;
			}
			pendingComments.push(body.slice(i, end));
			i = end;
			continue;
		}
		// Field name.
		const nameStart = i;
		while (i < body.length && isIdentChar(body[i])) {
			i++;
		}
		const name = body.slice(nameStart, i);
		if (!name) {
			return null;
		}
		i = skipWhitespace(body, i);
		if (body[i] !== ':') {
			return null;
		}
		const typeRef = parseTypeRef(body, i + 1);
		if (!typeRef) {
			return null;
		}
		i = typeRef.end;
		// Same-line directives.
		const directiveStart = i;
		i = skipInlineWhitespace(body, i);
		while (body[i] === '@') {
			i++;
			while (i < body.length && isIdentChar(body[i])) {
				i++;
			}
			let j = skipInlineWhitespace(body, i);
			if (body[j] === '(') {
				const end = skipBalanced(body, j, '(', ')');
				if (end < 0) {
					return null;
				}
				j = end;
			}
			i = j;
			i = skipInlineWhitespace(body, i);
		}
		const directives = parseDirectives(body.slice(directiveStart, i));
		// Inline trailing comment.
		i = skipInlineWhitespace(body, i);
		let lineComment: string | undefined;
		if (body[i] === '#') {
			const end = skipLineComment(body, i);
			lineComment = body.slice(i, end).replace(/\r$/, '').trim();
			i = end;
		}
		fields.push({
			key: nextFieldKey(),
			leadingComments: pendingComments,
			name,
			type: typeRef.type,
			directives,
			lineComment,
		});
		pendingComments = [];
	}
	return fields;
}

/* -------------------------------------------------------------------------- */
/* Assembling the document                                                     */
/* -------------------------------------------------------------------------- */

/** Parse a `type … { … }` block into a table; return null if it isn't a well-formed `@table`. */
function parseTypeBlock(blockSrc: string, id: string): TableModel | null {
	let i = skipWhitespace(blockSrc, 4); // after `type`
	const nameStart = i;
	while (i < blockSrc.length && isIdentChar(blockSrc[i])) {
		i++;
	}
	const typeName = blockSrc.slice(nameStart, i);
	if (!typeName) {
		return null;
	}
	const braceStart = blockSrc.indexOf('{', i);
	if (braceStart < 0) {
		return null;
	}
	const directives = parseDirectives(blockSrc.slice(i, braceStart));
	if (!findDirective(directives, 'table')) {
		return null;
	}
	const bodyEnd = blockSrc.lastIndexOf('}');
	if (bodyEnd < braceStart) {
		return null;
	}
	const fields = parseFields(blockSrc.slice(braceStart + 1, bodyEnd));
	if (!fields) {
		return null;
	}
	return { id, leading: '', typeName, directives, fields, raw: blockSrc, edited: false };
}

/**
 * Split the gap text preceding a `type` into `[standalone, attached]`, where
 * `attached` is the contiguous run of trailing trivia — `# …` comment lines and
 * `"""…"""` description blocks — (plus the type's own line prefix) that should
 * travel with the table when tables are sorted. A blank or non-trivia line ends
 * the run, so unrelated definitions above it stay put.
 */
function splitAttachedLeading(gap: string): [string, string] {
	const lineStarts = [0];
	for (let k = 0; k < gap.length; k++) {
		if (gap[k] === '\n') {
			lineStarts.push(k + 1);
		}
	}
	const lineCount = lineStarts.length;
	const lineAt = (li: number) =>
		gap.slice(lineStarts[li], li + 1 < lineCount ? lineStarts[li + 1] - 1 : gap.length).replace(/\r$/, '');

	// Mark lines that are part of a `"""…"""` block (a GraphQL description), so the
	// multi-line block is treated as attachable trivia rather than "other" content.
	const inDescription = Array.from({ length: lineCount }, () => false);
	let block = false;
	for (let li = 0; li < lineCount; li++) {
		const startedInBlock = block;
		let delimiters = 0;
		for (let idx = lineAt(li).indexOf('"""'); idx !== -1; idx = lineAt(li).indexOf('"""', idx + 3)) {
			delimiters++;
			block = !block;
		}
		inDescription[li] = startedInBlock || delimiters > 0;
	}

	// The last line (the type's own indentation) is always attached; walk earlier
	// lines while they're description/comment trivia.
	let start = lineStarts[lineCount - 1];
	for (let li = lineCount - 2; li >= 0; li--) {
		const trimmed = lineAt(li).trim();
		if (inDescription[li] || trimmed.startsWith('#')) {
			start = lineStarts[li];
			continue;
		}
		break;
	}
	return [gap.slice(0, start), gap.slice(start)];
}

export function parseSchema(source: string): ParseResult {
	const indent = detectIndent(source);
	const newline = detectNewline(source);
	const { blocks, ok } = findTypeBlocks(source);
	if (!ok) {
		return { document: { segments: [{ kind: 'raw', text: source }], indent, newline }, ok: false };
	}

	const segments: Segment[] = [];
	const pushRaw = (text: string) => {
		if (text) {
			segments.push({ kind: 'raw', text });
		}
	};

	let cursor = 0;
	let tableIndex = 0;
	for (const block of blocks) {
		const gap = source.slice(cursor, block.start);
		const blockSrc = source.slice(block.start, block.end);
		const table = parseTypeBlock(blockSrc, `t${tableIndex}`);
		if (table) {
			const [standalone, attached] = splitAttachedLeading(gap);
			pushRaw(standalone);
			table.leading = attached;
			segments.push({ kind: 'table', table });
			tableIndex++;
		} else {
			// Not an editable `@table` (or malformed) — keep the whole span verbatim.
			pushRaw(gap + blockSrc);
		}
		cursor = block.end;
	}
	pushRaw(source.slice(cursor));

	return { document: { segments, indent, newline }, ok: true };
}
