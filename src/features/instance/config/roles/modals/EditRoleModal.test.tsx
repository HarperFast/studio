/**
 * @vitest-environment jsdom
 */
import { EditRoleModal } from '@/features/instance/config/roles/modals/EditRoleModal';
import { LocalRole } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/*
 Exercises the full operations-lens wiring the component tests can't: a picker interaction must
 land in the JSON text (with `operations` ordered right after the top-level flags), and Save must
 send preparePermissionForSave's exact permission payload through alter_role.
 */

const { alterRoleMutate } = vi.hoisted(() => ({ alterRoleMutate: vi.fn() }));

// A controlled stand-in with the same contract as the Monaco wrapper: renders `value`, reports
// edits through onChange. Monaco itself cannot finish loading under jsdom.
vi.mock('@/lib/monaco/MonacoEditor', () => ({
	Editor: ({ value, onChange }: { value?: string; onChange?: (next: string) => void }) => (
		<textarea
			aria-label="Role permission JSON"
			value={value ?? ''}
			onChange={(e) => onChange?.(e.target.value)}
		/>
	),
}));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'vs-dark' }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));
vi.mock('@/hooks/useAuth', () => ({
	useInstanceAuth: () => ({ user: { role: { id: 'someone-elses-role' } } }),
}));
vi.mock('@/integrations/api/instance/auth/alterRole', () => ({
	useAlterRole: () => ({ mutate: alterRoleMutate, isPending: false }),
}));
vi.mock('@/integrations/api/instance/auth/deleteRole', () => ({
	useDeleteRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/integrations/api/instance/database/getDescribeAll', () => ({
	getDescribeAllQueryOptions: () => ({
		queryKey: ['test', 'describe_all'],
		queryFn: () => ({ data: { dog: { attributes: [{ attribute: 'id' }] } } }),
	}),
}));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: () => ({
		queryKey: ['test', 'registration_info'],
		queryFn: () => ({ version: '5.2.2' }),
	}),
}));

// Radix's switch/dialog rely on DOM APIs jsdom doesn't implement.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => {
	cleanup();
	alterRoleMutate.mockClear();
});

function renderModal(permission: LocalRole['permission']) {
	const data: LocalRole = {
		id: 'role-1',
		role: 'test_role',
		permission,
		__createdtime__: 0,
		__updatedtime__: 0,
	};
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<EditRoleModal
				data={data}
				isModalOpen
				closeModal={() => {}}
				onSelectRole={() => {}}
				onChangesSaved={() => {}}
			/>
		</QueryClientProvider>,
	);
}

describe('EditRoleModal operations wiring', () => {
	it('writes picker changes into the JSON with operations at the top, and saves that payload', async () => {
		renderModal({});

		fireEvent.click(await screen.findByRole('switch', { name: 'Restrict operations' }));
		fireEvent.click(screen.getByRole('checkbox', { name: /^read_only/ }));

		const editor = screen.getByRole('textbox', { name: 'Role permission JSON' }) as HTMLTextAreaElement;
		const written = JSON.parse(editor.value) as Record<string, unknown>;
		expect(written.operations).toEqual(['read_only']);
		// The allowlist must sit above the seeded table permissions, not below them.
		expect(Object.keys(written).indexOf('operations')).toBeLessThan(Object.keys(written).indexOf('data'));
		// The database seeded from describe_all survives the structured write.
		expect(written.data).toBeDefined();

		fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		expect(alterRoleMutate).toHaveBeenCalledTimes(1);
		const [payload] = alterRoleMutate.mock.calls[0];
		expect(payload.id).toBe('role-1');
		expect(payload.permission.operations).toEqual(['read_only']);
		expect(payload.permission.data).toBeDefined();
	});

	it('keeps the allowlist but strips table permissions when saving a super_user role', async () => {
		renderModal({ super_user: true, operations: ['read_only', 'deploy_component'] });

		// The switch reflects the existing restriction once registration info resolves.
		const restrictSwitch = await screen.findByRole('switch', { name: 'Restrict operations' });
		expect(restrictSwitch.getAttribute('aria-checked')).toBe('true');

		fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		expect(alterRoleMutate).toHaveBeenCalledTimes(1);
		const [payload] = alterRoleMutate.mock.calls[0];
		expect(payload.permission).toEqual({ super_user: true, operations: ['read_only', 'deploy_component'] });
	});
});
