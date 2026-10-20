// @vitest-environment jsdom
import { breadcrumbTrail } from '@/components/breadcrumbTrail';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { rootRouteTree } from '@/router/rootRouteTree';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

// Every route that declares a parameter, from the real route tree, so a route added later is covered without a
// test of its own. Like orgUndefinedRepro.test.ts, this only matches routes: no loaders, no network.

const NAMES = { organization: 'Acme', cluster: 'prod', instance: 'node-1' };
const NAMED: Record<string, string> = { organizationId: 'Acme', clusterId: 'prod', instanceId: 'node-1' };
const VALUES: Record<string, string> = {
	organizationId: 'org-qpz5akmyrp1d0opj',
	clusterId: 'clu-tc9pqw20vrks2zik',
	instanceId: 'ins-abc123',
	mode: 'version',
};
const UUID = '4ac92da3-d8a0-423e-b145-5df107957dd4';
const NAME = 'my_item-2';

const router = createRouter({
	routeTree: rootRouteTree,
	history: createMemoryHistory({ initialEntries: ['/'] }),
	context: { queryClient: new QueryClient(), authentication: {} },
});

function sampleValue(param: string): string {
	return VALUES[param] ?? (param.endsWith('Id') ? UUID : NAME);
}

// A layout and its index route differ only by a trailing `/`.
const withoutTrailingSlash = (path: string) => path.replace(/(.)\/$/, '$1');

const parameterized = [
	...new Set(Object.values(router.routesById).map((route) => withoutTrailingSlash(route.fullPath as string))),
]
	.filter((fullPath) => fullPath.includes('$'))
	.sort();

describe('breadcrumbs over every route with a parameter', () => {
	it('finds the routes that have them', () => {
		expect(parameterized).toContain('/$organizationId/$clusterId/config/deployments/$deploymentId');
		expect(parameterized.length).toBeGreaterThan(10);
	});

	it.each(parameterized)('%s shows each parameter as its value or name, never Title Cased', (fullPath) => {
		const expected: string[] = [];
		const pathname = fullPath.replace(/\{-\$(\w+)\}|\$(\w+)/g, (_, optional?: string, required?: string) => {
			const param = (optional ?? required)!;
			const value = sampleValue(param);
			expected.push(
				NAMED[param] ?? (param === 'mode' ? capitalizeWords(value) : value === UUID ? UUID.slice(0, 8) : value),
			);
			return encodeURIComponent(value);
		});
		const leaf = router.matchRoutes(pathname).at(-1)!;
		expect(withoutTrailingSlash(leaf.fullPath)).toBe(fullPath);

		const labels = breadcrumbTrail(leaf.pathname, leaf.fullPath, leaf.params as Record<string, unknown>, NAMES)
			.map(({ label }) => label);
		// `databases/<db>/<table>` is one crumb, named for the table.
		const shown = fullPath.includes('{-$tableName}')
			? expected.filter((label) => label !== NAME).concat(NAME)
			: expected;
		for (const label of shown) {
			expect(labels).toContain(label);
		}
		expect(labels).not.toContain(capitalizeWords(UUID));
		expect(labels).not.toContain(capitalizeWords(NAME));
	});
});
