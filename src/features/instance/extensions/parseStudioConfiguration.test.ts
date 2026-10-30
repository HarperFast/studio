import { parseStudioConfiguration } from '@/features/instance/extensions/parseStudioConfiguration';
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

	it('drops a page that asks to draw itself, since Studio draws every page', () => {
		const { pages } = parseStudioConfiguration({
			pages: [
				page({ id: 'framed', content: { kind: 'frame', path: '/cache-insights/' } }),
				page({ id: 'inline', content: { kind: 'frame', srcdoc: '<script>alert(1)</script>' } }),
				page({ id: 'drawn' }),
			],
		});
		expect(pages.map((candidate) => candidate.key)).toEqual(['harper-redirects.drawn']);
	});

	it('keeps only action requests that are operations', () => {
		const { pages } = parseStudioConfiguration({
			pages: [page({
				content: {
					kind: 'sections',
					sections: [{
						type: 'actions',
						actions: [
							{ label: 'Operation', request: { operation: 'prerender_refresh' } },
							{ label: 'REST', request: { rest: { method: 'POST', path: '/Prerender/refresh' } } },
							{ label: 'Unnamed', request: { operation: 42 } },
						],
					}],
				},
			})],
		});
		const [section] = pages[0].content.sections;
		expect(section.type === 'actions' && section.actions.map((action) => action.label)).toEqual(['Operation']);
	});

	it('answers an unusable response with an empty configuration', () => {
		expect(parseStudioConfiguration('nope')).toEqual({ navigation: {}, pages: [] });
		expect(parseStudioConfiguration({ pages: 'nope' })).toEqual({ navigation: {}, landing: undefined, pages: [] });
	});
});
