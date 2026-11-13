/**
 * Harper full-text indexes (5.3.0+) as the schema editor sees them: a field of type `FullText`
 * carrying `@fullText(...)`. The field holds no value; its name names the index, and the directive
 * lists the stored text fields it indexes.
 *
 * ```graphql
 * catalogSearch: FullText
 *   @fullText(
 *     fields: [{ name: "title", weight: 3, highlight: true }, { name: "description" }]
 *     highlighting: { maxFragments: 2, fragmentLength: 120 }
 *   )
 * ```
 *
 * Every rule here is Harper's, from `resources/fullTextSchema.ts` (`compileFullTextDefinition`) and
 * `resources/graphql.ts` at v5.3.6. A broken declaration fails the whole schema's load, so
 * {@link fullTextErrors} mirrors those checks to stop the editor saving one. Keep it a mirror: a rule
 * Harper doesn't enforce would block a save that works.
 */
import { GraphqlValue, isGraphqlObject, parseGraphqlValue, printGraphqlValue } from './graphqlValue';
import { setArg } from './mutations';
import {
	baseTypeName,
	boolArgValue,
	Directive,
	FieldModel,
	findArg,
	findDirective,
	SchemaDocument,
	stringArgValue,
	TableModel,
} from './types';

export const FULL_TEXT_TYPE = 'FullText';
export const FULL_TEXT_DIRECTIVE = 'fullText';
/** The only analyzer Harper accepts. */
export const FULL_TEXT_ANALYZER = 'english@2';
/** Harper's defaults when `highlighting` is set without a value. */
export const DEFAULT_MAX_FRAGMENTS = 3;
export const DEFAULT_FRAGMENT_LENGTH = 160;
/** Harper's only supported media type for a `Blob` source. */
const TEXT_PLAIN = 'text/plain';

export interface FullTextSource {
	name: string;
	/** Harper's default is 1. Left unset rather than written out, so an untouched source stays as it was. */
	weight?: number;
	highlight?: boolean;
	/** Required, as `text/plain`, for a `Blob` source; rejected on any other. */
	mediaType?: string;
}

export interface FullTextSynonym {
	source: string;
	replacements: string[];
}

export interface FullTextHighlighting {
	maxFragments?: number;
	fragmentLength?: number;
}

/**
 * One `@fullText` declaration. Optional members are `undefined` when the file leaves them out, so
 * writing the config back never adds an argument the user didn't set.
 */
export interface FullTextConfig {
	fields: FullTextSource[];
	analyzer?: string;
	stopWords?: boolean;
	positions?: boolean;
	surfaceTerms?: boolean;
	synonyms: FullTextSynonym[];
	/** `undefined` turns highlighting off; `{}` turns it on with Harper's defaults. */
	highlighting?: FullTextHighlighting;
}

const KNOWN_ARGS = ['fields', 'analyzer', 'stopWords', 'positions', 'surfaceTerms', 'synonyms', 'highlighting'];
const SOURCE_KEYS = new Set(['name', 'weight', 'highlight', 'mediaType']);
const SYNONYM_KEYS = new Set(['source', 'replacements']);
const HIGHLIGHTING_KEYS = new Set(['maxFragments', 'fragmentLength']);

function onlyKeys(value: { [key: string]: GraphqlValue }, keys: Set<string>): boolean {
	return Object.keys(value).every(key => keys.has(key));
}

function readSource(value: GraphqlValue): FullTextSource | undefined {
	if (!isGraphqlObject(value) || !onlyKeys(value, SOURCE_KEYS) || typeof value.name !== 'string') {
		return undefined;
	}
	const { name, weight, highlight, mediaType } = value;
	if (
		(weight !== undefined && typeof weight !== 'number')
		|| (highlight !== undefined && highlight !== null && typeof highlight !== 'boolean')
		|| (mediaType !== undefined && typeof mediaType !== 'string')
	) {
		return undefined;
	}
	return {
		name,
		...(weight === undefined ? null : { weight }),
		...(typeof highlight === 'boolean' ? { highlight } : null),
		...(mediaType === undefined ? null : { mediaType }),
	};
}

