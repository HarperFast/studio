/**
 * Harper-aware GraphQL language support for Monaco: completion (directives,
 * scalars, directive arguments) and hover documentation. Monaco's built-in
 * GraphQL language only provides syntax highlighting, so these providers add
 * the Harper-specific intelligence sourced from `./schema`.
 */
import { Monaco } from '@/lib/monaco/types';
import {
	availableOn,
	findArgInputType,
	findDirective,
	findScalar,
	HarperDirective,
	HarperDirectiveArg,
	harperDirectives,
	HarperInputType,
	harperInputTypes,
	HarperScalar,
	harperScalars,
} from './schema';

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for unit testing — no Monaco dependency).           */
/* -------------------------------------------------------------------------- */

export type GraphqlCompletionContext =
	| { kind: 'directive' }
	| { kind: 'directiveArg'; directive: string }
	/** Inside an object literal a directive argument takes, e.g. a source in `@fullText(fields: [{ … }])`. */
	| { kind: 'inputField'; directive: string; inputType: string }
	| { kind: 'fieldType' }
	| { kind: 'none' };

const DIRECTIVE_NAME_RE = /@\w*$/;
const FIELD_TYPE_RE = /:\s*\[?\s*\w*$/;
const NAME_START_RE = /[_A-Za-z]/;
const NAME_CHAR_RE = /[_0-9A-Za-z]/;

type Frame =
	| { kind: 'directive'; name: string }
	| { kind: 'paren' }
	/** `key` is the argument or object field the bracket is the value of, when there is one. */
	| { kind: 'list' | 'object'; key?: string };

/**
 * Index just past the string or comment starting at `i`, or -1 when it is still open at the end of the
 * text: the cursor is inside it.
 */
function skipStringOrComment(text: string, i: number): number {
	if (text[i] === '#') {
		return text.indexOf('\n', i);
	}
	if (text.startsWith('"""', i)) {
		const end = text.indexOf('"""', i + 3);
		return end < 0 ? -1 : end + 3;
	}
	let j = i + 1;
	while (j < text.length && text[j] !== '"' && text[j] !== '\n') {
		j += text[j] === '\\' ? 2 : 1;
	}
	return j >= text.length ? -1 : j + 1;
}

/**
 * The directive call the cursor sits inside, and how deep: `undefined` when it's in none, and `none`
 * inside a string or comment. Reads more than the cursor's line, because Harper's docs spread a
 * `@fullText(...)` over several.
 */
function openDirectiveContext(textBeforeCursor: string): GraphqlCompletionContext | undefined {
	const stack: Frame[] = [];
	let lastKey: string | undefined;
	let pendingDirective: string | undefined;
	let i = 0;
	while (i < textBeforeCursor.length) {
		const char = textBeforeCursor[i];
		if (char === '#' || char === '"') {
			i = skipStringOrComment(textBeforeCursor, i);
			if (i < 0) {
				return { kind: 'none' };
			}
			pendingDirective = undefined;
			continue;
		}
		if (char === '@' || NAME_START_RE.test(char)) {
			let end = char === '@' ? i + 1 : i;
			while (end < textBeforeCursor.length && NAME_CHAR_RE.test(textBeforeCursor[end])) {
				end++;
			}
			const name = textBeforeCursor.slice(char === '@' ? i + 1 : i, end);
			let next = end;
			while (next < textBeforeCursor.length && /[\s,]/.test(textBeforeCursor[next])) {
				next++;
			}
			pendingDirective = char === '@' ? name : undefined;
			if (char !== '@' && textBeforeCursor[next] === ':') {
				lastKey = name;
			}
			i = end;
			continue;
		}
		switch (char) {
			case '(':
				stack.push(pendingDirective ? { kind: 'directive', name: pendingDirective } : { kind: 'paren' });
				break;
			case '[':
				stack.push({ kind: 'list', key: lastKey });
				break;
			case '{':
				stack.push({ kind: 'object', key: lastKey });
				break;
			case ')':
			case ']':
			case '}':
				stack.pop();
				break;
		}
		if ('()[]{}'.includes(char)) {
			// A key names the value that follows it, so it never outlives the next bracket.
			lastKey = undefined;
		}
		if (!/[\s,]/.test(char)) {
			pendingDirective = undefined;
		}
		i++;
	}

	let directiveAt = stack.length - 1;
	while (directiveAt >= 0 && stack[directiveAt].kind !== 'directive') {
		directiveAt--;
	}
	if (directiveAt < 0) {
		return undefined;
	}
	const directive = (stack[directiveAt] as { name: string }).name;
	const inner = stack.slice(directiveAt + 1);
	if (inner.length === 0) {
		return { kind: 'directiveArg', directive };
	}
	// `arg: { … }` or `arg: [{ … }]`: the object takes the argument's input type.
	const [first, second] = inner;
	const objectOfArg = inner.length === 1 && first.kind === 'object'
		? first.key
		: inner.length === 2 && first.kind === 'list' && second.kind === 'object'
		? first.key
		: undefined;
	const inputType = objectOfArg ? findArgInputType(directive, objectOfArg) : undefined;
	return inputType ? { kind: 'inputField', directive, inputType: inputType.name } : { kind: 'none' };
}

/**
 * Classify what Harper-aware completions to offer from the text before the cursor. Order matters: an
 * open directive call (which may itself contain a `:`) is detected before a field-type position.
 */
export function detectCompletionContext(textBeforeCursor: string): GraphqlCompletionContext {
	const inDirective = openDirectiveContext(textBeforeCursor);
	if (inDirective) {
		return inDirective;
	}
	const lineBeforeCursor = textBeforeCursor.slice(textBeforeCursor.lastIndexOf('\n') + 1);
	if (DIRECTIVE_NAME_RE.test(lineBeforeCursor)) {
		return { kind: 'directive' };
	}
	if (FIELD_TYPE_RE.test(lineBeforeCursor)) {
		return { kind: 'fieldType' };
	}
	return { kind: 'none' };
}

// At the start of the line, as declarations are written, and followed by a name or `{`, never `:` or
// `(`: an indented line is a field, an argument, or a description that happens to begin "type of …".
const DECLARATION_LINE_RE = /^(?:extend\s+)?(?:type|input|interface|enum|scalar|union|schema|directive)\b(?!\s*[:(])/;

/**
 * The line a context scan starts from: the nearest declaration at or above `lineNumber`. A directive's
 * arguments never leave the declaration they are in, so the scan covers one type rather than every
 * line above the cursor, which ran on each suggestion and hover.
 */
export function declarationStartLine(lineAt: (lineNumber: number) => string, lineNumber: number): number {
	for (let candidate = lineNumber; candidate > 1; candidate--) {
		if (DECLARATION_LINE_RE.test(lineAt(candidate))) {
			return candidate;
		}
	}
	return 1;
}

let harperVersion: string | undefined;

/**
 * The Harper version the editor is completing for, so it offers only what that release has
 * (`FullText` and `@fullText` from 5.3.0). Monaco's providers are global, so the open instance sets
 * it; `undefined` (unknown) offers only what every release has.
 */
export function setHarperGraphqlVersion(version: string | undefined): void {
	harperVersion = version;
}

/** Extract the names of types/inputs/interfaces/enums/scalars/unions declared in the document. */
export function parseTypeNames(documentText: string): string[] {
	const names = new Set<string>();
	const re = /\b(?:type|input|interface|enum|scalar|union)\s+([A-Za-z_]\w*)/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(documentText))) {
		names.add(match[1]);
	}
	return [...names];
}

