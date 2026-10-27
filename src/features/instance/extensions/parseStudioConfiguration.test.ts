import { isSameOriginPath, parseStudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
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

describe('parseStudioConfiguration', () => {
	it('keeps a well-formed page and keys it by component and id', () => {
		const { pages } = parseStudioConfiguration({ pages: [page()] });
		expect(pages).toHaveLength(1);
		expect(pages[0]).toMatchObject({ key: 'harper-redirects.redirects', name: 'Redirects', placement: 'tab' });
	});

	it('drops a malformed page without dropping its neighbours', () => {
		const { pages } = parseStudioConfiguration({
			pages: [
				page({ id: 'Not Valid' }),
				page({ placement: 'sidebar' }),
				page({ name: '   ' }),
				page({ content: { kind: 'sections', sections: [{ type: 'unknown' }] } }),
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

	it('keeps only the navigation values it knows', () => {
		const { navigation, landing } = parseStudioConfiguration({
			navigation: { applications: 'hidden', logs: 'tucked', apis: 'gone', 'bad key!': 'hidden', status: 3 },
			landing: 'harper-redirects.redirects',
		});
		expect(navigation).toEqual({ applications: 'hidden', logs: 'tucked' });
		expect(landing).toBe('harper-redirects.redirects');
	});

	it('never takes srcdoc from a cluster, and drops a frame that would leave its origin', () => {
		const { pages } = parseStudioConfiguration({
			pages: [
				page({ id: 'inline', content: { kind: 'frame', srcdoc: '<script>alert(1)</script>' } }),
				page({ id: 'away', content: { kind: 'frame', path: '//evil.example/page' } }),
				page({ id: 'home', content: { kind: 'frame', path: '/cache-insights/', srcdoc: '<p>ignored</p>' } }),
			],
		});
		expect(pages.map((candidate) => candidate.key)).toEqual(['harper-redirects.home']);
		expect(pages[0].content).toEqual({ kind: 'frame', path: '/cache-insights/', minHeight: undefined });
	});

	it('drops endpoints and action requests that could leave the cluster', () => {
		const { pages } = parseStudioConfiguration({
			pages: [page({
				access: { endpoints: ['/Prerender/', 'https://evil.example/', '//evil.example/'] },
				content: {
					kind: 'sections',
					sections: [{
						type: 'actions',
						actions: [
							{ label: 'Good', request: { rest: { method: 'POST', path: '/Prerender/refresh' } } },
							{ label: 'Away', request: { rest: { method: 'POST', path: 'https://evil.example/' } } },
							{ label: 'Verb', request: { rest: { method: 'TRACE', path: '/Prerender/' } } },
						],
					}],
				},
			})],
		});
		expect(pages[0].access?.endpoints).toEqual(['/Prerender/']);
		const section = pages[0].content.kind === 'sections' ? pages[0].content.sections[0] : undefined;
		expect(section?.type === 'actions' && section.actions.map((action) => action.label)).toEqual(['Good']);
	});

	it('answers an unusable response with an empty configuration', () => {
		expect(parseStudioConfiguration('nope')).toEqual({ navigation: {}, pages: [] });
		expect(parseStudioConfiguration({ pages: 'nope' })).toEqual({ navigation: {}, landing: undefined, pages: [] });
	});
});

describe('isSameOriginPath', () => {
	it.each(['/Prerender/', '/a/b?c=d'])('accepts %s', (path) => {
		expect(isSameOriginPath(path)).toBe(true);
	});

	// `/\t/host` is the case worth keeping: the URL parser strips the tab, leaving `//host`.
	it.each([
		'//evil.example',
		'/\\evil.example',
		'/\t/evil.example',
		'/\n/evil.example',
		'https://evil.example',
		'relative',
	])(
		'refuses %j',
		(path) => {
			expect(isSameOriginPath(path)).toBe(false);
		},
	);
});