function readSynonym(value: GraphqlValue): FullTextSynonym | undefined {
	if (
		!isGraphqlObject(value) || !onlyKeys(value, SYNONYM_KEYS) || typeof value.source !== 'string'
		|| !Array.isArray(value.replacements) || !value.replacements.every(item => typeof item === 'string')
	) {
		return undefined;
	}
	return { source: value.source, replacements: value.replacements as string[] };
}

function readHighlighting(value: GraphqlValue): FullTextHighlighting | null | undefined {
	if (value === null) {
		return null;
	}
	if (!isGraphqlObject(value) || !onlyKeys(value, HIGHLIGHTING_KEYS)) {
		return undefined;
	}
	const { maxFragments, fragmentLength } = value;
	if (
		(maxFragments !== undefined && typeof maxFragments !== 'number')
		|| (fragmentLength !== undefined && typeof fragmentLength !== 'number')
	) {
		return undefined;
	}
	return {
		...(maxFragments === undefined ? null : { maxFragments }),
		...(fragmentLength === undefined ? null : { fragmentLength }),
	};
}

function readBool(directive: Directive, name: string): boolean | undefined | 'invalid' {
	const arg = findArg(directive, name);
	if (!arg) {
		return undefined;
	}
	return boolArgValue(arg.value) ?? 'invalid';
}

/**
 * The declaration on `field` for the editor to change, or `undefined` when there is none or it can't
 * be rewritten faithfully: a value of the wrong shape, an option Harper doesn't define, or comments
 * among the arguments, which a rewrite would drop. The editor then shows it read-only.
 */
export function readFullTextConfig(field: FieldModel): FullTextConfig | undefined {
	const directive = findDirective(field.directives, FULL_TEXT_DIRECTIVE);
	return directive?.commented ? undefined : parseFullTextConfig(field);
}

/** The declaration as Harper will read it, comments or not: what validation and rebuild checks need. */
function parseFullTextConfig(field: FieldModel): FullTextConfig | undefined {
	const directive = findDirective(field.directives, FULL_TEXT_DIRECTIVE);
	if (!directive || directive.args.some(arg => !KNOWN_ARGS.includes(arg.name))) {
		return undefined;
	}

	const fieldsArg = findArg(directive, 'fields');
	let fields: FullTextSource[] = [];
	if (fieldsArg) {
		const parsed = parseGraphqlValue(fieldsArg.value)?.value;
		// No list coercion: Harper reads directive values as written and refuses a lone object here.
		const sources = Array.isArray(parsed) ? parsed.map(readSource) : undefined;
		if (!sources || sources.some(source => source === undefined)) {
			return undefined;
		}
		fields = sources as FullTextSource[];
	}

	const synonymsArg = findArg(directive, 'synonyms');
	let synonyms: FullTextSynonym[] = [];
	if (synonymsArg) {
		const parsed = parseGraphqlValue(synonymsArg.value)?.value;
		const rules = Array.isArray(parsed) ? parsed.map(readSynonym) : undefined;
		if (!rules || rules.some(rule => rule === undefined)) {
			return undefined;
		}
		synonyms = rules as FullTextSynonym[];
	}

	const highlightingArg = findArg(directive, 'highlighting');
	let highlighting: FullTextHighlighting | undefined;
	if (highlightingArg) {
		const parsed = parseGraphqlValue(highlightingArg.value);
		const read = parsed ? readHighlighting(parsed.value) : undefined;
		if (read === undefined) {
			return undefined;
		}
		highlighting = read ?? undefined;
	}

	const analyzerArg = findArg(directive, 'analyzer');
	const analyzer = analyzerArg ? stringArgValue(analyzerArg.value) : undefined;
	if (analyzerArg && analyzer === undefined) {
		return undefined;
	}

	const stopWords = readBool(directive, 'stopWords');
	const positions = readBool(directive, 'positions');
	const surfaceTerms = readBool(directive, 'surfaceTerms');
	if (stopWords === 'invalid' || positions === 'invalid' || surfaceTerms === 'invalid') {
		return undefined;
	}

	return { fields, analyzer, stopWords, positions, surfaceTerms, synonyms, highlighting };
}

