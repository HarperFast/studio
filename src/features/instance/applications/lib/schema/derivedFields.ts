/**
 * `@embed` and `@decide`: fields Harper fills from another field, with a model, whenever a record is
 * written. `@embed(source, model)` puts an embedding of `source` into a `[Float]` field and indexes it
 * for vector search. `@decide(source, …)` has a decision model pick the value of a `String` (from
 * `values`), `Boolean`, or `Int` (from `minimum` to `maximum`) field.
 *
 * A schema Harper refuses fails to load as a whole, so {@link derivedFieldErrors} checks what Harper
 * checks, and nothing more: each rule is one Harper throws in `resources/graphql.ts`,
 * `resources/models/embedHook.ts` (`assertDerivedFieldOwnership`) or `resources/models/decision.ts`
 * (`validateLeaf`), the same at v5.3.6 and on 5.4. The rules were also run against a live Harper
 * 5.4.0-beta.4: 55 schemas, valid and not, each deployed as its own app, and Harper loaded exactly the
 * ones this accepts. When a rule here changes, repeat that rather than trusting a reading of the source:
 * the first reading missed that a directive can't read a field another one fills.
 */
import { parseGraphqlValue, printGraphqlValue } from './graphqlValue';
import { getArgValue, hasDirective, setArg, setDirectivePresent } from './mutations';
import { Directive, FieldModel, findDirective, stringArgValue, TableModel } from './types';

export const EMBED_DIRECTIVE = 'embed';
export const DECIDE_DIRECTIVE = 'decide';

export type DecideLeaf = 'String' | 'Boolean' | 'Int';

const DECIDE_LEAVES: readonly string[] = ['String', 'Boolean', 'Int'];
const DECIDE_STRING_ARGS = ['source', 'model', 'confidence', 'decision', 'instructions'];
const DECIDE_INT_ARGS = ['minimum', 'maximum'];
/** The most values one decision can choose between (harper `MAX_LEAF_VALUES`). */
const MAX_DECISION_VALUES = 255;
const INT_LITERAL = /^-?(?:0|[1-9]\d*)$/;

/** Whether the field is a vector Harper can embed into: a list of `Float`. */
export function canEmbed(field: FieldModel): boolean {
	return field.type.kind === 'list' && field.type.of.kind === 'named' && field.type.of.name === 'Float';
}

/** The kind of decision the field's type selects, when it can hold one. */
export function decideLeaf(field: FieldModel): DecideLeaf | undefined {
	return field.type.kind === 'named' && DECIDE_LEAVES.includes(field.type.name)
		? field.type.name as DecideLeaf
		: undefined;
}

/** The other fields of the table, by name: what a derived field can be filled from. */
export function derivedSourceNames(table: TableModel, field: FieldModel): string[] {
	return table.fields.filter((other) => other !== field && other.name.trim() !== '').map((other) => other.name);
}

/** Turns `@embed` on or off. A plain `@indexed` already on the field becomes the HNSW index `@embed` needs. */
export function withEmbed(field: FieldModel, on: boolean): FieldModel {
	let directives = setDirectivePresent(field.directives, EMBED_DIRECTIVE, on);
	if (on && hasDirective(directives, 'indexed') && getArgValue(directives, 'indexed', 'type') === undefined) {
		directives = setArg(directives, 'indexed', 'type', '"HNSW"');
	}
	return { ...field, directives };
}

export function withDecide(field: FieldModel, on: boolean): FieldModel {
	return { ...field, directives: setDirectivePresent(field.directives, DECIDE_DIRECTIVE, on) };
}

/** The strings in `@decide(values: […])`. Undefined when the argument is absent or isn't a list of strings. */
export function decideValues(directives: Directive[]): string[] | undefined {
	const literal = getArgValue(directives, DECIDE_DIRECTIVE, 'values');
	const parsed = literal === undefined ? undefined : parseGraphqlValue(literal)?.value;
	return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string') ? parsed as string[] : undefined;
}

/** Sets `@decide(values: […])`, or removes the argument when the list is empty. */
export function setDecideValues(directives: Directive[], values: string[]): Directive[] {
	return setArg(directives, DECIDE_DIRECTIVE, 'values', values.length > 0 ? printGraphqlValue(values) : undefined);
}

function intArg(directives: Directive[], name: string): number | undefined {
	const literal = getArgValue(directives, DECIDE_DIRECTIVE, name)?.trim();
	return literal !== undefined && INT_LITERAL.test(literal) ? Number(literal) : undefined;
}