export type GraphqlHoverTarget =
	| { kind: 'directive'; directive: HarperDirective }
	| { kind: 'scalar'; scalar: HarperScalar }
	| { kind: 'directiveArg'; directive: HarperDirective; arg: HarperDirectiveArg }
	| { kind: 'inputField'; inputType: HarperInputType; field: HarperDirectiveArg }
	| undefined;

/**
 * Classify the hovered word into a Harper directive, scalar, directive argument, or a field of an
 * argument's input object. `textBeforeWord` runs from the start of the document, since a directive's
 * arguments can span lines.
 */
export function detectHoverTarget(
	{ word, charBeforeWord, textBeforeWord }: { word: string; charBeforeWord: string; textBeforeWord: string },
): GraphqlHoverTarget {
	if (charBeforeWord === '@') {
		const directive = findDirective(word);
		return directive ? { kind: 'directive', directive } : undefined;
	}

	const scalar = findScalar(word);
	if (scalar) {
		return { kind: 'scalar', scalar };
	}

	const context = openDirectiveContext(textBeforeWord);
	if (context?.kind === 'directiveArg') {
		const directive = findDirective(context.directive);
		const arg = directive?.args.find(candidate => candidate.name === word);
		if (directive && arg) {
			return { kind: 'directiveArg', directive, arg };
		}
	}
	if (context?.kind === 'inputField') {
		const inputType = harperInputTypes.find(input => input.name === context.inputType);
		const field = inputType?.fields.find(candidate => candidate.name === word);
		if (inputType && field) {
			return { kind: 'inputField', inputType, field };
		}
	}

	return undefined;
}

