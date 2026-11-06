import type { LocalRolePermissionAction } from '@/integrations/api/api.patch';
import type { IconName } from 'lucide-react/dynamic';

/**
 * What a component declares to put itself into Studio for a cluster. It lives in the component's own
 * `config.yaml` under a `studio:` key, so it ships, versions and deploys with the component:
 *
 * ```yaml
 * studio:
 *   pages:
 *     - id: redirects
 *       name: Redirects
 *       icon: signpost
 *       placement: tab
 *       access:
 *         tables: [{ database: redirects, table: Rule, actions: [read] }]
 *       content: { kind: sections, sections: [...] }
 * ```
 *
 * `get_studio_configuration` returns every page to every signed-in role, so a declaration must hold no
 * secrets or option values. Harper passes `access` and `content` through unread but strips page keys it
 * doesn't know, so a new marker (`requires`, app context, a placement refinement) goes inside `content`.
 * Studio reads the pages with `parseStudioConfiguration`; only `demoExtensions.ts` uses this wrapper.
 */
export interface StudioExtensionManifest {
	/** The component that contributed the pages, as `get_components` names it. */
	component: string;
	pages: ExtensionPageManifest[];
}

export interface ExtensionPageManifest {
	/** Unique within the component; Studio routes to `<component>.<id>`. */
	id: string;
	name: string;
	/** Any Lucide icon name (https://lucide.dev/icons). An unknown name falls back to a puzzle piece. */
	icon: IconName | (string & {});
	/**
	 * `tab` adds a top-level tab beside Applications, Databases, …; `config` adds an entry to the Config
	 * page's side menu, sorted alphabetically among the built-in entries.
	 */
	placement: 'tab' | 'config';
	description?: string;
	access?: ExtensionAccess;
	content: ExtensionContent;
}

/**
 * Who sees the page, in the instance-role terms Studio already gates on, and everything its sections
 * may send: a request it doesn't declare is never sent (access.ts). Every requirement outside
 * `optional` must hold to see the page, so Studio never offers one whose first request 403s. Omitted
 * entirely, any signed-in role sees it and its sections send nothing; declared but not fully readable (an
 * unknown key, a misspelt role) or naming one of Harper's own operations, no role does. Harper never
 * reads it.
 */
export interface ExtensionAccess {
	/**
	 * `super_user` matches the built-in admin tabs (`useInstanceManagePermission`); `structure_user`
	 * also admits roles that may run DDL (`useInstanceBrowseManagePermission`).
	 */
	role?: 'super_user' | 'structure_user';
	/**
	 * Every table action the page's sections and actions use, checked like the Databases browser checks
	 * them. `upsert` needs both insert and update.
	 */
	tables?: ExtensionTableGrant[];
	/**
	 * Operations the component registers itself (`server.registerOperation`) for its actions to send;
	 * naming one of Harper's own (`HARPER_OPERATIONS`), table DML included, denies the page (`refused`).
	 * They are super_user operations unless a role's `operations` allowlist names them, so a non-super
	 * role qualifies only through its allowlist.
	 */
	operations?: string[];
	/**
	 * Grants the page may use without every viewer holding them: declared, so its sections may send them,
	 * but not needed to see the page. A control that needs one appears only for roles that hold it, so
	 * readers can see a table that writers edit (`tables: [{…, actions: [read]}]` plus
	 * `optional: {tables: [{…, actions: [insert, update, delete]}]}`), or an admin-only action can sit on
	 * a page every reader sees.
	 */
	optional?: { tables?: ExtensionTableGrant[]; operations?: string[] };
	/**
	 * Parser-produced, never written by a component: the Harper operations `operations` (or
	 * `optional.operations`) names, which no page may send. Any entry denies the page to every role.
	 */
	refused?: string[];
	/**
	 * Parser-produced, never written by a component: the parts of `access` Studio couldn't read
	 * (`access.secrets`, `access.role`). Any entry denies the page to every role, since skipping a
	 * requirement it can't read would open the page to roles it was meant to exclude.
	 */
	unreadable?: string[];
}

export interface ExtensionTableGrant {
	database: string;
	table: string;
	actions: LocalRolePermissionAction[];
}

/**
 * The capabilities this Studio has beyond the Harper 5.4 baseline, which a `requires` list (on content, a
 * section or an action) is checked against. Studio ships inside Harper and is often never updated, so a
 * component that uses something newer names it there, and an older Studio shows a placeholder instead of
 * guessing. Empty: everything Studio draws today is baseline. A name joins in the change that draws it.
 */
export const STUDIO_CAPABILITIES: ReadonlySet<string> = new Set<string>();

/**
 * Parser-produced, never written by a component: what Studio shows in place of a description it can't
 * draw. `newer-studio` means it uses something this Studio doesn't know (a capability, content kind,
 * section type or input); `unreadable` means it is malformed.
 */
export interface UnsupportedNotice {
	cause: 'newer-studio' | 'unreadable';
	/** A sentence for the placeholder. It names fields and identifiers, never free-form values. */
	reason: string;
}

/**
 * How the page's body is drawn: always by Studio, from a description, so it looks and behaves like the
 * rest of Studio and runs no component code. `unsupported` is parser-produced, in place of content it
 * can't draw.
 */
export type ExtensionContent = SectionsContent | UnsupportedContent;

export interface SectionsContent {
	kind: 'sections';
	/** Capabilities beyond the 5.4 baseline (see {@link STUDIO_CAPABILITIES}). Omitted means none. */
	requires?: string[];
	sections: ExtensionSection[];
}

