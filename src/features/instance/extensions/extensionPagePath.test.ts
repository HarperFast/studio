import { extensionPagePath } from '@/features/instance/extensions/extensionPagePath';
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

const PLUGIN_KEY = 'shop.@harperfast/redirector.redirects';

/** The key the real router reads back from a link, through a route shaped like Studio's. */
async function routedKey(path: string): Promise<unknown> {
	const root = createRootRoute();
	const tab = createRoute({ getParentRoute: () => root, path: 'ext/$extensionKey' });
	const router = createRouter({
		routeTree: root.addChildren([tab]),
		history: createMemoryHistory({ initialEntries: [`/${path}`] }),
	});
	await router.load();
	const match = router.state.matches.at(-1);
	return match?.routeId === tab.id ? (match.params as { extensionKey?: string }).extensionKey : undefined;
}

describe('extensionPagePath', () => {
	it('keeps an app page key as it is, in its placement', () => {
		expect(extensionPagePath({ key: 'harper-redirects.redirects', placement: 'tab' })).toBe(
			'ext/harper-redirects.redirects',
		);
		expect(extensionPagePath({ key: 'harper-redirects.rules', placement: 'config' })).toBe(
			'config/ext/harper-redirects.rules',
		);
	});

	it("routes a plugin page's key whole, though its npm scope holds a slash", async () => {
		await expect(routedKey(extensionPagePath({ key: PLUGIN_KEY, placement: 'tab' }))).resolves.toBe(PLUGIN_KEY);
		// Unencoded, the scope's slash ends the segment, so the route reads a key that names no page.
		await expect(routedKey(`ext/${PLUGIN_KEY}`)).resolves.not.toBe(PLUGIN_KEY);
	});
});
