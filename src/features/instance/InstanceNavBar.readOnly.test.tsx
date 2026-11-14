/** @vitest-environment jsdom */
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { session } = vi.hoisted(() => ({
	session: {
		canManage: true,
		permission: undefined as Record<string, unknown> | undefined,
		token: undefined as string | undefined,
		queriesEnabled: new Map<unknown, unknown>(),
	},
}));

vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => session.canManage }));
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: { role: { permission: session.permission } } }) }));
vi.mock('@/features/auth/store/authStore', () => ({ authStore: { getOperationToken: () => session.token } }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));
vi.mock('@/components/Breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('@/features/instance/extensions/useStudioExtensions', () => ({
	useNavigationVisibility: () => () => 'visible',
	useVisibleExtensionPages: () => [],
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: (options: { queryKey: readonly unknown[]; enabled?: unknown }) => {
		session.queriesEnabled.set(options.queryKey[0], options.enabled);
		return { data: undefined };
	},
}));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children, 'aria-label': ariaLabel }: { to: string; children: ReactNode; 'aria-label'?: string }) => (
		<a href={to} aria-label={ariaLabel}>{children}</a>
	),
	useLoaderData: () => ({ version: '5.3.0' }),
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1', instanceId: 'ins-1' }),
	useLocation: () => ({ pathname: '/org-1/clu-1/instance/ins-1/databases' }),
}));

// central-manager's read-only Fabric Connect allowlist.
const READ_ONLY_OPERATIONS = [
	'user_info',
	'system_information',
	'registration_info',
	'get_status',
	'describe_all',
	'describe_schema',
	'describe_table',
	'get_job',
	'get_analytics',
	'list_metrics',
	'read_log',
];
const scopedToken = [
	'eyJhbGciOiJSUzI1NiJ9',
	btoa(JSON.stringify({ sub: 'scoped-operation' })).replace(/=+$/, ''),
	'sig',
]
	.join('.');

const linkNames = () => screen.queryAllByRole('link').map((link) => link.getAttribute('aria-label'));

beforeEach(() => {
	session.canManage = true;
	session.permission = { super_user: true };
	session.token = undefined;
	session.queriesEnabled.clear();
});

afterEach(cleanup);

describe('InstanceNavBar in a read-only Fabric Connect session', () => {
	it('offers every page to a super user, without a read-only badge', () => {
		render(<InstanceNavBar />);

		expect(screen.getByRole('link', { name: 'Operations' }).getAttribute('href'))
			.toBe('/org-1/clu-1/instance/ins-1/operations');
		for (const name of ['Applications', 'Databases', 'Status', 'Logs', 'Config']) {
			expect(linkNames()).toContain(name);
		}
		expect(screen.queryAllByText('Read-only')).toHaveLength(0);
	});

	it('offers a read-only Fabric Connect session the pages its token can read, and says it is read-only', () => {
		session.canManage = false;
		session.permission = { super_user: false, cluster_user: false, operations: READ_ONLY_OPERATIONS };
		session.token = scopedToken;
		render(<InstanceNavBar />);

		expect(linkNames().sort()).toEqual(['Databases', 'Logs', 'Status']);
		// Desktop and mobile navs each carry it; CSS shows one.
		expect(screen.getAllByText('Read-only')).toHaveLength(2);
	});

	it('adds Applications and Config once the token also lists the package reads, as on Harper 5.4.0', () => {
		session.canManage = false;
		session.permission = {
			super_user: false,
			cluster_user: false,
			operations: [...READ_ONLY_OPERATIONS, 'get_components', 'list_deployments', 'get_deployment'],
		};
		session.token = scopedToken;
		render(<InstanceNavBar />);

		expect(linkNames().sort()).toEqual(['Applications', 'Config', 'Databases', 'Logs', 'Status']);
	});

	it('offers a non-super role without an allowlist only Databases, as before', () => {
		session.canManage = false;
		session.permission = { super_user: false, structure_user: true };
		render(<InstanceNavBar />);

		expect(linkNames()).toEqual(['Databases']);
	});

	it('sends no get_status while the instance user is still loading', () => {
		session.canManage = false;
		session.permission = undefined;
		render(<InstanceNavBar />);

		expect(session.queriesEnabled.get('get_status')).toBe(false);
	});
});
