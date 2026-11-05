import { HARPER_OPERATIONS } from '@/features/instance/extensions/harperOperations';
import {
	type ActionsSection,
	type ExtensionAccess,
	type ExtensionAction,
	type ExtensionColumn,
	type ExtensionContent,
	type ExtensionField,
	type ExtensionRequest,
	type ExtensionSection,
	type ExtensionTableGrant,
	type FormSection,
	type ResolvedExtensionPage,
	type StatsSection,
	type StatValue,
	STUDIO_CAPABILITIES,
	type TableSection,
	type UnsupportedNotice,
} from '@/features/instance/extensions/manifest';
import type { LocalRolePermissionAction } from '@/integrations/api/api.patch';

/**
 * `visible` is the default; `tucked` moves a tab into the nav's More menu; `hidden` leaves it out of the
 * nav entirely. Neither changes what the server allows — a hidden tab still opens from a link.
 */
export type TabVisibility = 'visible' | 'tucked' | 'hidden';

/**
 * What a cluster tells Studio about itself, from `get_studio_configuration`: its root config's `studio`
 * block, plus the pages its components declare in their own `config.yaml`.
 */
export interface StudioConfiguration {
	/** Keyed by a built-in tab, or by a component page's `<component>.<id>`. */
	navigation: Record<string, TabVisibility>;
	/** The tab or page key Studio opens the cluster on. */
	landing?: string;
	pages: ResolvedExtensionPage[];
	/** The cluster can't answer (an older Harper, or a role without the operation), so nothing it set is known. */
	unavailable?: true;
}

export const EMPTY_STUDIO_CONFIGURATION: StudioConfiguration = Object.freeze({ navigation: {}, pages: [] });

const VISIBILITIES = new Set<string>(['visible', 'tucked', 'hidden']);
const NAVIGATION_KEY = /^[\w@.-]{1,128}$/;
const PAGE_ID = /^[a-z0-9-]{1,64}$/;
const TABLE_ACTIONS = new Set<string>(['read', 'insert', 'update', 'delete']);
const FIELD_INPUTS = new Set<string>(['text', 'url', 'number', 'textarea', 'select', 'switch']);
const COLUMN_FORMATS = new Set<string>(['text', 'code', 'badge', 'boolean', 'number', 'datetime']);
const ACCESS_KEYS = new Set<string>(['role', 'tables', 'operations', 'optional']);
const OPTIONAL_ACCESS_KEYS = new Set<string>(['tables', 'operations']);
const GRANT_KEYS = new Set<string>(['database', 'table', 'actions']);
// What a placeholder may repeat back. A declaration can hold anything, so anything else is described instead.
const IDENTIFIER = /^[\w.:-]{1,64}$/;
const UNREADABLE_CONFIRM = "Studio couldn't read what this action asks you to confirm.";

/**
 * Reads the operation's response without trusting it. Harper passes a page's `content` and `access`
 * through as the component wrote them, so everything is checked here. A page without a usable key, name
 * or placement is dropped; past that, nothing is dropped silently, because the Studio bundled into
 * Harper reads pages written long after it shipped. What it can't draw becomes a placeholder saying why,
 * and access it can't fully read denies the page to every role.
 */
export function parseStudioConfiguration(
	raw: unknown,
	capabilities: ReadonlySet<string> = STUDIO_CAPABILITIES,
): StudioConfiguration {
	if (!isRecord(raw)) {
		return EMPTY_STUDIO_CONFIGURATION;
	}
	const navigation: Record<string, TabVisibility> = {};
	if (isRecord(raw.navigation)) {
		for (const [key, value] of Object.entries(raw.navigation)) {
			if (NAVIGATION_KEY.test(key) && typeof value === 'string' && VISIBILITIES.has(value)) {
				navigation[key] = value as TabVisibility;
			}
		}
	}
	const pages: ResolvedExtensionPage[] = [];
	const seen = new Set<string>();
	for (const candidate of Array.isArray(raw.pages) ? raw.pages : []) {
		const page = parsePage(candidate, capabilities);
		// First declaration wins, so a second component can't take over a page by reusing its key.
		if (page && !seen.has(page.key)) {
			seen.add(page.key);
			pages.push(page);
		}
	}
	return {
		navigation,
		landing: typeof raw.landing === 'string' && NAVIGATION_KEY.test(raw.landing) ? raw.landing : undefined,
		pages,
	};
}