function sourceLiteral(source: FullTextSource): GraphqlValue {
	return {
		name: source.name,
		...optionalNumber('weight', source.weight),
		...(source.highlight === undefined ? null : { highlight: source.highlight }),
		...(source.mediaType === undefined ? null : { mediaType: source.mediaType }),
	};
}

/**
 * `{ [key]: value }`, or nothing for an unset number — or one GraphQL can't write, such as the
 * `Infinity` a number input yields for `1e999`, which reads back as unset rather than breaking the file.
 */
function optionalNumber(key: string, value: number | undefined): { [key: string]: number } | null {
	return value === undefined || !Number.isFinite(value) ? null : { [key]: value };
}

/**
 * Write `config` into the field's `@fullText` (creating it if missing). Arguments the config leaves
 * unset are removed rather than written as their defaults; an argument the editor doesn't model is
 * kept as it was.
 */
export function writeFullTextConfig(directives: Directive[], config: FullTextConfig): Directive[] {
	const set = (current: Directive[], name: string, value: GraphqlValue | undefined) =>
		setArg(current, FULL_TEXT_DIRECTIVE, name, value === undefined ? undefined : printGraphqlValue(value));
	let next = set(directives, 'fields', config.fields.map(sourceLiteral));
	next = set(next, 'analyzer', config.analyzer);
	next = set(next, 'stopWords', config.stopWords);
	next = set(next, 'positions', config.positions);
	next = set(next, 'surfaceTerms', config.surfaceTerms);
	next = set(
		next,
		'synonyms',
		config.synonyms.length === 0
			? undefined
			: config.synonyms.map(rule => ({ source: rule.source, replacements: rule.replacements })),
	);
	next = set(
		next,
		'highlighting',
		config.highlighting === undefined
			? undefined
			: {
				...optionalNumber('maxFragments', config.highlighting.maxFragments),
				...optionalNumber('fragmentLength', config.highlighting.fragmentLength),
			},
	);
	return next;
}

/** A new, empty declaration: the GUI then asks for at least one source. */
export function emptyFullTextConfig(): FullTextConfig {
	return { fields: [], synonyms: [] };
}

export type FullTextSourceKind = 'string' | 'stringList' | 'blob';

/**
 * What kind of source `field` can be, or `undefined` when Harper won't index it: only stored
 * `String`, `[String]` and `Blob` fields qualify, never a `@computed` or `@relationship` one.
 */
export function fullTextSourceKind(field: FieldModel): FullTextSourceKind | undefined {
	if (findDirective(field.directives, 'computed') || findDirective(field.directives, 'relationship')) {
		return undefined;
	}
	const { type } = field;
	const inner = type.kind === 'list' ? type.of : undefined;
	if (inner) {
		return inner.kind === 'named' && inner.name === 'String' ? 'stringList' : undefined;
	}
	if (type.kind === 'named' && type.name === 'String') {
		return 'string';
	}
	if (type.kind === 'named' && type.name === 'Blob') {
		return 'blob';
	}
	return undefined;
}

/** The table's fields a full-text index can draw from, in table order. */
export function fullTextSourceCandidates(table: TableModel): FieldModel[] {
	return table.fields.filter(field => field.name.trim() !== '' && fullTextSourceKind(field) !== undefined);
}

/** A new source entry for `field`; a `Blob` gets the media type Harper requires of it. */
export function newFullTextSource(field: FieldModel): FullTextSource {
	return fullTextSourceKind(field) === 'blob' ? { name: field.name, mediaType: TEXT_PLAIN } : { name: field.name };
}

function isPositiveInteger(value: number | undefined): boolean {
	return value === undefined || (Number.isSafeInteger(value) && value > 0);
}

/**
 * Everything about `field` that would make Harper refuse the schema, as messages for the user. Empty
 * for a field that is neither a `FullText` field nor carries `@fullText`.
 */
