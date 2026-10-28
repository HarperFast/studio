import type {
	WafAction,
	WafNamedValueMatch,
	WafRule,
	WafRuleMatch,
	WafRulePatch,
	WafStringOp,
} from '@/integrations/api/instance/waf/waf';
import { stableJson } from '@/lib/stableJson';

export interface NamedValueRow {
	name: string;
	op: WafStringOp;
	value: string;
	/** The stored condition this row was loaded from, by index; absent for a row the user added. */
	origin?: number;
}

export interface WafRuleFormValues {
	id: string;
	description: string;
	enabled: boolean;
	priority: string;
	/** An enforced action, the deferred one an existing rule stores, or empty for a stored rule that has none. */
	action: WafAction | '';
	blockStatus: string;
	score: string;
	shadow: boolean;
	/** One address or CIDR range per line, or comma-separated. */
	ip: string;
	methods: string;
	pathPrefix: string;
	pathExact: string;
	pathRegex: string;
	headers: NamedValueRow[];
	query: NamedValueRow[];
	regions: string;
	tags: string;
	nodes: string;
}

type WafRuleFormField = keyof WafRuleFormValues;

export type WafRuleFormErrors = Partial<Record<WafRuleFormField | 'match', string>>;

export function emptyNamedValueRow(): NamedValueRow {
	return { name: '', op: 'equals', value: '' };
}

export function emptyWafRuleForm(): WafRuleFormValues {
	return {
		id: '',
		description: '',
		enabled: true,
		priority: '',
		action: 'block',
		blockStatus: '',
		score: '',
		shadow: false,
		ip: '',
		methods: '',
		pathPrefix: '',
		pathExact: '',
		pathRegex: '',
		headers: [],
		query: [],
		regions: '',
		tags: '',
		nodes: '',
	};
}

function listText(value: unknown, separator: string): string {
	if (typeof value === 'string') {
		return value;
	}
	return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string').join(separator) : '';
}

