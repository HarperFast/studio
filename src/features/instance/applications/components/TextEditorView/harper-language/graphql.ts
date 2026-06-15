/**
 * Harper-aware GraphQL language support for Monaco: completion (directives,
 * scalars, directive arguments) and hover documentation. Monaco's built-in
 * GraphQL language only provides syntax highlighting, so these providers add
 * the Harper-specific intelligence sourced from `./schema`.
 */
import { Monaco } from '@/lib/monaco/types';
import {
	findDirective,
	findScalar,
	HarperDirective,
	HarperDirectiveArg,
	harperDirectives,
	HarperScalar,
	harperScalars,
} from './schema';

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for unit testing — no Monaco dependency).           */
/* -------------------------------------------------------------------------- */

export type GraphqlCompletionContext =
	| { kind: 'directive' }
	| { kind: 'directiveArg'; directive: string }
	| { kind: 'fieldType' }
	| { kind: 'none' };

const DIRECTIVE_ARG_RE = /@(\w+)\s*\([^)]*$/;
const DIRECTIVE_NAME_RE = /@\w*$/;
const FIELD_TYPE_RE = /:\s*\[?\s*\w*$/;

/**
 * Classify what Harper-aware completions to offer based on the text on the
 * current line up to the cursor. Order matters: an open directive call (which
 * may itself contain a `:`) is detected before a field-type position.
 */
export function detectCompletionContext(lineBeforeCursor: string): GraphqlCompletionContext {
	const argMatch = lineBeforeCursor.match(DIRECTIVE_ARG_RE);
	if (argMatch) {
		return { kind: 'directiveArg', directive: argMatch[1] };
	}
	if (DIRECTIVE_NAME_RE.test(lineBeforeCursor)) {
		return { kind: 'directive' };
	}
	if (FIELD_TYPE_RE.test(lineBeforeCursor)) {
		return { kind: 'fieldType' };
	}
	return { kind: 'none' };
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
	| undefined;

/** Classify the hovered word into a Harper directive, scalar, or directive argument. */
export function detectHoverTarget(
	{ word, charBeforeWord, lineBeforeWord }: { word: string; charBeforeWord: string; lineBeforeWord: string },
): GraphqlHoverTarget {
	if (charBeforeWord === '@') {
		const directive = findDirective(word);
		return directive ? { kind: 'directive', directive } : undefined;
	}

	const scalar = findScalar(word);
	if (scalar) {
		return { kind: 'scalar', scalar };
	}

	const argMatch = lineBeforeWord.match(DIRECTIVE_ARG_RE);
	if (argMatch) {
		const directive = findDirective(argMatch[1]);
		const arg = directive?.args.find(candidate => candidate.name === word);
		if (directive && arg) {
			return { kind: 'directiveArg', directive, arg };
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
	return harperDirectives.map(directive => {
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
	const scalarItems = harperScalars.map(scalar => ({
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

export function registerHarperGraphql(monaco: Monaco): void {
	monaco.languages.registerCompletionItemProvider('graphql', {
		triggerCharacters: ['@', ':', '('],
		provideCompletionItems(model, position) {
			const lineBeforeCursor = model.getValueInRange({
				startLineNumber: position.lineNumber,
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

			const context = detectCompletionContext(lineBeforeCursor);
			switch (context.kind) {
				case 'directive':
					return { suggestions: directiveCompletions(monaco, range) };
				case 'directiveArg':
					return { suggestions: directiveArgCompletions(monaco, range, context.directive) };
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
			const lineBeforeWord = model.getValueInRange({
				startLineNumber: position.lineNumber,
				startColumn: 1,
				endLineNumber: position.lineNumber,
				endColumn: wordInfo.startColumn,
			});

			const target = detectHoverTarget({ word: wordInfo.word, charBeforeWord, lineBeforeWord });
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
