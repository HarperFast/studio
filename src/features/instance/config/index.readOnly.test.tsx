/** @vitest-environment jsdom */
import { ConfigIndex } from '@/features/instance/config';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	canManage: false,
	canListDeployments: false as boolean | undefined,
	pathname: '/org-1/cl-1/config/users',
	navigateRenders: 0,
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
	Navigate: ({ to }: { to: string }) => {
		state.navigateRenders++;
		return <div data-testid="redirect">{to}</div>;
	},
	Outlet: () => <div data-testid="outlet" />,
	useLoaderData: () => ({ version: '5.3.0' }),
	useLocation: () => ({ pathname: state.pathname }),
	useMatchRoute: () => ({ to, fuzzy }: { to: string; fuzzy?: boolean }) =>
		state.pathname === to || (!!fuzzy && state.pathname.startsWith(`${to}/`)),
	useParams: () => ({ organizationId: 'org-1', clusterId: 'cl-1' }),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({ data: undefined }),
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('@/features/instance/extensions/useStudioExtensions', () => ({
	useVisibleExtensionPages: () => [],
	useStudioConfiguration: () => ({ isPending: false }),
}));
vi.mock('@/hooks/useInstanceOperationPermission', () => ({
	useInstanceOperationAccess: (operation: string) =>
		operation === 'list_deployments' ? state.canListDeployments : false,
}));

describe('ConfigIndex in a read-only Fabric Connect session', () => {
	beforeEach(() => {
		state.canManage = false;
		state.canListDeployments = false;
		state.pathname = '/org-1/cl-1/config/users';
		state.navigateRenders = 0;
	});
	afterEach(cleanup);

	it('sends a non-manager who can list deployments from any other page to Deployments', () => {
		state.canListDeployments = true;

		render(<ConfigIndex />);

		expect(screen.getByTestId('redirect').textContent).toBe('/org-1/cl-1/config/deployments');
		expect(screen.queryByTestId('outlet')).toBeNull();
	});

	it('keeps one redirect while the location changes under it, since Navigate navigates again on new props', () => {
		state.canListDeployments = true;
		const { rerender } = render(<ConfigIndex />);
		state.pathname = '/org-1/cl-1/config/roles';
		rerender(<ConfigIndex />);

		expect(screen.getByTestId('redirect').textContent).toBe('/org-1/cl-1/config/deployments');
		expect(state.navigateRenders).toBe(1);
	});

	it('shows Deployments alone to a non-manager who can list them', () => {
		state.canListDeployments = true;
		state.pathname = '/org-1/cl-1/config/deployments/';

		render(<ConfigIndex />);

		expect(screen.getByTestId('outlet')).toBeTruthy();
		expect(screen.getAllByText('Deployments')).toHaveLength(2);
		expect(screen.queryByText('Overview')).toBeNull();
		expect(screen.queryByText('Users')).toBeNull();
	});

	it('sends a non-manager who cannot list deployments to Databases, inside the instance', () => {
		state.pathname = '/org-1/cl-1/config/deployments';

		render(<ConfigIndex />);

		expect(screen.getByTestId('redirect').textContent).toBe('/org-1/cl-1/databases');
	});

	it('waits on a deep link, rather than redirecting, while the user is still loading', () => {
		state.canListDeployments = undefined;

		render(<ConfigIndex />);

		expect(screen.getByText('Loading...')).toBeTruthy();
		expect(screen.queryByTestId('redirect')).toBeNull();
	});

	it('leaves a manager on the page they asked for', () => {
		state.canManage = true;

		render(<ConfigIndex />);

		expect(screen.getByTestId('outlet')).toBeTruthy();
		expect(screen.queryByTestId('redirect')).toBeNull();
		expect(screen.getAllByText('Users')).toHaveLength(2);
	});
});