/** Build a one-line GraphQL-style signature for a directive, e.g. `@table(table: String, …) on OBJECT`. */
export function buildDirectiveSignature(directive: HarperDirective): string {
	const args = directive.args.length > 0
		? `(${directive.args.map(arg => `${arg.name}: ${arg.type}`).join(', ')})`
		: '';
	return `@${directive.name}${args} on ${directive.locations.join(' | ')}`;
}

/** Build the markdown shown when hovering a Harper directive/scalar/argument. */
export function hoverMarkdownValue(target: NonNullable<GraphqlHoverTarget>): string {
	switch (target.kind) {
		case 'directive':
			return `\`\`\`graphql\n${buildDirectiveSignature(target.directive)}\n\`\`\`\n\n${target.directive.description}`;
		case 'scalar': {
			const tag = target.scalar.harperSpecific ? 'Harper scalar' : 'GraphQL scalar';
			return `\`\`\`graphql\nscalar ${target.scalar.name}\n\`\`\`\n\n_${tag}_\n\n${target.scalar.description}`;
		}
		case 'directiveArg':
			return `\`\`\`graphql\n${target.arg.name}: ${target.arg.type}\n\`\`\`\n\n_argument of \`@${target.directive.name}\`_\n\n${target.arg.description}`;
		case 'inputField':
			return `\`\`\`graphql\n${target.field.name}: ${target.field.type}\n\`\`\`\n\n_field of \`${target.inputType.name}\`_\n\n${target.field.description}`;
	}
}

/* -------------------------------------------------------------------------- */
/* Monaco registration.                                                       */
/* -------------------------------------------------------------------------- */

type CompletionRange = {
	startLineNumber: number;
	endLineNumber: number;
	startColumn: number;
	endColumn: number;
};

function directiveCompletions(monaco: Monaco, range: CompletionRange) {
	return harperDirectives.filter(directive => availableOn(directive, harperVersion)).map(directive => {
		const hasArgs = directive.args.length > 0;
		return {
			label: `@${directive.name}`,
			kind: monaco.languages.CompletionItemKind.Function,
			detail: `directive · ${directive.locations.join(' | ')}`,
			documentation: { value: directive.description },
			filterText: directive.name,
			insertText: hasArgs ? `${directive.name}($1)` : directive.name,
			insertTextRules: hasArgs ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
			range,
		};
	});
}