function embedErrors(field: FieldModel, directive: Directive, fieldNames: ReadonlySet<string>): string[] {
	const errors: string[] = [];
	for (const arg of directive.args) {
		if (stringArgValue(arg.value) === undefined) {
			errors.push(`@embed's "${arg.name}" must be a quoted string.`);
		}
	}
	if (!canEmbed(field)) {
		errors.push('@embed needs a [Float] field: choose Float and turn on Array.');
	}
	const source = stringArgValue(getArgValue(field.directives, EMBED_DIRECTIVE, 'source'));
	if (!source) {
		errors.push('Choose the field to embed.');
	} else if (!fieldNames.has(source)) {
		errors.push(`There is no field named "${source}" to embed.`);
	}
	if (!stringArgValue(getArgValue(field.directives, EMBED_DIRECTIVE, 'model'))) {
		errors.push('Choose the embedding model.');
	}
	if (
		hasDirective(field.directives, 'indexed')
		&& stringArgValue(getArgValue(field.directives, 'indexed', 'type')) !== 'HNSW'
	) {
		errors.push('@embed indexes the field with HNSW itself: set the index type to HNSW, or turn Indexed off.');
	}
	return errors;
}

/** The type each field `@decide` can also fill must have (harper `assertDerivedFieldOwnership`). */
const DECIDE_TARGET_TYPES: Record<string, string> = { confidence: 'Float', decision: 'String' };

function decideErrors(
	field: FieldModel,
	directive: Directive,
	fieldNames: ReadonlySet<string>,
	table: TableModel,
): string[] {
	const errors: string[] = [];
	const str = (name: string) => stringArgValue(getArgValue(field.directives, DECIDE_DIRECTIVE, name));
	const has = (name: string) => directive.args.some((arg) => arg.name === name);
	for (const arg of directive.args) {
		if (DECIDE_STRING_ARGS.includes(arg.name)) {
			if (stringArgValue(arg.value) === undefined) {
				errors.push(`@decide's "${arg.name}" must be a quoted string.`);
			}
		} else if (DECIDE_INT_ARGS.includes(arg.name)) {
			if (!INT_LITERAL.test(arg.value.trim())) {
				errors.push(`@decide's "${arg.name}" must be a whole number.`);
			}
		} else if (arg.name === 'values') {
			if (decideValues(field.directives) === undefined) {
				errors.push('@decide\'s "values" must be a list of quoted strings.');
			}
		} else {
			errors.push(`@decide has no "${arg.name}" argument.`);
		}
	}

	const source = str('source');
	if (!source) {
		errors.push('Choose the field to decide from.');
	} else if (!fieldNames.has(source)) {
		errors.push(`There is no field named "${source}" to decide from.`);
	}
	for (const name of ['confidence', 'decision']) {
		const target = str(name);
		if (has(name) && !target) {
			errors.push(`@decide's "${name}" must name a field.`);
		} else if (target && !fieldNames.has(target)) {
			errors.push(`There is no field named "${target}" for @decide's "${name}".`);
		} else if (target) {
			const type = DECIDE_TARGET_TYPES[name];
			const filled = table.fields.find((other) => other.name === target);
			if (filled && !(filled.type.kind === 'named' && filled.type.name === type)) {
				errors.push(`@decide's "${name}" needs a ${type} field, and "${target}" isn't one.`);
			} else if (filled?.type.nonNull) {
				errors.push(`@decide's "${name}" field "${target}" can't be required: an empty source clears it.`);
			}
			if (filled && (hasDirective(filled.directives, 'primaryKey') || hasDirective(filled.directives, 'computed'))) {
				errors.push(`@decide's "${name}" field "${target}" can't be a primary key or a computed field.`);
			}
		}
	}
	const involved = [field.name, source, str('confidence'), str('decision')].filter(Boolean);
	if (new Set(involved).size !== involved.length) {
		errors.push('@decide\'s field, "source", "confidence" and "decision" must be different fields.');
	}

	const leaf = decideLeaf(field);
	const values = decideValues(field.directives);
	const hasRange = has('minimum') || has('maximum');
	if (!leaf) {
		errors.push("@decide needs a String, Boolean or Int field that isn't an array.");
	} else if (leaf === 'String') {
		if (hasRange) {
			errors.push('A String field takes values, not a minimum and maximum.');
		}
		if (!has('values')) {
			errors.push('List the values the model can choose from.');
		} else if (values) {
			if (values.length < 2 || values.length > MAX_DECISION_VALUES) {
				errors.push(`Give 2 to ${MAX_DECISION_VALUES} values to choose from.`);
			} else if (new Set(values).size !== values.length) {
				errors.push('Each value must be different.');
			}
		}
	} else if (leaf === 'Boolean') {
		if (has('values') || hasRange) {
			errors.push('A Boolean field takes no values, minimum or maximum.');
		}
	} else {
		if (has('values')) {
			errors.push('An Int field takes a minimum and maximum, not values.');
		}
		const minimum = intArg(field.directives, 'minimum');
		const maximum = intArg(field.directives, 'maximum');
		if (!has('minimum') || !has('maximum')) {
			errors.push('Give both a minimum and a maximum.');
		} else if (minimum !== undefined && maximum !== undefined) {
			// Harper holds an Int to 32 bits, and a decision to 255 choices.
			if ([minimum, maximum].some((bound) => (bound >> 0) !== bound)) {
				errors.push('The minimum and maximum must be from -2147483648 to 2147483647.');
			} else if (maximum - minimum + 1 < 2 || maximum - minimum + 1 > MAX_DECISION_VALUES) {
				errors.push(`The range must cover 2 to ${MAX_DECISION_VALUES} whole numbers.`);
			}
		}
	}

	if (field.type.nonNull) {
		errors.push("@decide can't fill a required field: an empty source clears it.");
	}
	if (hasDirective(field.directives, 'primaryKey') || hasDirective(field.directives, 'computed')) {
		errors.push("@decide can't be on a primary key or a computed field.");
	}
	return errors;
}

