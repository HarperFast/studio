import type {
	ExtensionAccess,
	ExtensionAction,
	ExtensionColumn,
	ExtensionContent,
	ExtensionField,
	ExtensionRequest,
	ExtensionSection,
	ExtensionTableGrant,
	ResolvedExtensionPage,
	StatsSection,
} from '@/features/instance/extensions/manifest';
import type { LocalRolePermissionAction } from '@/integrations/api/api.patch';

/** Studio's own tabs, in nav order. These keys are what a cluster's `studio.navigation` names. */
export const BUILT_IN_TABS = ['applications', 'databases', 'apis', 'operations', 'status', 'logs', 'config'] as const;
export type BuiltInTab = (typeof BUILT_IN_TABS)[number];

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
}

export const EMPTY_STUDIO_CONFIGURATION: StudioConfiguration = Object.freeze({ navigation: {}, pages: [] });

const VISIBILITIES = new Set<string>(['visible', 'tucked', 'hidden']);
const NAVIGATION_KEY = /^[\w@.-]{1,128}$/;
const PAGE_ID = /^[a-z0-9-]{1,64}$/;
const TABLE_ACTIONS = new Set<string>(['read', 'insert', 'update', 'delete']);
const FIELD_INPUTS = new Set<string>(['text', 'url', 'number', 'textarea', 'select', 'switch']);
const COLUMN_FORMATS = new Set<string>(['text', 'code', 'badge', 'boolean', 'number', 'datetime']);
const REST_METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Reads the operation's response without trusting it. Harper passes a page's `content` and `access`
 * through as the component wrote them, so everything is checked here: anything malformed is dropped
 * (a page, a section, a field) rather than failing the page or, worse, the whole nav.
 */