function parsePage(raw: unknown, capabilities: ReadonlySet<string>): ResolvedExtensionPage | undefined {
	if (!isRecord(raw)) {
		return undefined;
	}
	const { component, id } = raw;
	if (typeof component !== 'string' || !NAVIGATION_KEY.test(component)) {
		return undefined;
	}
	if (typeof id !== 'string' || !PAGE_ID.test(id)) {
		return undefined;
	}
	const name = text(raw.name, 40);
	if (!name || (raw.placement !== 'tab' && raw.placement !== 'config')) {
		return undefined;
	}
	return {
		key: `${component}.${id}`,
		component,
		id,
		name,
		icon: text(raw.icon, 64) ?? 'puzzle',
		placement: raw.placement,
		description: text(raw.description, 300),
		access: parseAccess(raw.access),
		content: parseContent(raw.content, capabilities),
	};
}

function parseAccess(raw: unknown): ExtensionAccess | undefined {
	if (raw === undefined) {
		return undefined;
	}
	if (!isRecord(raw)) {
		return { unreadable: ['access'] };
	}
	const unreadable = unknownKeys(raw, ACCESS_KEYS, 'access');
	const refused: string[] = [];
	const role = raw.role === 'super_user' || raw.role === 'structure_user' ? raw.role : undefined;
	if (raw.role !== undefined && !role) {
		unreadable.push('access.role');
	}
	const tables = raw.tables === undefined ? undefined : parseTableGrants(raw.tables, 'access.tables', unreadable);
	const operations = parseOperations(raw.operations, 'access.operations', unreadable, refused);
	let optional: ExtensionAccess['optional'];
	if (raw.optional !== undefined) {
		if (isRecord(raw.optional)) {
			unreadable.push(...unknownKeys(raw.optional, OPTIONAL_ACCESS_KEYS, 'access.optional'));
			optional = {
				tables: raw.optional.tables === undefined
					? undefined
					: parseTableGrants(raw.optional.tables, 'access.optional.tables', unreadable),
				operations: parseOperations(raw.optional.operations, 'access.optional.operations', unreadable, refused),
			};
		} else {
			unreadable.push('access.optional');
		}
	}
	// Nothing else is kept: a page with any unreadable or refused entry is denied whatever the rest says.
	if (unreadable.length || refused.length) {
		return {
			...(unreadable.length ? { unreadable } : undefined),
			...(refused.length ? { refused } : undefined),
		};
	}
	return { role, tables, operations, optional };
}

function unknownKeys(raw: Record<string, unknown>, known: ReadonlySet<string>, path: string): string[] {
	return Object.keys(raw).filter((key) => !known.has(key)).map((key) => keyPath(path, key));
}

/**
 * The component operations a page lists. One of Harper's own is refused rather than unreadable: no Studio
 * sends it (access.ts), and its name is one Studio knows, so the denial can say which.
 */
function parseOperations(raw: unknown, path: string, unreadable: string[], refused: string[]): string[] | undefined {
	if (raw === undefined) {
		return undefined;
	}
	const operations = stringArray(raw);
	if (!operations) {
		unreadable.push(path);
		return undefined;
	}
	refused.push(...operations.filter((operation) => HARPER_OPERATIONS.has(operation)));
	return operations;
}

function parseTableGrants(raw: unknown, listPath: string, unreadable: string[]): ExtensionTableGrant[] {
	if (!Array.isArray(raw)) {
		unreadable.push(listPath);
		return [];
	}
	return raw.flatMap((grant: unknown, index): ExtensionTableGrant[] => {
		const path = `${listPath}[${index}]`;
		if (!isRecord(grant)) {
			unreadable.push(path);
			return [];
		}
		const problems = unknownKeys(grant, GRANT_KEYS, path);
		const { database, table } = grant;
		if (typeof database !== 'string' || !database) {
			problems.push(`${path}.database`);
		}
		if (typeof table !== 'string' || !table) {
			problems.push(`${path}.table`);
		}
		const actions = stringArray(grant.actions);
		if (!actions?.length || !actions.every((action) => TABLE_ACTIONS.has(action))) {
			problems.push(`${path}.actions`);
		}
		unreadable.push(...problems);
		return problems.length || typeof database !== 'string' || typeof table !== 'string'
			? []
			: [{ database, table, actions: actions as LocalRolePermissionAction[] }];
	});
}

