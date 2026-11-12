import type {
	ExtensionContent,
	ExtensionSection,
	ResolvedExtensionPage,
	StatsSection,
	TableSection,
} from '@/features/instance/extensions/manifest';
import { parseStudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
import { DEMO_EXTENSIONS } from '@/features/instance/extensions/prototype/demoExtensions';
import { describe, expect, it } from 'vitest';

const page = (overrides: Record<string, unknown> = {}) => ({
	component: 'harper-redirects',
	id: 'redirects',
	name: 'Redirects',
	icon: 'signpost',
	placement: 'tab',
	content: { kind: 'sections', sections: [{ type: 'text', body: 'Hello' }] },
	...overrides,
});

const parsePage = (overrides: Record<string, unknown>, capabilities?: ReadonlySet<string>): ResolvedExtensionPage => {
	const { pages } = parseStudioConfiguration({ pages: [page(overrides)] }, capabilities);
	expect(pages).toHaveLength(1);
	return pages[0];
};

const parseContent = (content: unknown, capabilities?: ReadonlySet<string>): ExtensionContent =>
	parsePage({ content }, capabilities).content;

const parseSections = (sections: unknown[], capabilities?: ReadonlySet<string>): ExtensionSection[] => {
	const content = parseContent({ kind: 'sections', sections }, capabilities);
	if (content.kind !== 'sections') {
		throw new Error(`expected sections, got: ${content.reason}`);
	}
	return content.sections;
};

const parseSection = (section: unknown): ExtensionSection => parseSections([section])[0];

const table = (overrides: Record<string, unknown> = {}) => ({
	type: 'table',
	database: 'redirects',
	table: 'Rule',
	columns: [{ attribute: 'source', label: 'From' }],
	...overrides,
});

const form = (overrides: Record<string, unknown> = {}) => ({
	type: 'form',
	title: 'Settings',
	database: 'cache',
	table: 'Settings',
	recordId: 'default',
	fields: [{ attribute: 'ttl', label: 'TTL', input: 'number' }],
	...overrides,
});

describe('parseStudioConfiguration', () => {
	it('keeps a well-formed page and keys it by component and id', () => {
		const { pages } = parseStudioConfiguration({ pages: [page()] });
		expect(pages).toHaveLength(1);
		expect(pages[0]).toMatchObject({ key: 'harper-redirects.redirects', name: 'Redirects', placement: 'tab' });
		expect(pages[0].content).toEqual({ kind: 'sections', sections: [{ type: 'text', body: 'Hello' }] });
	});

	it('drops a page it cannot place without dropping its neighbours', () => {
		const { pages } = parseStudioConfiguration({
			pages: [
				page({ id: 'Not Valid' }),
				page({ placement: 'sidebar' }),
				page({ name: '   ' }),
				page({ component: 'bad component!' }),
				null,
				page({ id: 'ok' }),
			],
		});
		expect(pages.map((candidate) => candidate.key)).toEqual(['harper-redirects.ok']);
	});

	it('lets the first declaration of a key win', () => {
		const { pages } = parseStudioConfiguration({ pages: [page({ name: 'First' }), page({ name: 'Second' })] });
		expect(pages.map((candidate) => candidate.name)).toEqual(['First']);
	});

	it('lets the first declaration win even when it is only a placeholder', () => {
		const { pages } = parseStudioConfiguration({
			pages: [page({ name: 'First', content: { kind: 'frame' } }), page({ name: 'Second' })],
		});
		expect(pages.map((candidate) => [candidate.name, candidate.content.kind])).toEqual([['First', 'unsupported']]);
	});

	it('keeps only the navigation values it knows', () => {
		const { navigation, landing } = parseStudioConfiguration({
			navigation: { applications: 'hidden', logs: 'tucked', apis: 'gone', 'bad key!': 'hidden', status: 3 },
			landing: 'harper-redirects.redirects',
		});
		expect(navigation).toEqual({ applications: 'hidden', logs: 'tucked' });
		expect(landing).toBe('harper-redirects.redirects');
	});

	it("keeps a plugin's page under its app, with the scoped npm name in its key", () => {
		const parsed = parsePage({
			component: 'shop.@harperfast/redirector',
			application: 'shop',
		});
		expect(parsed).toMatchObject({
			key: 'shop.@harperfast/redirector.redirects',
			component: 'shop.@harperfast/redirector',
			application: 'shop',
			name: 'Redirects',
		});
	});

	it('ignores an application it cannot read, keeping the page', () => {
		expect(parsePage({ application: 'a b' }).application).toBeUndefined();
	});

	it('drops a page whose key is longer than a navigation key may be', () => {
		const component = `app.${'p'.repeat(121)}`; // 125 characters, so 'ab' makes a 128-character key
		expect(parseStudioConfiguration({ pages: [page({ component, id: 'ab' })] }).pages).toHaveLength(1);
		expect(parseStudioConfiguration({ pages: [page({ component, id: 'abc' })] }).pages).toEqual([]);
	});

	it("reads the root config's placements apart from the merged ones, and only when sent", () => {
		const parsed = parseStudioConfiguration({
			navigation: { logs: 'hidden', 'shop.@harperfast/redirector.redirects': 'tucked' },
			rootNavigation: { logs: 'hidden', bad: 'gone' },
			pages: [],
		});
		expect(parsed.navigation).toEqual({ logs: 'hidden', 'shop.@harperfast/redirector.redirects': 'tucked' });
		expect(parsed.rootNavigation).toEqual({ logs: 'hidden' });
		expect(parseStudioConfiguration({ navigation: {}, pages: [] })).not.toHaveProperty('rootNavigation');
	});

	it.each([['a list', ['logs']], ['null', null], ['a string', 'hidden']])(
		'marks root placements it was sent as %s unreadable, rather than as never sent',
		(_case, rootNavigation) => {
			const parsed = parseStudioConfiguration({ navigation: { logs: 'hidden' }, rootNavigation, pages: [] });
			expect(parsed.rootNavigationUnreadable).toBe(true);
			expect(parsed).not.toHaveProperty('rootNavigation');
		},
	);

	it('marks nothing unreadable when root placements are not sent', () => {
		expect(parseStudioConfiguration({ navigation: {}, pages: [] })).not.toHaveProperty('rootNavigationUnreadable');
	});

	it('marks root placements unreadable when one entry is a state Studio does not know, keeping the rest', () => {
		const parsed = parseStudioConfiguration({
			navigation: { logs: 'pinned', status: 'tucked' },
			rootNavigation: { logs: 'pinned', status: 'tucked' },
			pages: [],
		});
		expect(parsed.rootNavigationUnreadable).toBe(true);
		expect(parsed.rootNavigation).toEqual({ status: 'tucked' });
		expect(parsed.navigation).toEqual({ status: 'tucked' });
	});

	it("reads Harper's navigation as the root config's when it sends nothing else, unreadable entry and all", () => {
		expect(parseStudioConfiguration({ navigation: { logs: 'pinned' }, pages: [] }).rootNavigationUnreadable)
			.toBe(true);
		expect(parseStudioConfiguration({ navigation: 'hidden', pages: [] }).rootNavigationUnreadable).toBe(true);
	});

	it("ignores an unreadable merged entry once the root config's own placements are readable", () => {
		const parsed = parseStudioConfiguration({
			navigation: { 'shop.@harperfast/redirector.redirects': 'pinned' },
			rootNavigation: { logs: 'hidden' },
			pages: [],
		});
		expect(parsed).not.toHaveProperty('rootNavigationUnreadable');
	});

	it('names each use of one plugin by its app, and leaves names that do not clash alone', () => {
		const names = parseStudioConfiguration({
			pages: [
				page({ component: 'shop.@harperfast/redirector', application: 'shop' }),
				page({ component: 'blog.@harperfast/redirector', application: 'blog' }),
				page({ component: 'blog.@harperfast/redirector', application: 'blog', id: 'rules', placement: 'config' }),
				page({ component: 'docs', application: 'docs', id: 'search', name: 'Search' }),
			],
		}).pages.map((parsed) => parsed.name);
		expect(names).toEqual(['Redirects (shop)', 'Redirects (blog)', 'Redirects', 'Search']);
	});

	it("moves a generated name off one a page was given itself, leaving the page's own name alone", () => {
		const names = parseStudioConfiguration({
			pages: [
				page({ component: 'shop.@harperfast/redirector', application: 'shop' }),
				page({ component: 'blog.@harperfast/redirector', application: 'blog' }),
				page({ component: 'tools', application: 'tools', id: 'other', name: 'Redirects (shop)' }),
			],
		}).pages.map((parsed) => parsed.name);
		expect(names).toEqual(['Redirects (shop.@harperfast/redirector)', 'Redirects (blog)', 'Redirects (shop)']);
	});

	it('keeps naming until each label is unused, ending at the key', () => {
		const names = parseStudioConfiguration({
			pages: [
				page({ component: 'shop.plugin', application: 'shop', name: 'Settings', id: 'settings' }),
				page({ component: 'shop.other', application: 'shop', name: 'Settings', id: 'settings' }),
				page({ component: 'tools', application: 'tools', name: 'Settings (shop.plugin)', id: 'x' }),
				page({ component: 'docs', application: 'docs', name: 'Search', id: 'a' }),
				page({ component: 'docs', application: 'docs', name: 'Search', id: 'b' }),
			],
		}).pages.map((parsed) => parsed.name);
		expect(names).toEqual([
			'Settings (shop.plugin.settings)',
			'Settings (shop.other)',
			'Settings (shop.plugin)',
			'Search (docs.a)',
			'Search (docs.b)',
		]);
	});

	it('names pages by component when one app holds both, and by component when Harper sends no application', () => {
		const names = parseStudioConfiguration({
			pages: [
				page({ component: 'shop.@harperfast/redirector', application: 'shop', name: 'Settings' }),
				page({ component: 'shop.@harperfast/prerender', application: 'shop', name: 'Settings' }),
				page({ component: 'harper-a', id: 'x' }),
				page({ component: 'harper-b', id: 'x' }),
			],
		}).pages.map((parsed) => parsed.name);
		expect(names).toEqual([
			'Settings (shop.@harperfast/redirector)',
			'Settings (shop.@harperfast/prerender)',
			'Redirects (harper-a)',
			'Redirects (harper-b)',
		]);
	});

	it("answers a body that isn't an object with nothing, and with the root config's settings unknown", () => {
		// Read as "nothing set", setup would start by itself and write its preset over the cluster's own settings.
		for (const body of ['<!doctype html>', null, [], 42]) {
			expect(parseStudioConfiguration(body)).toEqual({ navigation: {}, rootNavigationUnreadable: true, pages: [] });
		}
	});

	it('answers an unusable list of pages with no pages', () => {
		expect(parseStudioConfiguration({ pages: 'nope' })).toEqual({ navigation: {}, landing: undefined, pages: [] });
	});

	it('reads every prototype demo page without a placeholder', () => {
		const pages = DEMO_EXTENSIONS.flatMap((manifest) =>
			manifest.pages.map((demo) => ({ ...demo, component: manifest.component }))
		);
		const parsed = parseStudioConfiguration({ pages }).pages;
		expect(parsed).toHaveLength(pages.length);
		const serialized = JSON.stringify(parsed);
		expect(serialized).not.toContain('unsupported');
		expect(serialized).not.toContain('unreadable');
		expect(parsed.map((demo) => demo.content.kind === 'sections' && demo.content.sections.length)).toEqual(
			pages.map((demo) => demo.content.kind === 'sections' && demo.content.sections.length),
		);
	});
});

describe('page content', () => {
	it('keeps a page that asks to draw itself as a placeholder, carrying nothing it asked for', () => {
		const { pages } = parseStudioConfiguration({
			pages: [
				page({ id: 'framed', content: { kind: 'frame', path: '/cache-insights/' } }),
				page({ id: 'inline', content: { kind: 'frame', srcdoc: '<script>alert(1)</script>' } }),
			],
		});
		expect(pages.map((candidate) => candidate.content)).toEqual([
			{ kind: 'unsupported', cause: 'newer-studio', reason: expect.stringContaining('"frame"') },
			{ kind: 'unsupported', cause: 'newer-studio', reason: expect.stringContaining('"frame"') },
		]);
		const serialized = JSON.stringify(pages);
		expect(serialized).not.toContain('/cache-insights/');
		expect(serialized).not.toContain('<script>');
	});

	it.each([
		['missing', undefined],
		['not a map', 'sections'],
		['a list', [{ type: 'text', body: 'Hello' }]],
		['without a kind', { sections: [{ type: 'text', body: 'Hello' }] }],
		['with a kind that is not a name', { kind: { nested: true }, sections: [] }],
		['with sections that are not a list', { kind: 'sections', sections: { type: 'text', body: 'Hello' } }],
		['with no sections', { kind: 'sections', sections: [] }],
	])('keeps a page whose content is %s, saying it could not be read', (_label, content) => {
		const parsed = parsePage({ content });
		expect(parsed.key).toBe('harper-redirects.redirects');
		expect(parsed.content).toEqual({ kind: 'unsupported', cause: 'unreadable', reason: expect.any(String) });
	});

	it('draws content with no requires, or with an empty one, as the baseline', () => {
		expect(parseContent({ kind: 'sections', sections: [{ type: 'text', body: 'Hi' }] }).kind).toBe('sections');
		expect(parseContent({ kind: 'sections', requires: [], sections: [{ type: 'text', body: 'Hi' }] }).kind)
			.toBe('sections');
	});

	it('shows a placeholder naming the capability content requires that this Studio lacks', () => {
		const content = { kind: 'sections', requires: ['charts'], sections: [{ type: 'text', body: 'Hi' }] };
		expect(parseContent(content)).toEqual({
			kind: 'unsupported',
			cause: 'newer-studio',
			reason: 'It requires "charts", which this version of Studio doesn\'t have.',
		});
	});

	it('draws content whose requires this Studio supports', () => {
		const content = { kind: 'sections', requires: ['charts'], sections: [{ type: 'text', body: 'Hi' }] };
		expect(parseContent(content, new Set(['charts'])).kind).toBe('sections');
		expect(parseContent({ ...content, requires: ['charts', 'maps'] }, new Set(['charts']))).toMatchObject({
			kind: 'unsupported',
			reason: expect.stringContaining('"maps"'),
		});
	});

	it('checks requires before the kind, so a newer kind says what it needs', () => {
		expect(parseContent({ kind: 'dashboard', requires: ['dashboards'] })).toMatchObject({
			reason: expect.stringContaining('"dashboards"'),
		});
	});

	it.each([['a string', 'charts'], ['a list with a non-name', ['charts', 2]], ['null', null]])(
		'treats requires that is %s as unreadable rather than as no requirement',
		(_label, requires) => {
			const content = { kind: 'sections', requires, sections: [{ type: 'text', body: 'Hi' }] };
			expect(parseContent(content)).toEqual({
				kind: 'unsupported',
				cause: 'unreadable',
				reason: "Its requires isn't a list of capability names.",
			});
		},
	);

	it('describes, rather than repeats, a capability that is not a name', () => {
		const content = { kind: 'sections', requires: ['<b>bold</b>'], sections: [{ type: 'text', body: 'Hi' }] };
		const parsed = parseContent(content);
		expect(parsed.kind === 'unsupported' && parsed.reason).toBe(
			"It requires a capability, which this version of Studio doesn't have.",
		);
	});
});

describe('sections', () => {
	it('keeps an unknown section type as a placeholder in its place, with its title', () => {
		const sections = parseSections([
			{ type: 'text', body: 'Before' },
			{ type: 'chart', title: 'Traffic', series: [] },
			{ type: 'text', body: 'After' },
		]);
		expect(sections.map((section) => section.type)).toEqual(['text', 'unsupported', 'text']);
		expect(sections[1]).toEqual({
			type: 'unsupported',
			title: 'Traffic',
			cause: 'newer-studio',
			reason: 'Its type "chart" isn\'t one this version of Studio knows.',
		});
	});

	it('keeps a section that requires a capability this Studio lacks as a placeholder', () => {
		expect(parseSection({ type: 'text', title: 'Notes', body: 'Hi', requires: ['markdown'] })).toEqual({
			type: 'unsupported',
			title: 'Notes',
			cause: 'newer-studio',
			reason: expect.stringContaining('"markdown"'),
		});
		expect(parseSections([{ type: 'text', body: 'Hi', requires: ['markdown'] }], new Set(['markdown']))[0].type)
			.toBe('text');
	});

	it.each([
		['not a map', null],
		['without a type', { title: 'Untyped', body: 'Hi' }],
		['text without a body', { type: 'text', body: '  ' }],
		['stats without labelled items', { type: 'stats', items: [{ value: { kind: 'static', value: '1' } }] }],
		['stats whose items are not a list', { type: 'stats', items: 'many' }],
		['a table with no readable columns', table({ columns: [{ attribute: 'source' }] })],
		['a table without a table name', table({ table: undefined })],
		['a table with an empty database name', table({ database: '' })],
		['a table whose primaryKey is not a name', table({ primaryKey: 7 })],
		['a form without a recordId', form({ recordId: undefined })],
		['a form with no fields', form({ fields: [] })],
		['a form whose primaryKey is empty', form({ primaryKey: '' })],
		['actions with no usable action', { type: 'actions', actions: [{ label: 'REST', request: { rest: {} } }] }],
		['actions whose actions are not a list', { type: 'actions', actions: 'refresh' }],
	])('keeps %s as an unreadable placeholder', (_label, section) => {
		expect(parseSection(section)).toMatchObject({ type: 'unsupported', cause: 'unreadable' });
	});
});

describe('stats', () => {
	const stats = (items: unknown[]) => {
		const section = parseSection({ type: 'stats', items });
		if (section.type !== 'stats') {
			throw new Error(`expected stats, got ${section.type}`);
		}
		return section.items;
	};

	it('keeps an item whose value kind is unknown, with its label and a placeholder value', () => {
		expect(stats([{ label: 'P95', icon: 'timer', value: { kind: 'percentile', of: 'latency' } }])).toEqual([{
			label: 'P95',
			icon: 'timer',
			value: {
				kind: 'unsupported',
				cause: 'newer-studio',
				reason: 'Its value kind "percentile" isn\'t one this version of Studio knows.',
			},
		}]);
	});

	it.each<[string, unknown]>([
		['missing', undefined],
		['a static that is not text', { kind: 'static', value: 42 }],
		['a count without a table', { kind: 'count', database: 'redirects' }],
		['a count whose where is not a map', { kind: 'count', database: 'redirects', table: 'Rule', where: ['x'] }],
	])('shows a placeholder for a value that is %s instead of guessing', (_label, value) => {
		const [item] = stats([{ label: 'Active', value }]);
		expect(item).toMatchObject({ label: 'Active', value: { kind: 'unsupported', cause: 'unreadable' } });
	});

	it('drops only the items without a label', () => {
		const items: StatsSection['items'] = stats([
			{ value: { kind: 'static', value: '1' } },
			{ label: 'Rules', value: { kind: 'count', database: 'redirects', table: 'Rule', where: { on: true } } },
		]);
		expect(items).toEqual([{
			label: 'Rules',
			value: { kind: 'count', database: 'redirects', table: 'Rule', where: { on: true } },
		}]);
	});
});

describe('fields', () => {
	const tableWith = (fields: unknown): TableSection => {
		const section = parseSection(table({ fields }));
		if (section.type !== 'table') {
			throw new Error(`expected a table, got ${section.type}`);
		}
		return section;
	};

	it('keeps an editable table whose every field it can draw', () => {
		const section = tableWith([{
			attribute: 'status',
			label: 'Status',
			input: 'select',
			required: true,
			options: [{ value: 301, label: 'Moved' }],
		}]);
		expect(section.editingUnsupported).toBeUndefined();
		expect(section.fields).toEqual([expect.objectContaining({
			attribute: 'status',
			required: true,
			options: [{ value: 301, label: 'Moved' }],
		})]);
	});

	it('makes a table read-only, saying why, when a field uses an input this Studio lacks', () => {
		const section = tableWith([
			{ attribute: 'source', label: 'From', input: 'text' },
			{ attribute: 'colour', label: 'Colour', input: 'color' },
		]);
		expect(section.fields).toBeUndefined();
		expect(section.columns).toEqual([{ attribute: 'source', label: 'From', format: undefined }]);
		expect(section.editingUnsupported).toEqual({
			cause: 'newer-studio',
			reason: 'Its field "colour" uses the input "color", which this version of Studio doesn\'t know.',
		});
	});

	it.each<[string, unknown]>([
		['fields that are not a list', { attribute: 'source', label: 'From', input: 'text' }],
		['a field that is not a map', ['source']],
		['a field without an attribute', [{ label: 'From', input: 'text' }]],
		['a field without a label', [{ attribute: 'source', input: 'text' }]],
		['a field without an input', [{ attribute: 'source', label: 'From' }]],
		['a required that is not true or false', [{ attribute: 'source', label: 'From', input: 'text', required: 'yes' }]],
		['options that are not a list', [{ attribute: 'code', label: 'Code', input: 'select', options: '301' }]],
		['an unreadable option', [{ attribute: 'code', label: 'Code', input: 'select', options: [{ value: true }] }]],
		// Radix's SelectItem throws on an empty-string value, which would break the whole editor.
		['an option whose value is empty', [{
			attribute: 'code',
			label: 'Code',
			input: 'select',
			options: [{ value: '', label: 'None' }],
		}]],
	])('makes a table read-only for %s', (_label, fields) => {
		const section = tableWith(fields);
		expect(section.fields).toBeUndefined();
		expect(section.editingUnsupported).toMatchObject({ cause: 'unreadable' });
	});

	it('makes a whole form a placeholder when any field is one it cannot draw', () => {
		expect(parseSection(form({ fields: [{ attribute: 'ttl', label: 'TTL', input: 'duration' }] }))).toEqual({
			type: 'unsupported',
			title: 'Settings',
			cause: 'newer-studio',
			reason: 'Its field "ttl" uses the input "duration", which this version of Studio doesn\'t know.',
		});
		expect(parseSection(form({ fields: [{ attribute: 'ttl', label: 'TTL', input: 'number', options: 3 }] })))
			.toMatchObject({ type: 'unsupported', cause: 'unreadable' });
	});

	it('draws a column whose format it does not know as plain text', () => {
		const section = parseSection(table({ columns: [{ attribute: 'when', label: 'When', format: 'relative-time' }] }));
		expect(section.type === 'table' && section.columns).toEqual([{ attribute: 'when', label: 'When' }]);
	});
});

describe('actions', () => {
	const actionsOf = (actions: unknown[]) => {
		const section = parseSection({ type: 'actions', actions });
		if (section.type !== 'actions') {
			throw new Error(`expected actions, got ${section.type}`);
		}
		return section.actions;
	};

	it('keeps only action requests that are operations', () => {
		const actions = actionsOf([
			{ label: 'Operation', request: { operation: 'prerender_refresh' } },
			{ label: 'REST', request: { rest: { method: 'POST', path: '/Prerender/refresh' } } },
			{ label: 'Unnamed', request: { operation: 42 } },
			{ request: { operation: 'prerender_refresh' } },
		]);
		expect(actions.map((action) => action.label)).toEqual(['Operation']);
	});

	it('keeps an action carrying keys it does not know', () => {
		const [action] = actionsOf([{
			label: 'Refresh',
			request: { operation: 'prerender_refresh' },
			result: { show: 'toast' },
			effect: 'refetch',
		}]);
		expect(action).toMatchObject({ label: 'Refresh', request: { operation: 'prerender_refresh' } });
		expect(action.unsupported).toBeUndefined();
	});

	it('marks an action that requires a capability this Studio lacks, keeping it in place', () => {
		const actions = actionsOf([
			{ label: 'Export', request: { operation: 'export_rules' }, requires: ['downloads'] },
			{ label: 'Refresh', request: { operation: 'prerender_refresh' } },
		]);
		expect(actions.map((action) => action.label)).toEqual(['Export', 'Refresh']);
		expect(actions[0].unsupported).toEqual({ cause: 'newer-studio', reason: expect.stringContaining('"downloads"') });
		expect(actions[1].unsupported).toBeUndefined();
		expect(actionsOf([{ label: 'Export', request: { operation: 'x' }, requires: 'downloads' }])[0].unsupported)
			.toMatchObject({ cause: 'unreadable' });
	});

	it('still asks for confirmation when it cannot read the one the action asked for', () => {
		const [unreadable, absent, written] = actionsOf([
			{ label: 'Purge', request: { operation: 'purge' }, confirm: { title: 'Purge?', body: 'All of it' } },
			{ label: 'Refresh', request: { operation: 'refresh' } },
			{ label: 'Flush', request: { operation: 'flush' }, confirm: 'Flush the cache?' },
		]);
		expect(unreadable.confirm).toEqual(expect.any(String));
		expect(absent.confirm).toBeUndefined();
		expect(written.confirm).toBe('Flush the cache?');
	});
});

describe('access', () => {
	const accessOf = (access: unknown) => parsePage(access === undefined ? {} : { access }).access;

	it('leaves an absent access as no requirement', () => {
		expect(accessOf(undefined)).toBeUndefined();
	});

	it('reads a well-formed access', () => {
		expect(accessOf({
			role: 'structure_user',
			tables: [{ database: 'redirects', table: 'Rule', actions: ['read', 'update'] }],
			operations: ['redirect_import'],
		})).toEqual({
			role: 'structure_user',
			tables: [{ database: 'redirects', table: 'Rule', actions: ['read', 'update'] }],
			operations: ['redirect_import'],
		});
	});

	it.each<[string, unknown, string[]]>([
		['not a map', 'super_user', ['access']],
		['null', null, ['access']],
		['an unknown key', { tables: [], secrets: ['vault'] }, ['access.secrets']],
		['an unknown key that is not a name', { 'two words': true }, ['a key in access']],
		['a misspelt role', { role: 'superuser' }, ['access.role']],
		['tables that are not a list', { tables: { database: 'redirects', table: 'Rule', actions: ['read'] } }, [
			'access.tables',
		]],
		['a grant that is not a map', { tables: ['redirects.Rule'] }, ['access.tables[0]']],
		['a grant without a database', { tables: [{ table: 'Rule', actions: ['read'] }] }, ['access.tables[0].database']],
		['a grant with a numeric table', { tables: [{ database: 'redirects', table: 7, actions: ['read'] }] }, [
			'access.tables[0].table',
		]],
		['a grant with an unknown action', { tables: [{ database: 'redirects', table: 'Rule', actions: ['write'] }] }, [
			'access.tables[0].actions',
		]],
		['a grant with no actions', { tables: [{ database: 'redirects', table: 'Rule', actions: [] }] }, [
			'access.tables[0].actions',
		]],
		['a grant with an unknown key', {
			tables: [{ database: 'redirects', table: 'Rule', actions: ['read'], attributes: ['source'] }],
		}, ['access.tables[0].attributes']],
		['operations that are not a list', { operations: 'restart_service' }, ['access.operations']],
		['an operation that is not text', { operations: ['restart_service', 7] }, ['access.operations']],
	])('marks access that is %s as unreadable, keeping none of it', (_label, access, unreadable) => {
		expect(accessOf(access)).toEqual({ unreadable });
	});

	it('names every part it could not read', () => {
		expect(accessOf({ role: 'admin', secrets: 1, tables: [{ database: 'd', table: 't', actions: ['read'] }, 3] }))
			.toEqual({ unreadable: ['access.secrets', 'access.role', 'access.tables[1]'] });
	});
});
