/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectStub } from '../../serviceAccounts/__tests__/selectStub';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ organizationId: 'org-1' }) }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useQuery: () => ({
		data: {
			clusters: [
				{ id: 'clu-a', name: 'alpha', status: 'RUNNING' },
				{ id: 'clu-b', name: 'beta', status: 'RUNNING' },
				{ id: 'clu-c', name: 'gamma', status: 'TERMINATED' },
			],
		},
	}),
}));
vi.mock('@/features/organization/mutations/addOrganizationRole', () => ({
	useAddOrganizationRole: () => ({ mutate, isPending: false }),
}));
vi.mock('@/components/ui/select', () => selectStub);
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));
vi.mock('@/lib/monaco/MonacoEditor', () => ({
	Editor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
		<textarea
			aria-label="Permissions JSON"
			value={value}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
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

beforeEach(() => {
	mutate.mockReset();
});

afterEach(cleanup);

const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const createButton = () => screen.getByRole('button', { name: 'Create role' }) as HTMLButtonElement;
const jsonEditor = () => screen.getByLabelText('Permissions JSON') as HTMLTextAreaElement;

async function typeRoleName(value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Role name'), { target: { value } });
	});
}

async function leaveRoleName() {
	await act(async () => {
		fireEvent.blur(screen.getByLabelText('Role name'));
	});
}

async function click(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
}

async function openTab(name: string) {
	await act(async () => {
		fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
	});
}

async function typeJson(text: string) {
	await act(async () => {
		fireEvent.change(jsonEditor(), { target: { value: text } });
	});
}

describe('AddOrganizationRoleModal', () => {
	it('explains a refused role name when Enter is pressed in it', async () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		await typeRoleName('my role');
		await act(async () => {
			fireEvent.keyDown(screen.getByLabelText('Role name'), { key: 'Enter' });
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
		expect(createButton().disabled).toBe(true);
	});

	it('lays out every permission a role can have, starting from the defaults it always had', () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		const update = screen.getByRole('checkbox', {
			name: 'Update organization',
			description: 'Change the organization’s settings and billing.',
		}) as HTMLInputElement;
		expect(update.checked).toBe(false);
		expect(checkbox('Delete organization').checked).toBe(false);
		for (const area of ['Roles', 'Clusters']) {
			for (const action of ['View', 'Create', 'Update', 'Delete']) {
				expect(checkbox(`${area}: ${action}`).checked, `${area}: ${action}`).toBe(true);
			}
		}
		expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('all');
		expect(screen.getByText(/Role permissions also control membership/)).toBeTruthy();
		expect(screen.getByText('Cluster Update also allows running operations.')).toBeTruthy();
	});

	it('doesn’t report an empty role name before you have been in the field', async () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		const roleName = screen.getByLabelText('Role name');
		expect(document.activeElement).not.toBe(roleName);
		await act(async () => {
			screen.getByRole('tab', { name: 'Advanced JSON' }).focus();
		});
		await openTab('Advanced JSON');
		await openTab('Permissions');
		expect(screen.queryByText('Please enter a role name.')).toBeNull();
	});

	it('creates a role with the payload central manager expects', async () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		await typeRoleName('operators');
		await click(checkbox('Update organization'));
		await click(checkbox('Roles: Delete'));
		await click(checkbox('Clusters: Create'));
		await click(createButton());
		expect(mutate.mock.calls[0][0]).toEqual({
			name: 'operators',
			organizationId: 'org-1',
			update: true,
			delete: false,
			roles: { create: true, view: true, update: true, delete: false },
			clusters: { create: false, view: true, update: true, delete: true, resources: [] },
		});
	});

	it('limits view, update and delete to the selected clusters', async () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		await typeRoleName('alpha_deployers');
		await act(async () => {
			// The select stand-in carries a fixed label; this dialog has only the cluster access picker.
			fireEvent.change(screen.getByRole('combobox'), { target: { value: 'selected' } });
		});
		expect(screen.getByText(/Create always applies to the whole organization/)).toBeTruthy();
		expect(screen.queryByRole('checkbox', { name: /gamma/ })).toBeNull();
		await click(checkbox('alpha'));
		await click(checkbox('Clusters: Delete'));
		await click(createButton());
		expect(mutate.mock.calls[0][0].clusters).toEqual({
			create: true,
			view: false,
			update: false,
			delete: false,
			resources: [
				{
					id: 'clu-a',
					view: true,
					update: true,
					delete: false,
					instances: { create: true, view: true, update: true, delete: false },
				},
			],
		});
	});

	it('edits the same permissions as JSON, keeping what the form can’t show', async () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		await typeRoleName('mixed');
		await click(checkbox('Update organization'));
		await openTab('Advanced JSON');
		const shown = JSON.parse(jsonEditor().value);
		expect(shown.update).toBe(true);

		const instances = { create: false, view: true, update: false, delete: false };
		shown.clusters.resources = [
			{ id: 'clu-a', view: true, update: true, delete: false, instances },
			{ id: 'clu-b', view: true, update: false, delete: false, instances },
		];
		await typeJson(JSON.stringify(shown));
		await openTab('Permissions');
		expect(screen.getByText(/in a way this form can’t show/)).toBeTruthy();
		expect(checkbox('Clusters: View').disabled).toBe(true);
		expect(checkbox('Update organization').checked).toBe(true);

		await click(createButton());
		expect(mutate.mock.calls[0][0].clusters.resources).toEqual(shown.clusters.resources);
	});

	it('keeps you on the JSON until it describes a role, and won’t create until then', async () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		await typeRoleName('broken');
		await openTab('Advanced JSON');
		const valid = jsonEditor().value;

		await typeJson('{ "update": ');
		expect(screen.getByRole('alert').textContent).toMatch(/isn’t valid JSON/);
		expect(createButton().disabled).toBe(true);
		await openTab('Permissions');
		expect(screen.getByLabelText('Permissions JSON')).toBeTruthy();

		await typeJson(JSON.stringify({ ...JSON.parse(valid), owner: true }));
		expect(screen.getByRole('alert')).toBeTruthy();

		await typeJson(valid);
		expect(screen.queryByRole('alert')).toBeNull();
		expect(createButton().disabled).toBe(false);
		await openTab('Permissions');
		expect(checkbox('Roles: View').checked).toBe(true);
	});

	it('stops the role name at the 30 characters the form accepts, and says so there', () => {
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		const name = screen.getByLabelText('Role name') as HTMLInputElement;
		expect(name.maxLength).toBe(30);

		fireEvent.change(name, { target: { value: 'a'.repeat(30) } });
		expect(screen.getByText('Maximum 30 characters reached.')).toBeTruthy();
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
	])('of the failed creates, %s', async (_, error, ownToasts) => {
		vi.mocked(toast.error).mockClear();
		mutate.mockImplementation((_data, { onError }) => onError(error));
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={() => {}} />);
		await typeRoleName('readers');
		await click(createButton());

		expect(mutate).toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledTimes(ownToasts);
	});

	it('closes on Cancel without creating anything', async () => {
		const setIsModalOpen = vi.fn();
		render(<AddOrganizationRoleModal isModalOpen setIsModalOpen={setIsModalOpen} />);
		await click(screen.getByRole('button', { name: 'Cancel' }));
		expect(setIsModalOpen).toHaveBeenCalledWith(false);
		expect(mutate).not.toHaveBeenCalled();
	});
});