function parseContent(raw: unknown, capabilities: ReadonlySet<string>): ExtensionContent {
	if (!isRecord(raw)) {
		return { kind: 'unsupported', ...unreadable("Its content is missing or isn't a map.") };
	}
	const required = checkRequires(raw.requires, capabilities);
	if (required) {
		return { kind: 'unsupported', ...required };
	}
	if (raw.kind !== 'sections') {
		return { kind: 'unsupported', ...unknownName(raw.kind, 'content kind') };
	}
	if (!Array.isArray(raw.sections)) {
		return { kind: 'unsupported', ...unreadable("Its sections aren't a list.") };
	}
	if (!raw.sections.length) {
		return { kind: 'unsupported', ...unreadable('It has no sections.') };
	}
	return { kind: 'sections', sections: raw.sections.map((section) => parseSection(section, capabilities)) };
}

function parseSection(raw: unknown, capabilities: ReadonlySet<string>): ExtensionSection {
	if (!isRecord(raw)) {
		return { type: 'unsupported', ...unreadable("It isn't a map.") };
	}
	const title = text(raw.title, 120);
	const section = checkRequires(raw.requires, capabilities) ?? readSection(raw, title, capabilities);
	return isNotice(section) ? { type: 'unsupported', title, ...section } : section;
}

function readSection(
	raw: Record<string, unknown>,
	title: string | undefined,
	capabilities: ReadonlySet<string>,
): Exclude<ExtensionSection, { type: 'unsupported' }> | UnsupportedNotice {
	const description = text(raw.description, 500);
	switch (raw.type) {
		case 'text': {
			const body = text(raw.body, 5000);
			return body ? { type: 'text', title, body } : unreadable('It has no body.');
		}
		case 'stats':
			return parseStats(raw);
		case 'table':
			return parseTable(raw, title, description);
		case 'form':
			return parseForm(raw, title, description);
		case 'actions':
			return parseActions(raw, title, description, capabilities);
	}
	return unknownName(raw.type, 'type');
}

function parseStats(raw: Record<string, unknown>): StatsSection | UnsupportedNotice {
	const items = (Array.isArray(raw.items) ? raw.items : []).flatMap((item: unknown): StatsSection['items'] => {
		const label = isRecord(item) ? text(item.label, 60) : undefined;
		// The label is what keeps an item's place; without one there is nothing to show.
		return isRecord(item) && label ? [{ label, icon: text(item.icon, 64), value: parseStatValue(item.value) }] : [];
	});
	return items.length ? { type: 'stats', items } : unreadable('It has no items with a label.');
}

function parseStatValue(raw: unknown): StatValue {
	if (isRecord(raw) && raw.kind === 'static' && typeof raw.value === 'string') {
		return { kind: 'static', value: raw.value.slice(0, 60) };
	}
	if (isRecord(raw) && raw.kind === 'count') {
		const { database, table, where } = raw;
		// An unreadable `where` would otherwise count the whole table under a filtered label.
		if (typeof database === 'string' && typeof table === 'string' && (where === undefined || isRecord(where))) {
			return { kind: 'count', database, table, where };
		}
	}
	if (isRecord(raw) && raw.kind !== 'static' && raw.kind !== 'count') {
		return { kind: 'unsupported', ...unknownName(raw.kind, 'value kind') };
	}
	return { kind: 'unsupported', ...unreadable("Its value can't be read.") };
}