export function fullTextErrors(field: FieldModel, table: TableModel): string[] {
	const directive = findDirective(field.directives, FULL_TEXT_DIRECTIVE);
	const typedFullText = baseTypeName(field.type) === FULL_TEXT_TYPE;
	if (!directive && !typedFullText) {
		return [];
	}
	if (!typedFullText || field.type.kind !== 'named') {
		return typedFullText
			? ['A full-text field can’t be an array.']
			: [`@fullText only works on a field of type ${FULL_TEXT_TYPE}.`];
	}
	const errors: string[] = [];
	if (field.type.nonNull) {
		errors.push('A full-text field can’t be required.');
	}
	if (!directive) {
		errors.push('Pick at least one source field for this full-text index.');
		return errors;
	}
	if (field.directives.filter(other => other.name === FULL_TEXT_DIRECTIVE).length > 1) {
		errors.push('A full-text field takes exactly one @fullText.');
	}
	for (const other of field.directives) {
		if (other.name !== FULL_TEXT_DIRECTIVE) {
			errors.push(`A full-text field can’t use @${other.name}. Set permissions and values on its source fields.`);
		}
	}
	const unknown = directive.args.find(arg => !KNOWN_ARGS.includes(arg.name));
	if (unknown) {
		errors.push(`@fullText has no “${unknown.name}” option.`);
	}

	// Read through comments: a declaration the editor won't rewrite can still be broken by an edit to its sources.
	const config = parseFullTextConfig(field);
	if (!config) {
		// A table written back as it was read gets Harper's verdict, not ours. Once the visual editor
		// regenerates it, an edit to a source this can't see could break the index, so the table waits
		// for "Edit as text".
		if (table.edited) {
			errors.push('Studio can’t check this full-text index, so edit this table as text.');
		}
		return errors;
	}

	if (config.fields.length === 0) {
		errors.push('Pick at least one source field for this full-text index.');
	}
	const byName = new Map(table.fields.map(candidate => [candidate.name, candidate]));
	const seen = new Set<string>();
	for (const source of config.fields) {
		if (seen.has(source.name)) {
			errors.push(`“${source.name}” is listed as a source more than once.`);
			continue;
		}
		seen.add(source.name);
		const sourceField = byName.get(source.name);
		const kind = sourceField && fullTextSourceKind(sourceField);
		if (!sourceField) {
			errors.push(`Source “${source.name}” isn’t a field of this table.`);
		} else if (!kind) {
			errors.push(
				`Source “${source.name}” must be a stored String, [String] or Blob field, not computed or a relationship.`,
			);
		} else if (kind === 'blob' && source.mediaType !== TEXT_PLAIN) {
			errors.push(`Blob source “${source.name}” needs media type “${TEXT_PLAIN}”.`);
		} else if (kind !== 'blob' && source.mediaType !== undefined) {
			errors.push(`Only a Blob source takes a media type; remove it from “${source.name}”.`);
		}
		if (source.weight !== undefined && !(Number.isFinite(source.weight) && source.weight > 0)) {
			errors.push(`The weight of “${source.name}” must be greater than zero.`);
		}
	}

	if (config.analyzer !== undefined && config.analyzer !== FULL_TEXT_ANALYZER) {
		errors.push(`The only supported analyzer is “${FULL_TEXT_ANALYZER}”.`);
	}

	const ruleKeys = new Set<string>();
	for (const rule of config.synonyms) {
		const label = rule.source ? `The synonym rule for “${rule.source}”` : 'A synonym rule';
		if (!rule.source) {
			errors.push('A synonym rule needs a term to replace.');
		}
		if (rule.replacements.length === 0 || rule.replacements.some(replacement => replacement === '')) {
			errors.push(`${label} needs at least one replacement, and no empty ones.`);
		}
		if (rule.source && rule.replacements.includes(rule.source)) {
			errors.push(`${label} can’t replace the term with itself.`);
		}
		if (new Set(rule.replacements).size !== rule.replacements.length) {
			errors.push(`${label} lists a replacement twice.`);
		}
		const key = JSON.stringify([rule.source, [...rule.replacements].sort()]);
		if (ruleKeys.has(key)) {
			errors.push(`${label} appears twice.`);
		}
		ruleKeys.add(key);
	}

	if (config.highlighting) {
		if (
			!isPositiveInteger(config.highlighting.maxFragments) || !isPositiveInteger(config.highlighting.fragmentLength)
		) {
			errors.push('Fragments per value and fragment length must be whole numbers greater than zero.');
		}
		if (!config.fields.some(source => source.highlight === true)) {
			errors.push('Highlighting needs at least one source with “Highlight” on.');
		}
		if (config.surfaceTerms === false) {
			errors.push('Highlighting needs surface terms on.');
		}
	}
	return errors;
}