/** Harper keeps derived values in plain objects, so it refuses a field named like an `Object.prototype` member. */
function prototypeNameErrors(field: FieldModel, directiveName: string): string[] {
	const names = [
		field.name,
		...['source', 'confidence', 'decision'].map((arg) =>
			stringArgValue(getArgValue(field.directives, directiveName, arg))
		),
	];
	return names
		.filter((name): name is string => !!name && Object.hasOwn(Object.prototype, name))
		.map((name) => `@${directiveName} can't use a field named "${name}".`);
}

/** One directive on one field, with every field it fills: its own, and for `@decide` its confidence and decision fields. */
interface Writer {
	directive: string;
	field: FieldModel;
	fills: string[];
	source: string | undefined;
}

function writersOf(table: TableModel): Writer[] {
	const writers: Writer[] = [];
	for (const field of table.fields) {
		if (field.name.trim() === '') {
			continue;
		}
		for (const directive of [EMBED_DIRECTIVE, DECIDE_DIRECTIVE]) {
			if (!hasDirective(field.directives, directive)) {
				continue;
			}
			const arg = (name: string) => stringArgValue(getArgValue(field.directives, directive, name));
			const also = directive === DECIDE_DIRECTIVE ? [arg('confidence'), arg('decision')] : [];
			writers.push({
				directive,
				field,
				fills: [field.name, ...also.filter((name): name is string => !!name)],
				source: arg('source'),
			});
		}
	}
	return writers;
}

const writerLabel = (writer: Writer) => `@${writer.directive} on "${writer.field.name}"`;

/**
 * What Harper refuses across the table: a field filled by two directives, and a directive that reads a
 * field one of them fills (its own included).
 */
function ownershipErrors(field: FieldModel, table: TableModel): string[] {
	const writers = writersOf(table);
	const errors: string[] = [];
	for (const writer of writers.filter((candidate) => candidate.field === field)) {
		for (const name of writer.fills) {
			for (const other of writers) {
				if (other !== writer && other.fills.includes(name)) {
					errors.push(`${writerLabel(other)} also fills "${name}", and only one directive can.`);
				}
			}
		}
		const filler = writer.source === undefined
			? undefined
			: writers.find((other) => other.fills.includes(writer.source!));
		if (filler) {
			errors.push(`@${writer.directive} can't read "${writer.source}": ${writerLabel(filler)} fills it.`);
		}
	}
	return errors;
}

/** Every reason Harper would refuse the field's `@embed` or `@decide`. Empty when it has neither. */
export function derivedFieldErrors(field: FieldModel, table: TableModel): string[] {
	const embed = findDirective(field.directives, EMBED_DIRECTIVE);
	const decide = findDirective(field.directives, DECIDE_DIRECTIVE);
	if (!embed && !decide) {
		return [];
	}
	const fieldNames = new Set(table.fields.map((other) => other.name).filter((name) => name.trim() !== ''));
	return [
		...(embed ? [...embedErrors(field, embed, fieldNames), ...prototypeNameErrors(field, EMBED_DIRECTIVE)] : []),
		...(decide
			? [...decideErrors(field, decide, fieldNames, table), ...prototypeNameErrors(field, DECIDE_DIRECTIVE)]
			: []),
		...ownershipErrors(field, table),
	];
}
