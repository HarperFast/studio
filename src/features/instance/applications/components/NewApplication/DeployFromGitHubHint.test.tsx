/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeployFromGitHubHint } from './DeployFromGitHubHint';

const { state } = vi.hoisted(() => ({
	state: {
		available: true,
		values: {} as Record<string, unknown>,
		keys: undefined as { name: string; host?: string; hostname?: string }[] | undefined,
		key: undefined as { name: string; host?: string; hostname?: string } | undefined,
		keysEnabled: undefined as boolean | undefined,
	},
}));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
	Link: ({ children, to, search }: { children?: ReactNode; to?: string; search?: Record<string, string> }) => (
		<a href={`${to}?${new URLSearchParams(search)}`}>{children}</a>
	),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: ({ queryKey, enabled }: { queryKey: readonly unknown[]; enabled?: boolean }) => {
		if (queryKey[1] === 'get_ssh_key') {
			return { data: enabled ? state.key : undefined };
		}
		state.keysEnabled = enabled;
		return { data: enabled ? state.keys : undefined };
	},
}));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({ entityId: 'clu-1' }) }));
vi.mock('@/features/instance/config/deployFromGitHub/useDeployFromGitHubAvailable', () => ({
	useDeployFromGitHubAvailable: () => state.available,
}));

const watch = ((name: string) => state.values[name]) as never;
const link = () => screen.queryByRole('link', { name: 'Set up deploys from GitHub' });

beforeEach(() => {
	Object.assign(state, {
		available: true,
		keys: undefined,
		key: undefined,
		keysEnabled: undefined,
		values: {
			'contents.ref': 'https://github.com/Acme/shop.git',
			'contents.requiresAuth': false,
			'contents.sshKeyName': '',
		},
	});
});

afterEach(cleanup);

describe('DeployFromGitHubHint', () => {
	it('links a GitHub import to Deploy from GitHub with the application and repository filled in', () => {
		render(<DeployFromGitHubHint project="shop" watch={watch} />);
		expect(screen.getByText(/Want every merge to Acme\/shop to deploy here\?/)).toBeTruthy();
		expect(link()?.getAttribute('href'))
			.toBe('/org-1/clu-1/config/deploy-from-github?project=shop&repository=Acme%2Fshop');
		expect(state.keysEnabled).toBe(false);
	});

	it("says nothing where Deploy from GitHub isn't offered, for another host, or without a name", () => {
		state.available = false;
		const rendered = render(<DeployFromGitHubHint project="shop" watch={watch} />);
		expect(link()).toBeNull();

		state.available = true;
		state.values['contents.ref'] = 'https://gitlab.com/Acme/shop.git';
		rendered.rerender(<DeployFromGitHubHint project="shop" watch={watch} />);
		expect(link()).toBeNull();

		state.values['contents.ref'] = 'https://github.com/Acme/shop.git';
		rendered.rerender(<DeployFromGitHubHint project="" watch={watch} />);
		expect(link()).toBeNull();
	});

	it("reads a URL on an SSH key's host alias through the chosen key", () => {
		Object.assign(state.values, {
			'contents.ref': 'git@shop-key.github.com:Acme/shop.git',
			'contents.requiresAuth': true,
			'contents.sshKeyName': 'shop-key',
		});
		state.keys = [{ name: 'other', host: 'shop-key.github.com', hostname: 'gitlab.com' }];
		const rendered = render(<DeployFromGitHubHint project="shop" watch={watch} />);
		expect(link()).toBeNull();

		// A listed row may carry only the name; the key's own record has its host.
		state.keys = [...state.keys, { name: 'shop-key' }];
		rendered.rerender(<DeployFromGitHubHint project="shop" watch={watch} />);
		expect(link()).toBeNull();

		state.key = { name: 'shop-key', host: 'shop-key.github.com', hostname: 'github.com' };
		rendered.rerender(<DeployFromGitHubHint project="shop" watch={watch} />);
		expect(link()?.getAttribute('href')).toContain('repository=Acme%2Fshop');
	});
});
