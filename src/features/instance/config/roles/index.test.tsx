/**
 * @vitest-environment jsdom
 */
import { ConfigRolesIndex } from '@/features/instance/config/roles/index';
import { LocalRole } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ alterRoleMutate: vi.fn(), params: { roleId: 'role-a' as string | undefined } }));

vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => vi.fn(),
	useParams: () => mocks.params,
}));
vi.mock('@/components/SimpleBrowseDataTable', () => ({
	SimpleBrowseDataTable: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/instance/config/roles/operations/AllowlistSupportedContext', () => ({
	AllowlistSupportedProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/lib/monaco/MonacoEditor', () => ({ Editor: () => null }));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'vs-dark' }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: { role: { id: 'someone-else' } } }) }));
vi.mock('@/integrations/api/instance/auth/alterRole', () => ({
	useAlterRole: () => ({ mutate: mocks.alterRoleMutate, isPending: false }),
}));
vi.mock('@/integrations/api/instance/auth/deleteRole', () => ({
	useDeleteRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/integrations/api/instance/database/getDescribeAll', () => ({
	getDescribeAllQueryOptions: () => ({
		queryKey: ['test', 'describe_all'],
		queryFn: () => ({ data: { dog: { primary_key: 'id', attributes: [{ attribute: 'id' }] } } }),
	}),
}));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: () => ({
		queryKey: ['test', 'registration_info'],
		queryFn: () => ({ version: '5.3.1' }),
	}),
}));

const dog = (read: boolean) => ({
	tables: { dog: { read, insert: false, update: false, delete: false, attribute_permissions: [] } },
});
const roles: LocalRole[] = [
	{ id: 'role-a', role: 'role_a', permission: { data: dog(true) }, __createdtime__: 0, __updatedtime__: 0 },
	{ id: 'role-b', role: 'role_b', permission: { data: dog(false) }, __createdtime__: 0, __updatedtime__: 0 },
];
vi.mock('@/integrations/api/instance/auth/getListRoles', () => ({
	getListRolesQueryOptions: () => ({ queryKey: ['test', 'list_roles'], queryFn: () => roles }),
}));

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(cleanup);

describe('ConfigRolesIndex', () => {
	it('gives another role its own draft when the selected role changes while the editor is open', async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const page = () => (
			<QueryClientProvider client={queryClient}>
				<ConfigRolesIndex />
			</QueryClientProvider>
		);
		const { rerender } = render(page());
		fireEvent.click(await screen.findByRole('checkbox', { name: 'Insert on data.dog' }));

		mocks.params = { roleId: 'role-b' };
		rerender(page());
		expect(await screen.findByText('Edit Role "role_b"')).toBeTruthy();
		expect((screen.getByRole('checkbox', { name: 'Read on data.dog' }) as HTMLInputElement).checked).toBe(false);
		expect((screen.getByRole('checkbox', { name: 'Insert on data.dog' }) as HTMLInputElement).checked).toBe(false);

		fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		const [payload] = mocks.alterRoleMutate.mock.calls[0];
		expect(payload.id).toBe('role-b');
		expect(payload.permission).toEqual({ data: dog(false) });
	});
});
