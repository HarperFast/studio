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
 * PROTOTYPE: Studio cannot read that key for every role yet (`get_components` is super_user only), so
 * the pages here come from `demoExtensions.ts`. See `DESIGN.md` beside this file for the open question.
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
 * Who sees the page, in the instance-role terms Studio already gates on. Every listed requirement must
 * hold. A component should declare what its requests actually need, so Studio never offers a page
 * whose first request 403s. Omitted entirely, any signed-in role sees it.
 */
export interface ExtensionAccess {
	/**
	 * `super_user` matches the built-in admin tabs (`useInstanceManagePermission`); `structure_user`
	 * also admits roles that may run DDL (`useInstanceBrowseManagePermission`).
	 */
	role?: 'super_user' | 'structure_user';
	/** Table grants the page's requests need, checked like the Databases browser checks them. */
	tables?: ExtensionTableGrant[];
	/**
	 * Operations beyond table reads and writes. Those are super_user operations unless a role's
	 * `operations` allowlist names them, so a non-super role qualifies only through its allowlist.
	 */
	operations?: string[];
}

export interface ExtensionTableGrant {
	database: string;
	table: string;
	actions: LocalRolePermissionAction[];
}

/**
 * How the page's body is drawn: always by Studio, from a description, so it looks and behaves like the
 * rest of Studio and runs no component code.
 */
export type ExtensionContent = SectionsContent;

export interface SectionsContent {
	kind: 'sections';
	sections: ExtensionSection[];
}

export type ExtensionSection =
	| TextSection
	| StatsSection
	| TableSection
	| FormSection
	| ActionsSection;

/** Plain-text paragraphs (no HTML or Markdown, so nothing in it can script the page). */
export interface TextSection {
	type: 'text';
	title?: string;
	body: string;
}

export interface StatsSection {
	type: 'stats';
	items: { label: string; value: StatValue; icon?: IconName | (string & {}) }[];
}

export type StatValue =
	| { kind: 'count'; database: string; table: string; where?: Record<string, unknown> }
	| { kind: 'static'; value: string };

/** A browsable table bound to a Harper table. Add/edit/delete appear only for roles granted them. */
export interface TableSection {
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
	/** Noun for buttons and dialogs ("Add redirect"). */
	itemName?: string;
}

/** A settings form bound to a single record. */
export interface FormSection {
	type: 'form';
	title?: string;
	description?: string;
	database: string;
	table: string;
	recordId: string;
	primaryKey?: string;
	fields: ExtensionField[];
}

export interface ActionsSection {
	type: 'actions';
	title?: string;
	description?: string;
	actions: ExtensionAction[];
}

export interface ExtensionAction {
	label: string;
	icon?: IconName | (string & {});
	variant?: 'default' | 'destructive';
	/** Shown in a confirmation dialog before the request is sent. */
	confirm?: string;
	request: ExtensionRequest;
	successMessage?: string;
}

/**
 * A request a page makes, always to the operations API. A component that needs more than table reads and
 * writes registers its own operation (`server.registerOperation`) and declares it in `access.operations`.
 */
export interface ExtensionRequest {
	operation: string;
	[key: string]: unknown;
}

export interface ExtensionColumn {
	attribute: string;
	label: string;
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
	/** `<component>.<id>` — the route segment. */
	key: string;
	component: string;
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
