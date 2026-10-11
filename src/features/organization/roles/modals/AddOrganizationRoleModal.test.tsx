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
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/features/organization/mutations/addOrganizationRole', () => ({
	useAddOrganizationRole: () => ({ mutate, isPending: false }),
}));

import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
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

	it('stops the role name at the 30 characters the form accepts, and says so there', () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		const name = screen.getByLabelText('Role Name') as HTMLInputElement;
		expect(name.maxLength).toBe(30);

		fireEvent.change(name, { target: { value: 'a'.repeat(30) } });
		expect(screen.getByText('Maximum 30 characters reached.')).toBeTruthy();
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

	it.each([
		['a refused one says it failed', new Error('Role already exists'), 1],
		[
			'one that got no answer leaves it to the global toast',
			new AxiosError('Network Error', AxiosError.ERR_NETWORK, {
				method: 'post',
				data: '{"name":"readers"}',
			} as InternalAxiosRequestConfig),
			0,
		],
	])('of the failed adds, %s', async (_, error, ownToasts) => {
		vi.mocked(toast.error).mockClear();
		mutate.mockImplementation((_data, { onError }) => onError(error));
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		await typeRoleName('readers');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
		});

		expect(mutate).toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledTimes(ownToasts);
	});
});