function numberText(value: unknown): string {
	return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function rowsOf(list: WafNamedValueMatch[] | undefined): NamedValueRow[] {
	return Array.isArray(list)
		? list.map((entry, origin) => ({
			name: entry.name ?? '',
			op: entry.op ?? 'equals',
			value: entry.value ?? '',
			origin,
		}))
		: [];
}

export function wafRuleFormValues(rule: WafRule): WafRuleFormValues {
	const match = rule.match ?? {};
	return {
		id: rule.id,
		description: typeof rule.description === 'string' ? rule.description : '',
		enabled: rule.enabled !== false,
		priority: numberText(rule.priority),
		action: rule.action ?? '',
		blockStatus: numberText(rule.blockStatus),
		score: numberText(rule.score),
		shadow: rule.shadow === true,
		ip: listText(match.ip, '\n'),
		methods: listText(match.method, ', '),
		pathPrefix: match.path?.prefix ?? '',
		pathExact: match.path?.exact ?? '',
		pathRegex: match.path?.regex ?? '',
		headers: rowsOf(match.headers),
		query: rowsOf(match.query),
		regions: listText(rule.activation?.regions, ', '),
		tags: listText(rule.activation?.tags, ', '),
		nodes: listText(rule.activation?.nodes, ', '),
	};
}

function splitList(text: string, separator: RegExp): string[] {
	return text.split(separator).map((entry) => entry.trim()).filter(Boolean);
}

function parseNumber(text: string): number | null {
	const trimmed = text.trim();
	return trimmed === '' ? null : Number(trimmed);
}

/** Starting with a letter or digit also rules out Harper's reserved `__waf_control__`. */
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const FORM_MATCH_KEYS = new Set(['ip', 'method', 'path', 'headers', 'query']);

function namedValueMatches(
	rows: NamedValueRow[],
	field: 'headers' | 'query',
	errors: WafRuleFormErrors,
	stored: WafNamedValueMatch[] | undefined,
): WafNamedValueMatch[] {
	const kind = field === 'headers' ? 'header' : 'query parameter';
	const storedEntries = Array.isArray(stored) ? stored : [];
	const list: WafNamedValueMatch[] = [];
	// No row is skipped, not even an untouched one: conditions are ANDed, so dropping one widens the rule.
	for (const row of rows) {
		// Each row knows the stored condition it came from, so removing or editing another row can't
		// disturb it, and a typed row is never mistaken for a stored one.
		const source = row.origin === undefined ? undefined : storedEntries[row.origin];
		const loaded = source ? rowsOf([source])[0] : undefined;
		if (source && loaded?.name === row.name && loaded.op === row.op && loaded.value === row.value) {
			list.push(source);
			continue;
		}
		const name = source?.name === row.name ? row.name : row.name.trim();
		if (!name) {
			errors[field] ??= `Every ${kind} condition needs a name.`;
			continue;
		}
		if (row.op === 'exists') {
			list.push({ name, op: row.op });
		} else if (!row.value) {
			errors[field] ??= `Give the ${kind} "${name}" a value to compare, or check only that it is present.`;
		} else {
			list.push({ name, op: row.op, value: row.value });
		}
	}
	return list;
}

/** The rule fields the form edits, with `null` wherever an input was cleared. */
export type WafRuleFields = WafRulePatch & { match: WafRuleMatch };

/**
 * Saving `loaded` unchanged must send back exactly what it stores: `alter_waf_rule` replaces `match`
 * whole, and a condition that changes shape on the way through can widen the rule. So `match` keys the
 * form has no inputs for are carried over, nothing stored is trimmed, and a list whose text was not
 * edited keeps its stored array, since a selector may itself contain a comma.
 */
export function buildWafRule(
	values: WafRuleFormValues,
	loaded?: WafRule,
): { ok: true; fields: WafRuleFields } | { ok: false; errors: WafRuleFormErrors } {
	const errors: WafRuleFormErrors = {};
	const shown = loaded ? wafRuleFormValues(loaded) : undefined;
	const listOf = <T>(field: 'ip' | 'methods' | 'regions' | 'tags' | 'nodes', stored: T, separator: RegExp) =>
		shown && values[field] === shown[field] && stored != null ? stored : splitList(values[field], separator);
	// Typed text is trimmed, since a stray space makes a path that never matches; stored text is kept as is.
	const typed = (field: 'pathPrefix' | 'pathExact' | 'pathRegex') =>
		shown && values[field] === shown[field] ? values[field] : values[field].trim();

	const priority = parseNumber(values.priority);
	if (priority !== null && !Number.isFinite(priority)) {
		errors.priority = 'Priority must be a number.';
	}

	if (values.action === '') {
		errors.action = 'Choose what the rule does when a request matches.';
	}

	const blockStatus = values.action === 'block' ? parseNumber(values.blockStatus) : null;
	if (blockStatus !== null && !(Number.isInteger(blockStatus) && blockStatus >= 400 && blockStatus <= 599)) {
		errors.blockStatus = 'Use a 4xx or 5xx status, such as 403.';
	}

	const score = values.action === 'score' ? parseNumber(values.score) : null;
	if (values.action === 'score' && (score === null || !Number.isFinite(score))) {
		errors.score = 'A score rule needs a number to add to the request’s score.';
	}

	const match: WafRuleMatch = {};
	for (const [key, value] of Object.entries(loaded?.match ?? {})) {
		if (!FORM_MATCH_KEYS.has(key)) {
			(match as Record<string, unknown>)[key] = value;
		}
	}
	const ip = listOf('ip', loaded?.match?.ip, /[\s,]+/);
	if (ip.length) {
		match.ip = ip;
	}
	const methods = listOf('methods', loaded?.match?.method, /[\s,]+/);
	if (methods.length) {
		match.method = methods === loaded?.match?.method ? methods : methods.map((method) => method.toUpperCase());
	}
	const path: WafRuleMatch['path'] = {};
	const [prefix, exact, regex] = [typed('pathPrefix'), typed('pathExact'), typed('pathRegex')];
	if (prefix) {
		path.prefix = prefix;
	}
	if (exact) {
		path.exact = exact;
	}
	if (regex) {
		path.regex = regex;
	}
	if (Object.keys(path).length) {
		match.path = path;
	}
	const headers = namedValueMatches(values.headers, 'headers', errors, loaded?.match?.headers);
	if (headers.length) {
		match.headers = headers;
	}
	const query = namedValueMatches(values.query, 'query', errors, loaded?.match?.query);
	if (query.length) {
		match.query = query;
	}
	if (!Object.keys(match).length && !errors.headers && !errors.query) {
		errors.match = 'Add at least one condition: an IP address, method, path, header or query parameter.';
	}

	const regions = listOf('regions', loaded?.activation?.regions, /,/);
	const tags = listOf('tags', loaded?.activation?.tags, /,/);
	const nodes = listOf('nodes', loaded?.activation?.nodes, /,/);
	const activation = regions.length || tags.length || nodes.length
		? {
			...(nodes.length ? { nodes } : {}),
			...(regions.length ? { regions } : {}),
			...(tags.length ? { tags } : {}),
		}
		: null;

	if (Object.keys(errors).length || values.action === '') {
		return { ok: false, errors };
	}
	return {
		ok: true,
		fields: {
			description: values.description.trim() ? values.description : null,
			enabled: values.enabled,
			priority,
			action: values.action,
			blockStatus,
			score,
			// A log rule never enforces, so a stored flag would only resurface if it became a block rule. A
			// deferred action keeps its flag, since that is what it will do once Harper enforces it.
			shadow: values.action === 'log' ? null : values.shadow,
			match,
			activation,
		},
	};
}

/**
 * The edit to send: only the fields that differ from saving `loaded` untouched, so a field nobody changed
 * is never rewritten, not even into an equivalent shape (an absent `blockStatus` as `null`).
 */
export function wafRulePatch(loaded: WafRule, fields: WafRuleFields): WafRulePatch {
	const untouched = buildWafRule(wafRuleFormValues(loaded), loaded);
	if (!untouched.ok) {
		return fields;
	}
	const patch: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (stableJson(value) !== stableJson(untouched.fields[key as keyof WafRuleFields])) {
			patch[key] = value;
		}
	}
	return patch as WafRulePatch;
}

export function wafRuleIdError(id: string, existingIds: ReadonlySet<string>): string | undefined {
	const trimmed = id.trim();
	if (!trimmed) {
		return 'Give the rule an id.';
	}
	if (!RULE_ID.test(trimmed)) {
		return 'Start with a letter or digit, then use letters, digits, dots, dashes, colons or underscores.';
	}
	if (existingIds.has(trimmed)) {
		return 'A rule with this id already exists.';
	}
	return undefined;
}

/**
 * The `add_waf_rule` document: the built fields without the nulls, which mean "absent" on a new rule,
 * and the only phase the engine evaluates.
 */
export function newWafRule(id: string, fields: WafRuleFields): WafRule {
	const rule: Record<string, unknown> = { id: id.trim(), phase: 'request' };
	for (const [key, value] of Object.entries(fields)) {
		if (value !== null) {
			rule[key] = value;
		}
	}
	return rule as unknown as WafRule;
}
