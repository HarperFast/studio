/** @vitest-environment jsdom */
import { InstanceNavBar } from '@/features/instance/InstanceNavBar';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { permission } = vi.hoisted(() => ({ permission: { canManage: true } }));

vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => permission.canManage }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));
vi.mock('@/components/Breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({ data: undefined }),
}));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children, 'aria-label': ariaLabel }: { to: string; children: ReactNode; 'aria-label'?: string }) => (
		<a href={to} aria-label={ariaLabel}>{children}</a>
	),
	useLoaderData: () => ({ version: '5.3.0' }),
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1', instanceId: 'ins-1' }),
}));

afterEach(cleanup);

describe('InstanceNavBar', () => {
	it('offers the operations console to a super user', () => {
		permission.canManage = true;
		render(<InstanceNavBar />);

		expect(screen.getByRole('link', { name: 'Operations' }).getAttribute('href'))
			.toBe('/org-1/clu-1/instance/ins-1/operations');
	});

	it('hides it from anyone else', () => {
		permission.canManage = false;
		render(<InstanceNavBar />);

		expect(screen.queryByRole('link', { name: 'Operations' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Databases' })).toBeTruthy();
	});
});