function parseTable(
	raw: Record<string, unknown>,
	title: string | undefined,
	description: string | undefined,
): TableSection | UnsupportedNotice {
	const target = parseTarget(raw);
	if (isNotice(target)) {
		return target;
	}
	const columns = (Array.isArray(raw.columns) ? raw.columns : []).map(parseColumn).filter((column) =>
		column !== undefined
	);
	if (!columns.length) {
		return unreadable('It has no columns Studio can read.');
	}
	const fields = raw.fields === undefined ? undefined : parseFields(raw.fields);
	return {
		type: 'table',
		title,
		description,
		...target,
		columns,
		// An editor missing a field would write records without it, so the table stays read-only instead.
		...(fields === undefined ? {} : isNotice(fields) ? { editingUnsupported: fields } : { fields }),
		itemName: text(raw.itemName, 40),
	};
}

function parseForm(
	raw: Record<string, unknown>,
	title: string | undefined,
	description: string | undefined,
): FormSection | UnsupportedNotice {
	const target = parseTarget(raw);
	if (isNotice(target)) {
		return target;
	}
	if (typeof raw.recordId !== 'string' || !raw.recordId) {
		return unreadable("It doesn't name the record it edits.");
	}
	const fields = parseFields(raw.fields ?? []);
	if (isNotice(fields)) {
		return fields;
	}
	return fields.length
		? { type: 'form', title, description, ...target, recordId: raw.recordId, fields }
		: unreadable('It has no fields.');
}

function parseTarget(
	raw: Record<string, unknown>,
): Pick<TableSection, 'database' | 'table' | 'primaryKey'> | UnsupportedNotice {
	const { database, table, primaryKey } = raw;
	if (typeof database !== 'string' || !database || typeof table !== 'string' || !table) {
		return unreadable("It doesn't name a database and table.");
	}
	// Reads and writes go by this key, so a guessed one could change the wrong record.
	if (primaryKey !== undefined && (typeof primaryKey !== 'string' || !primaryKey)) {
		return unreadable("Its primaryKey isn't an attribute name.");
	}
	return { database, table, primaryKey };
}

function parseColumn(raw: unknown): ExtensionColumn | undefined {
	if (!isRecord(raw) || typeof raw.attribute !== 'string' || !text(raw.label, 60)) {
		return undefined;
	}
	return {
		attribute: raw.attribute,
		label: text(raw.label, 60)!,
		format: typeof raw.format === 'string' && COLUMN_FORMATS.has(raw.format)
			? raw.format as ExtensionColumn['format']
			: undefined,
	};
}

/** Every field, or why not: a form or editor with a field left out would write records without it. */
function parseFields(raw: unknown): ExtensionField[] | UnsupportedNotice {
	if (!Array.isArray(raw)) {
		return unreadable("Its fields aren't a list.");
	}
	const fields: ExtensionField[] = [];
	for (const [index, candidate] of raw.entries()) {
		const field = parseField(candidate, index);
		if (isNotice(field)) {
			return field;
		}
		fields.push(field);
	}
	return fields;
}

function parseField(raw: unknown, index: number): ExtensionField | UnsupportedNotice {
	if (!isRecord(raw)) {
		return unreadable(`Its field ${index + 1} isn't a map.`);
	}
	const { attribute, input } = raw;
	const name = typeof attribute === 'string' && IDENTIFIER.test(attribute)
		? `field "${attribute}"`
		: `field ${index + 1}`;
	const label = text(raw.label, 60);
	if (typeof attribute !== 'string' || !attribute || !label) {
		return unreadable(`Its ${name} needs an attribute and a label.`);
	}
	if (typeof input !== 'string' || !FIELD_INPUTS.has(input)) {
		return typeof input === 'string' && IDENTIFIER.test(input)
			? newerStudio(`Its ${name} uses the input "${input}", which this version of Studio doesn't know.`)
			: unreadable(`Its ${name} has no input Studio can read.`);
	}
	if (raw.required !== undefined && typeof raw.required !== 'boolean') {
		return unreadable(`Its ${name} has a required that isn't true or false.`);
	}
	const options = raw.options === undefined
		? undefined
		: Array.isArray(raw.options)
		? parseAll(raw.options, parseOption) ?? null
		: null;
	if (options === null) {
		return unreadable(`Its ${name} has options Studio can't read.`);
	}
	return {
		attribute,
		label,
		input: input as ExtensionField['input'],
		description: text(raw.description, 300),
		placeholder: text(raw.placeholder, 120),
		required: raw.required === true,
		options,
		defaultValue: raw.defaultValue,
	};
}