export function parseStudioConfiguration(raw: unknown): StudioConfiguration {
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
		const page = parsePage(candidate);
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

function parsePage(raw: unknown): ResolvedExtensionPage | undefined {
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
	const content = parseContent(raw.content);
	if (!content) {
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
		content,
	};
}

function parseAccess(raw: unknown): ExtensionAccess | undefined {
	if (!isRecord(raw)) {
		return undefined;
	}
	const tables = Array.isArray(raw.tables)
		? raw.tables.map(parseTableGrant).filter((grant): grant is ExtensionTableGrant => grant !== undefined)
		: undefined;
	return {
		role: raw.role === 'super_user' || raw.role === 'structure_user' ? raw.role : undefined,
		tables,
		operations: stringArray(raw.operations),
		endpoints: stringArray(raw.endpoints)?.filter(isSameOriginPath),
	};
}

function parseTableGrant(raw: unknown): ExtensionTableGrant | undefined {
	if (!isRecord(raw) || typeof raw.database !== 'string' || typeof raw.table !== 'string') {
		return undefined;
	}
	const actions = stringArray(raw.actions)?.filter((action) => TABLE_ACTIONS.has(action));
	return actions?.length
		? { database: raw.database, table: raw.table, actions: actions as LocalRolePermissionAction[] }
		: undefined;
}

function parseContent(raw: unknown): ExtensionContent | undefined {
	if (!isRecord(raw)) {
		return undefined;
	}
	if (raw.kind === 'sections' && Array.isArray(raw.sections)) {
		const sections = raw.sections.map(parseSection).filter((section) => section !== undefined);
		return sections.length ? { kind: 'sections', sections } : undefined;
	}
	// A cluster's page is always served by the cluster. `srcdoc` is the prototype's stand-in and is never
	// taken from a cluster, which would let a config value inject a document of its choosing.
	if (raw.kind === 'frame' && typeof raw.path === 'string' && isSameOriginPath(raw.path)) {
		return {
			kind: 'frame',
			path: raw.path,
			minHeight: typeof raw.minHeight === 'number' ? Math.min(Math.max(raw.minHeight, 120), 4000) : undefined,
		};
	}
	return undefined;
}

function parseSection(raw: unknown): ExtensionSection | undefined {
	if (!isRecord(raw)) {
		return undefined;
	}
	const title = text(raw.title, 120);
	const description = text(raw.description, 500);
	switch (raw.type) {
		case 'text': {
			const body = text(raw.body, 5000);
			return body ? { type: 'text', title, body } : undefined;
		}
		case 'stats': {
			const items = (Array.isArray(raw.items) ? raw.items : []).flatMap((item: unknown): StatsSection['items'] => {
				if (!isRecord(item) || !text(item.label, 60) || !isRecord(item.value)) {
					return [];
				}
				const value = item.value;
				const label = text(item.label, 60)!;
				const icon = text(item.icon, 64);
				if (value.kind === 'static' && typeof value.value === 'string') {
					return [{ label, icon, value: { kind: 'static', value: value.value.slice(0, 60) } }];
				}
				if (value.kind === 'count' && typeof value.database === 'string' && typeof value.table === 'string') {
					const where = isRecord(value.where) ? value.where : undefined;
					return [{ label, icon, value: { kind: 'count', database: value.database, table: value.table, where } }];
				}
				return [];
			});
			return items.length ? { type: 'stats', items } : undefined;
		}
		case 'table': {
			if (typeof raw.database !== 'string' || typeof raw.table !== 'string') {
				return undefined;
			}
			const columns = (Array.isArray(raw.columns) ? raw.columns : []).map(parseColumn).filter((column) =>
				column !== undefined
			);
			if (!columns.length) {
				return undefined;
			}
			return {
				type: 'table',
				title,
				description,
				database: raw.database,
				table: raw.table,
				primaryKey: typeof raw.primaryKey === 'string' ? raw.primaryKey : undefined,
				columns,
				fields: Array.isArray(raw.fields) ? parseFields(raw.fields) : undefined,
				itemName: text(raw.itemName, 40),
			};
		}
		case 'form': {
			if (typeof raw.database !== 'string' || typeof raw.table !== 'string' || typeof raw.recordId !== 'string') {
				return undefined;
			}
			const fields = parseFields(Array.isArray(raw.fields) ? raw.fields : []);
			return fields.length
				? {
					type: 'form',
					title,
					description,
					database: raw.database,
					table: raw.table,
					recordId: raw.recordId,
					primaryKey: typeof raw.primaryKey === 'string' ? raw.primaryKey : undefined,
					fields,
				}
				: undefined;
		}
		case 'actions': {
			const actions = (Array.isArray(raw.actions) ? raw.actions : []).map(parseAction).filter((action) =>
				action !== undefined
			);
			return actions.length ? { type: 'actions', title, description, actions } : undefined;
		}
	}
	return undefined;
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

function parseFields(raw: unknown[]): ExtensionField[] {
	return raw.flatMap((field) => {
		if (!isRecord(field) || typeof field.attribute !== 'string' || !text(field.label, 60)) {
			return [];
		}
		if (typeof field.input !== 'string' || !FIELD_INPUTS.has(field.input)) {
			return [];
		}
		const options = Array.isArray(field.options)
			? field.options.flatMap((option) =>
				isRecord(option) && (typeof option.value === 'string' || typeof option.value === 'number')
					&& text(option.label, 80)
					? [{ value: option.value, label: text(option.label, 80)! }]
					: []
			)
			: undefined;
		return [{
			attribute: field.attribute,
			label: text(field.label, 60)!,
			input: field.input as ExtensionField['input'],
			description: text(field.description, 300),
			placeholder: text(field.placeholder, 120),
			required: field.required === true,
			options,
			defaultValue: field.defaultValue,
		}];
	});
}

function parseAction(raw: unknown): ExtensionAction | undefined {
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
		confirm: text(raw.confirm, 300),
		request,
		successMessage: text(raw.successMessage, 120),
	};
}

export function parseRequest(raw: unknown): ExtensionRequest | undefined {
	if (!isRecord(raw)) {
		return undefined;
	}
	if (isRecord(raw.rest)) {
		const { method, path, body } = raw.rest;
		return typeof method === 'string' && REST_METHODS.has(method) && typeof path === 'string'
				&& isSameOriginPath(path)
			? { rest: { method: method as 'GET', path, body } }
			: undefined;
	}
	return typeof raw.operation === 'string' && raw.rest === undefined
		? { ...raw, operation: raw.operation } as ExtensionRequest
		: undefined;
}

/**
 * A path on the cluster's own application origin: rooted, and not protocol-relative (`//host`) or
 * backslashed (`/\host`, which browsers read as `//host`), either of which would leave the cluster. No
 * whitespace or control characters either: the URL parser strips tabs and newlines, so `/\t/host`
 * becomes `//host` after this check. The data source re-checks the resolved origin before sending.
 */
export function isSameOriginPath(path: string): boolean {
	// oxlint-disable-next-line no-control-regex -- matching control characters is the point
	return path.startsWith('/') && !path.startsWith('//') && !/[\\\s\u0000-\u001f\u007f]/.test(path);
}

function text(value: unknown, max: number): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, max) : undefined;
}

function stringArray(value: unknown): string[] | undefined {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
