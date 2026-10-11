/**
 * @vitest-environment jsdom
 */
import { AddRoleModal } from '@/features/instance/config/roles/modals/AddRoleModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { addRoleMutate } = vi.hoisted(() => ({ addRoleMutate: vi.fn() }));

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
vi.mock('@/integrations/api/instance/auth/addRole', () => ({
	useAddRoleMutation: () => ({ mutate: addRoleMutate, isPending: false }),
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
	addRoleMutate.mockClear();
});

function renderModal() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<AddRoleModal onChangesSaved={() => {}} closeModal={() => {}} />
		</QueryClientProvider>,
	);
}

async function submitAs(name: string) {
	fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: name } });
	fireEvent.click(screen.getByRole('button', { name: /Add Role/ }));
	await waitFor(() => expect(addRoleMutate).toHaveBeenCalledTimes(1));
	const [payload] = addRoleMutate.mock.calls[0];
	expect(payload.role).toBe(name);
	return payload.permission as Record<string, unknown>;
}

describe('AddRoleModal', () => {
	it('creates a role with its table permissions in one step', async () => {
		renderModal();

		fireEvent.click(await screen.findByRole('checkbox', { name: 'Read on data.dog' }));
		expect(await submitAs('readers')).toEqual({
			super_user: false,
			structure_user: false,
			data: {
				tables: { dog: { read: true, insert: false, update: false, delete: false, attribute_permissions: [] } },
			},
		});
	});

	it('creates a super user role with nothing beside the flag, which is all Harper accepts', async () => {
		renderModal();

		fireEvent.click(await screen.findByRole('radio', { name: /Super user/ }));
		// The old form always sent `structure_user` too, which Harper rejects beside super_user: true.
		expect(await submitAs('admins')).toEqual({ super_user: true });
	});

	it('does not offer the cluster user type on Harper 5', async () => {
		renderModal();

		await screen.findByRole('radio', { name: /Super user/ });
		expect(screen.queryByRole('radio', { name: /Cluster user/ })).toBeNull();
	});
});
