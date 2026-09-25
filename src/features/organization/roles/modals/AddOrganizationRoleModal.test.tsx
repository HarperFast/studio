/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Monaco can't load in jsdom; the permissions JSON isn't what these tests exercise.
vi.mock('@/lib/monaco/MonacoEditor', () => ({ Editor: () => null }));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ organizationId: 'org-1' }) }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/features/organization/mutations/addOrganizationRole', () => ({
	useAddOrganizationRole: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AddOrganizationRoleModal } from './AddOrganizationRoleModal';

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

async function typeRoleName(value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Role Name'), { target: { value } });
	});
}

async function leaveRoleName() {
	await act(async () => {
		fireEvent.blur(screen.getByLabelText('Role Name'));
	});
}

describe('AddOrganizationRoleModal', () => {
	it('explains a refused role name when Enter is pressed in it', async () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		await typeRoleName('my role');
		await act(async () => {
			fireEvent.keyDown(screen.getByLabelText('Role Name'), { key: 'Enter' });
		});

		expect(await screen.findByText('Role must contain only letters and underscores.')).toBeTruthy();
	});

	it.each([
		['a space', 'my role', 'Role must contain only letters and underscores.'],
		['more than 30 characters', 'a'.repeat(31), 'Role name cannot be longer than 30 characters.'],
		['nothing', '', 'Please enter a role name.'],
	])('explains why a role name with %s is refused once the field is left', async (_, name, message) => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		await typeRoleName('readers');
		await typeRoleName(name);
		expect(screen.queryByText(message)).toBeNull();

		await leaveRoleName();

		expect(await screen.findByText(message)).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled).toBe(true);
	});
});