export interface UnsupportedContent extends UnsupportedNotice {
	kind: 'unsupported';
}

/** Every section may also carry `requires`, checked like the content's. `unsupported` is parser-produced. */
export type ExtensionSection =
	| TextSection
	| StatsSection
	| TableSection
	| FormSection
	| ActionsSection
	| UnsupportedSection;

interface RequiresCapabilities {
	/** Capabilities beyond the 5.4 baseline (see {@link STUDIO_CAPABILITIES}). Omitted means none. */
	requires?: string[];
}

export interface UnsupportedSection extends UnsupportedNotice {
	type: 'unsupported';
	title?: string;
}

/** Plain-text paragraphs (no HTML or Markdown, so nothing in it can script the page). */
export interface TextSection extends RequiresCapabilities {
	type: 'text';
	title?: string;
	body: string;
}

export interface StatsSection extends RequiresCapabilities {
	type: 'stats';
	items: { label: string; value: StatValue; icon?: IconName | (string & {}) }[];
}

/**
 * `unsupported` is parser-produced: the item keeps its label and shows a dash, as does a `count` of a
 * table the page doesn't declare reading.
 */
export type StatValue =
	| { kind: 'count'; database: string; table: string; where?: Record<string, unknown> }
	| { kind: 'static'; value: string }
	| ({ kind: 'unsupported' } & UnsupportedNotice);

/**
 * A browsable table bound to a Harper table. It reads just its key and the attributes its columns and
 * fields name. Add/edit/delete appear only when the page declares them and the viewer's role grants them.
 * They are raw `insert`/`update`/`delete` on the table, so the component's own Resource logic doesn't run.
 */
export interface TableSection extends RequiresCapabilities {
	type: 'table';
	title?: string;
	description?: string;
	database: string;
	table: string;
	/** Defaults to `id`. */
	primaryKey?: string;
	columns: ExtensionColumn[];
	/** The editor's fields. Omitted, the table is read-only whatever the role may do. */
	fields?: ExtensionField[];
	/**
	 * Parser-produced: a field Studio couldn't draw, so `fields` was dropped and the table is read-only
	 * rather than an editor that silently leaves an attribute out.
	 */
	editingUnsupported?: UnsupportedNotice;
	/** Noun for buttons and dialogs ("Add redirect"). */
	itemName?: string;
}

/**
 * A settings form bound to a single record, saved like a table's edits. Any field Studio can't draw makes
 * the whole form a placeholder.
 */
export interface FormSection extends RequiresCapabilities {
	type: 'form';
	title?: string;
	description?: string;
	database: string;
	table: string;
	recordId: string;
	primaryKey?: string;
	fields: ExtensionField[];
}

export interface ActionsSection extends RequiresCapabilities {
	type: 'actions';
	title?: string;
	description?: string;
	actions: ExtensionAction[];
}

/** Keys Studio doesn't know are ignored, so an optional key added later doesn't remove the action. */
export interface ExtensionAction extends RequiresCapabilities {
	label: string;
	icon?: IconName | (string & {});
	variant?: 'default' | 'destructive';
	/**
	 * Shown above the literal request in the confirmation dialog, which opens without it too for a table
	 * write or a destructive action.
	 */
	confirm?: string;
	request: ExtensionRequest;
	successMessage?: string;
	/** Parser-produced: why this Studio can't run the action, shown beside its disabled button. */
	unsupported?: UnsupportedNotice;
}

/**
 * A request a page makes, always to the operations API and only as its access declares
 * (`checkPageRequest`): table DML on a declared table, or an operation its component registers
 * (`server.registerOperation`) and lists in `access.operations`. Harper's other operations, and envelope
 * keys such as `impersonate`, are refused. A write that needs the component's own logic goes through such
 * an operation, since DML skips it.
 */
export interface ExtensionRequest {
	operation: string;
	[key: string]: unknown;
}

export interface ExtensionColumn {
	attribute: string;
	label: string;
	/** A format this Studio doesn't know draws as plain text; a column only displays, so that's safe. */
	format?: 'text' | 'code' | 'badge' | 'boolean' | 'number' | 'datetime';
}

export interface ExtensionField {
	attribute: string;
	label: string;
	input: 'text' | 'url' | 'number' | 'textarea' | 'select' | 'switch';
	description?: string;
	placeholder?: string;
	required?: boolean;
	options?: { value: string | number; label: string }[];
	/** Used when adding a record. */
	defaultValue?: unknown;
}

/** A page placed in Studio, carrying which component it came from. */
export interface ResolvedExtensionPage extends ExtensionPageManifest {
	/** `<component>.<id>`, the route segment (encoded, since a plugin's npm scope holds a `/`). */
	key: string;
	/**
	 * The app that declared the page, or for a plugin's page `<app>.<plugin>` (nested plugins chain), so
	 * one plugin used by two apps gives two pages.
	 */
	component: string;
	/** The top-level app the page belongs to, whether it declared the page or loads the plugin that did. */
	application?: string;
	/** For a plugin's page, the plugin keys from the app inward. Read instead of splitting `component`. */
	plugins?: string[];
	/** PROTOTYPE: served by the in-memory demo data source rather than the cluster. */
	demo?: boolean;
}

export function resolveExtensionPages(manifests: StudioExtensionManifest[], demo = false): ResolvedExtensionPage[] {
	return manifests.flatMap((manifest) =>
		manifest.pages.map((page) => ({
			...page,
			key: `${manifest.component}.${page.id}`,
			component: manifest.component,
			demo,
		}))
	);
}