function parseOption(raw: unknown): { value: string | number; label: string } | undefined {
	const label = isRecord(raw) ? text(raw.label, 80) : undefined;
	// An empty string can't be a select item's value (Radix reserves it for "no selection" and throws).
	return isRecord(raw) && label
			&& ((typeof raw.value === 'string' && raw.value !== '') || typeof raw.value === 'number')
		? { value: raw.value, label }
		: undefined;
}

function parseActions(
	raw: Record<string, unknown>,
	title: string | undefined,
	description: string | undefined,
	capabilities: ReadonlySet<string>,
): ActionsSection | UnsupportedNotice {
	const actions = (Array.isArray(raw.actions) ? raw.actions : []).map((action) => parseAction(action, capabilities))
		.filter((action) => action !== undefined);
	return actions.length
		? { type: 'actions', title, description, actions }
		: unreadable('It has no actions with a label and an operation to run.');
}

function parseAction(raw: unknown, capabilities: ReadonlySet<string>): ExtensionAction | undefined {
	if (!isRecord(raw) || !text(raw.label, 60)) {
		return undefined;
	}
	const request = parseRequest(raw.request);
	if (!request) {
		return undefined;
	}
	return {
		label: text(raw.label, 60)!,
		icon: text(raw.icon, 64),
		variant: raw.variant === 'destructive' ? 'destructive' : 'default',
		// A confirmation asked for in a shape this Studio can't read still asks, rather than running unasked.
		confirm: raw.confirm === undefined ? undefined : text(raw.confirm, 300) ?? UNREADABLE_CONFIRM,
		request,
		successMessage: text(raw.successMessage, 120),
		unsupported: checkRequires(raw.requires, capabilities),
	};
}

function parseRequest(raw: unknown): ExtensionRequest | undefined {
	return isRecord(raw) && typeof raw.operation === 'string' ? { ...raw, operation: raw.operation } : undefined;
}

/** Absent `requires` is the 5.4 baseline; anything else must be a list this Studio fully supports. */
function checkRequires(raw: unknown, capabilities: ReadonlySet<string>): UnsupportedNotice | undefined {
	if (raw === undefined) {
		return undefined;
	}
	if (!Array.isArray(raw) || !raw.every((name) => typeof name === 'string')) {
		return unreadable("Its requires isn't a list of capability names.");
	}
	const missing = raw.filter((name) => !capabilities.has(name));
	if (!missing.length) {
		return undefined;
	}
	const named = missing.filter((name) => IDENTIFIER.test(name)).slice(0, 3);
	const list = named.length
		? named.map((name) => `"${name}"`).join(', ') + (missing.length > named.length ? ' and more' : '')
		: 'a capability';
	return newerStudio(`It requires ${list}, which this version of Studio doesn't have.`);
}

/** A `kind` or `type` this Studio doesn't draw: newer when it is a name, malformed when it isn't one. */
function unknownName(value: unknown, what: string): UnsupportedNotice {
	if (value === undefined) {
		return unreadable(`It has no ${what}.`);
	}
	return typeof value === 'string' && IDENTIFIER.test(value)
		? newerStudio(`Its ${what} "${value}" isn't one this version of Studio knows.`)
		: unreadable(`Its ${what} can't be read.`);
}

function newerStudio(reason: string): UnsupportedNotice {
	return { cause: 'newer-studio', reason };
}

function unreadable(reason: string): UnsupportedNotice {
	return { cause: 'unreadable', reason };
}

function isNotice<T extends object>(value: T | UnsupportedNotice): value is UnsupportedNotice {
	return 'cause' in value;
}

function keyPath(parent: string, key: string): string {
	return IDENTIFIER.test(key) ? `${parent}.${key}` : `a key in ${parent}`;
}

function parseAll<T>(values: unknown[], parse: (value: unknown) => T | undefined): T[] | undefined {
	const parsed: T[] = [];
	for (const value of values) {
		const result = parse(value);
		if (result === undefined) {
			return undefined;
		}
		parsed.push(result);
	}
	return parsed;
}

function text(value: unknown, max: number): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, max) : undefined;
}

function stringArray(value: unknown): string[] | undefined {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