/**
 * The part of a declaration that decides its stored index — Harper's `fullTextStorageDefinition`.
 * Weights and highlighting are left out because Harper changes those without a rebuild.
 */
function storageKey(config: FullTextConfig): string {
	return JSON.stringify({
		fields: config.fields.map(source => [source.name, source.mediaType ?? null]),
		analyzer: config.analyzer ?? FULL_TEXT_ANALYZER,
		stopWords: config.stopWords ?? true,
		positions: config.positions ?? true,
		surfaceTerms: config.surfaceTerms ?? true,
		synonyms: config.synonyms.map(rule => [rule.source, rule.replacements]),
	});
}

function directiveText(field: FieldModel): string {
	const directive = findDirective(field.directives, FULL_TEXT_DIRECTIVE);
	return JSON.stringify(directive?.args.map(arg => [arg.name, arg.value.replace(/\s+/g, ' ')]) ?? null);
}

/** Where Harper keeps the table: its database and its stored name (an `@table(table:)` override wins). */
function tableIdentity(table: TableModel): string {
	const tableDirective = findDirective(table.directives, 'table');
	const database = stringArgValue(findArg(tableDirective, 'database')?.value) ?? '';
	const name = stringArgValue(findArg(tableDirective, 'table')?.value) ?? table.typeName;
	return JSON.stringify([database, name]);
}

function fullTextFieldsByIndex(doc: SchemaDocument): Map<string, { table: TableModel; field: FieldModel }> {
	const indexes = new Map<string, { table: TableModel; field: FieldModel }>();
	for (const segment of doc.segments) {
		if (segment.kind !== 'table') {
			continue;
		}
		for (const field of segment.table.fields) {
			if (field.name.trim() && findDirective(field.directives, FULL_TEXT_DIRECTIVE)) {
				indexes.set(JSON.stringify([tableIdentity(segment.table), field.name]), { table: segment.table, field });
			}
		}
	}
	return indexes;
}

export interface FullTextIndexChange {
	tableName: string;
	indexName: string;
	/** `build`: a new index (or a renamed one, which Harper treats as new). `rebuild`: an existing index rebuilt. */
	kind: 'build' | 'rebuild';
}

/**
 * The full-text indexes saving `current` over `saved` would build or rebuild. Either way the index
 * has to be built from the table's records again on every node, and searches on it can fail until
 * that finishes. Changing only weights or highlighting rebuilds nothing.
 */
export function fullTextIndexChanges(saved: SchemaDocument, current: SchemaDocument): FullTextIndexChange[] {
	const before = fullTextFieldsByIndex(saved);
	const changes: FullTextIndexChange[] = [];
	for (const [key, { table, field }] of fullTextFieldsByIndex(current)) {
		const previous = before.get(key);
		const change = { tableName: table.typeName, indexName: field.name };
		if (!previous) {
			changes.push({ ...change, kind: 'build' });
			continue;
		}
		const was = parseFullTextConfig(previous.field);
		const is = parseFullTextConfig(field);
		// When either side can't be read, any change to the arguments may be one that rebuilds.
		const rebuilds = was && is
			? storageKey(was) !== storageKey(is)
			: directiveText(previous.field) !== directiveText(field);
		if (rebuilds) {
			changes.push({ ...change, kind: 'rebuild' });
		}
	}
	return changes;
}