function fieldTypeCompletions(monaco: Monaco, range: CompletionRange, typeNames: string[]) {
	const scalarItems = harperScalars.filter(scalar => availableOn(scalar, harperVersion)).map(scalar => ({
		label: scalar.name,
		kind: monaco.languages.CompletionItemKind.Struct,
		detail: scalar.harperSpecific ? 'Harper scalar' : 'GraphQL scalar',
		documentation: { value: scalar.description },
		insertText: scalar.name,
		range,
	}));
	const typeItems = typeNames.map(name => ({
		label: name,
		kind: monaco.languages.CompletionItemKind.Class,
		detail: 'type',
		insertText: name,
		range,
	}));
	return [...scalarItems, ...typeItems];
}

function directiveArgCompletions(monaco: Monaco, range: CompletionRange, directiveName: string) {
	const directive = findDirective(directiveName);
	if (!directive) {
		return [];
	}
	return directive.args.map(arg => ({
		label: arg.name,
		kind: monaco.languages.CompletionItemKind.Field,
		detail: arg.type,
		documentation: { value: arg.description },
		insertText: `${arg.name}: $1`,
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		range,
	}));
}

function inputFieldCompletions(monaco: Monaco, range: CompletionRange, inputTypeName: string) {
	const inputType = harperInputTypes.find(input => input.name === inputTypeName);
	return (inputType?.fields ?? []).map(field => ({
		label: field.name,
		kind: monaco.languages.CompletionItemKind.Property,
		detail: `${field.type} · ${inputType!.name}`,
		documentation: { value: field.description },
		insertText: `${field.name}: $1`,
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		range,
	}));
}

export function registerHarperGraphql(monaco: Monaco): void {
	monaco.languages.registerCompletionItemProvider('graphql', {
		triggerCharacters: ['@', ':', '(', '{'],
		provideCompletionItems(model, position) {
			// From the declaration the cursor is in, not just its line: a directive's arguments can span lines.
			const textBeforeCursor = model.getValueInRange({
				startLineNumber: declarationStartLine(lineNumber => model.getLineContent(lineNumber), position.lineNumber),
				startColumn: 1,
				endLineNumber: position.lineNumber,
				endColumn: position.column,
			});
			const word = model.getWordUntilPosition(position);
			const range: CompletionRange = {
				startLineNumber: position.lineNumber,
				endLineNumber: position.lineNumber,
				startColumn: word.startColumn,
				endColumn: word.endColumn,
			};

			const context = detectCompletionContext(textBeforeCursor);
			switch (context.kind) {
				case 'directive':
					return { suggestions: directiveCompletions(monaco, range) };
				case 'directiveArg':
					return { suggestions: directiveArgCompletions(monaco, range, context.directive) };
				case 'inputField':
					return { suggestions: inputFieldCompletions(monaco, range, context.inputType) };
				case 'fieldType':
					return { suggestions: fieldTypeCompletions(monaco, range, parseTypeNames(model.getValue())) };
				default:
					return { suggestions: [] };
			}
		},
	});

	monaco.languages.registerHoverProvider('graphql', {
		provideHover(model, position) {
			const wordInfo = model.getWordAtPosition(position);
			if (!wordInfo) {
				return null;
			}
			const charBeforeWord = wordInfo.startColumn > 1
				? model.getValueInRange({
					startLineNumber: position.lineNumber,
					startColumn: wordInfo.startColumn - 1,
					endLineNumber: position.lineNumber,
					endColumn: wordInfo.startColumn,
				})
				: '';
			const textBeforeWord = model.getValueInRange({
				startLineNumber: declarationStartLine(lineNumber => model.getLineContent(lineNumber), position.lineNumber),
				startColumn: 1,
				endLineNumber: position.lineNumber,
				endColumn: wordInfo.startColumn,
			});

			const target = detectHoverTarget({ word: wordInfo.word, charBeforeWord, textBeforeWord });
			if (!target) {
				return null;
			}

			return {
				range: new monaco.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, wordInfo.endColumn),
				contents: [{ value: hoverMarkdownValue(target) }],
			};
		},
	});
}
