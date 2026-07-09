/**
 * Pure helpers the visual editor uses to read and mutate a {@link TableModel}
 * without knowing GraphQL syntax. Every function returns new objects (never
 * mutates in place) so React state updates stay predictable. The directive
 * vocabulary itself lives in the harper-language metadata; these helpers only
 * add/remove/toggle whatever the GUI asks for and leave everything else intact.
 */
import {
	baseTypeName,
	boolLiteral,
	Directive,
	DirectiveArg,
	FieldModel,
	intLiteral,
	stringLiteral,
	TableModel,
	TypeRef,
} from './types';

let fieldKeySeed = 0;
/** Monotonic key for new fields (React lists); not derived from content. */
export function nextFieldKey(): string {
	return `f${fieldKeySeed++}`;
}

export function createField(name = ''): FieldModel {
	return {
		key: nextFieldKey(),
		leadingComments: [],
		name,
		type: { kind: 'named', name: 'String', nonNull: false },
		directives: [],
	};
}

/** A fresh table matching the defaults of the old New-Table modal. */
export function createTable(id: string): TableModel {
	return {
		id,
		leading: '',
		typeName: '',
		directives: [
			{ name: 'table', args: [], hadParens: false },
			{ name: 'export', args: [], hadParens: false },
			{ name: 'sealed', args: [], hadParens: false },
		],
		fields: [
			{
				key: nextFieldKey(),
				leadingComments: [],
				name: 'id',
				type: { kind: 'named', name: 'ID', nonNull: false },
				directives: [{ name: 'primaryKey', args: [], hadParens: false }],
			},
		],
		raw: '',
		edited: true,
	};
}

/* ------------------------------ directives -------------------------------- */

export function hasDirective(directives: Directive[], name: string): boolean {
	return directives.some(directive => directive.name === name);
}

/** Add or remove a bare directive (e.g. `@sealed`, `@export`), keeping any existing args. */
export function setDirectivePresent(directives: Directive[], name: string, present: boolean): Directive[] {
	if (present === hasDirective(directives, name)) {
		return directives;
	}
	return present
		? [...directives, { name, args: [], hadParens: false }]
		: directives.filter(directive => directive.name !== name);
}

export function getArgValue(directives: Directive[], directiveName: string, argName: string): string | undefined {
	return directives.find(d => d.name === directiveName)?.args.find(a => a.name === argName)?.value;
}

/**
 * Set (or, when `value` is undefined, remove) a directive argument. Creating an
 * argument implicitly creates its directive; removing the last argument leaves
 * the bare directive in place (its presence is controlled separately).
 */
export function setArg(
	directives: Directive[],
	directiveName: string,
	argName: string,
	value: string | undefined,
): Directive[] {
	const withDirective = hasDirective(directives, directiveName)
		? directives
		: [...directives, { name: directiveName, args: [], hadParens: false }];
	return withDirective.map(directive => {
		if (directive.name !== directiveName) {
			return directive;
		}
		const others = directive.args.filter(arg => arg.name !== argName);
		const nextArgs: DirectiveArg[] = value === undefined ? others : [...others, { name: argName, value }];
		return { ...directive, args: nextArgs };
	});
}

/* --------------------------- typed arg accessors -------------------------- */

export function setStringArg(directives: Directive[], dir: string, arg: string, text: string): Directive[] {
	return setArg(directives, dir, arg, text ? stringLiteral(text) : undefined);
}

export function setIntArg(directives: Directive[], dir: string, arg: string, value: number | undefined): Directive[] {
	return setArg(directives, dir, arg, value === undefined || Number.isNaN(value) ? undefined : intLiteral(value));
}

/** Set a boolean arg, or remove it entirely when it matches its documented default. */
export function setBoolArg(
	directives: Directive[],
	dir: string,
	arg: string,
	value: boolean,
	defaultValue: boolean,
): Directive[] {
	return setArg(directives, dir, arg, value === defaultValue ? undefined : boolLiteral(value));
}

/* -------------------------------- fields ---------------------------------- */

/** Rebuild a field's type ref from the GUI's base-type / array / non-null controls. */
export function buildType(baseName: string, list: boolean, nonNull: boolean): TypeRef {
	const named: TypeRef = { kind: 'named', name: baseName, nonNull: list ? false : nonNull };
	return list ? { kind: 'list', of: named, nonNull } : named;
}

export function fieldBaseType(field: FieldModel): string {
	return baseTypeName(field.type);
}

export function fieldIsList(field: FieldModel): boolean {
	return field.type.kind === 'list';
}

/** Outermost non-null (`String!` or `[String]!`); the GUI's "required" toggle. */
export function fieldIsNonNull(field: FieldModel): boolean {
	return field.type.nonNull;
}
