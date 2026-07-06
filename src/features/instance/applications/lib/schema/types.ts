/**
 * Model for Harper `schema.graphql` files, used by the visual schema editor.
 *
 * A parsed document is an ordered list of {@link Segment}s that concatenate back
 * to the exact original source. A segment is either a `@table` type we can edit
 * visually, or a verbatim `raw` block (comments, scalars, enums, non-`@table`
 * types, whitespace — anything the GUI doesn't model). Keeping everything not
 * understood as raw is how we honour the "never silently drop schema content"
 * requirement: only tables the user actually edits are regenerated; everything
 * else round-trips byte-for-byte.
 *
 * The directive/scalar vocabulary the GUI surfaces lives in
 * `../../components/TextEditorView/harper-language/schema.ts` (a curated mirror
 * of `node_modules/harper/schema.graphql`); this module stays agnostic and
 * preserves whatever directives/args it finds, known or not.
 */

/** A single directive argument, e.g. `database: "blog"`. */
export interface DirectiveArg {
	name: string;
	/**
	 * The argument value as a GraphQL literal, verbatim — `"blog"`, `5`, `true`,
	 * `["a", "b"]`, etc. Stored raw so unrecognized values round-trip untouched;
	 * use {@link stringArgValue} / {@link intArgValue} / {@link boolArgValue} to
	 * interpret it, and the `*Literal` helpers to build one.
	 */
	value: string;
}

/** A directive applied to a type or field, e.g. `@table(database: "blog")`. */
export interface Directive {
	/** Directive name without the leading `@`. */
	name: string;
	args: DirectiveArg[];
	/**
	 * Whether the source wrote parentheses. Preserved so `@export` and the (odd
	 * but legal) `@export()` don't churn; the serializer only emits parens when
	 * there are args.
	 */
	hadParens: boolean;
}

/**
 * A GraphQL type reference. Modelled recursively so arbitrary nesting
 * (`[String!]!`, `[[Int]]`) round-trips exactly, while the GUI works with the
 * common single-level list / non-null case via {@link baseTypeName}.
 */
export type TypeRef =
	| { kind: 'named'; name: string; nonNull: boolean }
	| { kind: 'list'; of: TypeRef; nonNull: boolean };

export interface FieldModel {
	/**
	 * Comment (`# …`) and description (`"""…"""`) lines that immediately precede
	 * the field, each captured verbatim (without the structural indent). Re-emitted
	 * above the field when the table is regenerated.
	 */
	leadingComments: string[];
	name: string;
	type: TypeRef;
	directives: Directive[];
	/** Inline `# …` trailing comment on the field's own line, if any. */
	lineComment?: string;
}

export interface TableModel {
	/** Stable id for React keys and reducer targeting; not derived from content. */
	id: string;
	/**
	 * Trivia (description string and/or contiguous `#` comment lines) attached to
	 * this type — captured verbatim so it travels with the table when tables are
	 * sorted alphabetically. Excludes blank-line-separated trivia (that stays a
	 * standalone raw segment).
	 */
	leading: string;
	typeName: string;
	directives: Directive[];
	fields: FieldModel[];
	/**
	 * The exact original source of `type … { … }` (excluding {@link leading}).
	 * Emitted verbatim while {@link edited} is false, guaranteeing untouched
	 * tables never reformat.
	 */
	raw: string;
	/** Set once the user mutates the table, switching it to canonical generation. */
	edited: boolean;
}

export type Segment =
	| { kind: 'raw'; text: string }
	| { kind: 'table'; table: TableModel };

export interface SchemaDocument {
	segments: Segment[];
	/** Indentation unit detected from the source (a tab or N spaces). */
	indent: string;
	/** Newline detected from the source (`\n` or `\r\n`). */
	newline: string;
}

export interface ParseResult {
	document: SchemaDocument;
	/**
	 * False when the source couldn't be scanned safely (unbalanced braces, etc.).
	 * The view falls back to the text editor rather than risk mangling the file.
	 */
	ok: boolean;
}

/* -------------------------------------------------------------------------- */
/* Type-ref helpers                                                            */
/* -------------------------------------------------------------------------- */

/** The innermost named type, e.g. `String` for `[String!]!`. */
export function baseTypeName(type: TypeRef): string {
	return type.kind === 'named' ? type.name : baseTypeName(type.of);
}

/** True when the type is a single-level list (`[T]` / `[T!]` / `[T]!`). */
export function isListType(type: TypeRef): boolean {
	return type.kind === 'list';
}

/** Render a {@link TypeRef} back to GraphQL, e.g. `[String!]!`. */
export function formatTypeRef(type: TypeRef): string {
	if (type.kind === 'named') {
		return `${type.name}${type.nonNull ? '!' : ''}`;
	}
	return `[${formatTypeRef(type.of)}]${type.nonNull ? '!' : ''}`;
}

/* -------------------------------------------------------------------------- */
/* Directive / argument value helpers                                          */
/* -------------------------------------------------------------------------- */

export function findDirective(directives: Directive[], name: string): Directive | undefined {
	return directives.find(directive => directive.name === name);
}

export function findArg(directive: Directive | undefined, name: string): DirectiveArg | undefined {
	return directive?.args.find(arg => arg.name === name);
}

/** Interpret a GraphQL string literal (`"blog"`) as its text, else undefined. */
export function stringArgValue(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
		try {
			// GraphQL string literals share JSON's escape syntax for our purposes.
			return JSON.parse(trimmed) as string;
		} catch {
			return trimmed.slice(1, -1);
		}
	}
	return undefined;
}

/** Interpret a GraphQL int/float literal as a number, else undefined. */
export function intArgValue(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const parsed = Number(value.trim());
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** Interpret a GraphQL boolean literal, else undefined. */
export function boolArgValue(value: string | undefined): boolean | undefined {
	const trimmed = value?.trim();
	return trimmed === 'true' ? true : trimmed === 'false' ? false : undefined;
}

/** Build a GraphQL string literal from text, e.g. `blog` → `"blog"`. */
export function stringLiteral(text: string): string {
	return JSON.stringify(text);
}

export function intLiteral(value: number): string {
	return String(Math.trunc(value));
}

export function boolLiteral(value: boolean): string {
	return value ? 'true' : 'false';
}
