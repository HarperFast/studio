// @vitest-environment jsdom
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { rootRouteTree } from '@/router/rootRouteTree';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Fabric MCP connector sends people to /#/sign-in?redirect=… when its sign-in finds no session; one who is
// already signed in goes straight on, through the real route tree and the real `beforeLoad` guard.
const user = { id: 'usr_a', email: 'a@example.com', roles: {} };
const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';

const replace = vi.fn();
const assign = vi.fn();

function open(path: string) {
	return createRouter({
		routeTree: rootRouteTree,
		history: createMemoryHistory({ initialEntries: [path] }),
		context: {
			queryClient: new QueryClient(),
			authentication: { [OverallAppSignIn]: { isLoading: false, user } } as never,
		},
	});
}

function signInWith(redirect: string) {
	return open(`/sign-in?redirect=${encodeURIComponent(redirect)}`);
}

beforeEach(() => {
	replace.mockReset();
	assign.mockReset();
	vi.stubGlobal('location', { ...window.location, replace, assign });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the sign-in page for a user who is already signed in', () => {
	it('loads the MCP authorization in place of the sign-in page', async () => {
		const router = signInWith(mcpAuthorize);
		await router.load();

		// Replacing, not pushing: Back must not land on a sign-in page that sends the user straight on again.
		await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize));
		expect(assign).not.toHaveBeenCalled();
	});

	it('navigates to an in-app redirect without leaving the page', async () => {
		const router = signInWith('/new-org');
		await router.load();

		await vi.waitFor(() => expect(router.state.location.pathname).toBe('/new-org'));
		expect(replace).not.toHaveBeenCalled();
		expect(assign).not.toHaveBeenCalled();
	});

	// `to` would read the query as part of the path and turn `https://` into `https:/`.
	it("keeps an in-app redirect's own query", async () => {
		const router = signInWith('/new-org?from=https://github.com/Acme/shop.git');
		await router.load();

		await vi.waitFor(() => expect(router.state.location.pathname).toBe('/new-org'));
		expect(router.state.location.search).toEqual({ from: 'https://github.com/Acme/shop.git' });
	});

	it.each([
		['another host', 'https://evil.example/oauth/mcp/authorize'],
		['a protocol-relative host', '//evil.example/oauth/mcp/authorize'],
		['another server path', '/oauth/google/login?redirect=https://evil.example'],
	])('never loads %s', async (_label, redirect) => {
		const router = signInWith(redirect);
		await router.load();

		await vi.waitFor(() => expect(router.state.location.pathname).not.toBe('/sign-in'));
		expect(replace).not.toHaveBeenCalled();
		expect(assign).not.toHaveBeenCalled();
	});
});

describe('the sign-up page for a user who is already signed in', () => {
	it('loads the MCP authorization in place of the sign-up page', async () => {
		const router = open(`/sign-up?redirect=${encodeURIComponent(mcpAuthorize)}`);
		await router.load();

		await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(mcpAuthorize));
	});

	it('navigates to an in-app redirect, keeping its query', async () => {
		const router = open(`/sign-up?redirect=${encodeURIComponent('/new-org?from=https://github.com/Acme/shop.git')}`);
		await router.load();

		await vi.waitFor(() => expect(router.state.location.pathname).toBe('/new-org'));
		expect(router.state.location.search).toEqual({ from: 'https://github.com/Acme/shop.git' });
	});

	it.each([
		['no redirect', '/sign-up'],
		['a redirect it would not follow', `/sign-up?redirect=${encodeURIComponent('//evil.example')}`],
	])('stays on the form for %s', async (_label, path) => {
		const router = open(path);
		await router.load();

		expect(router.state.location.pathname).toBe('/sign-up');
		expect(router.state.matches.at(-1)?.routeId).toMatch(/sign-up$/);
		expect(replace).not.toHaveBeenCalled();
	});
});
