/**
 * @vitest-environment jsdom
 */
import { EditRoleModal } from '@/features/instance/config/roles/modals/EditRoleModal';
import { InstanceDatabaseMap, LocalRole } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 Exercises the modal end to end: the visual editor and the JSON view share one draft, and Save
 sends preparePermissionForSave's exact permission payload through alter_role.
 */

const mocks = vi.hoisted(() => ({
	alterRoleMutate: vi.fn(),
	schema: {} as InstanceDatabaseMap,
	describeAllFails: false,
	registrationFails: false,
	selfRoleId: 'someone-elses-role',
}));

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
	useInstanceAuth: () => ({ user: { role: { id: mocks.selfRoleId } } }),
}));
vi.mock('@/integrations/api/instance/auth/alterRole', () => ({
	useAlterRole: () => ({ mutate: mocks.alterRoleMutate, isPending: false }),
}));
vi.mock('@/integrations/api/instance/auth/deleteRole', () => ({
	useDeleteRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/integrations/api/instance/database/getDescribeAll', () => ({
	getDescribeAllQueryOptions: () => ({
		queryKey: ['test', 'describe_all'],
		queryFn: () => {
			if (mocks.describeAllFails) {
				throw new Error('describe_all failed');
			}
			return mocks.schema;
		},
		retry: false,
	}),
}));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: () => ({
		queryKey: ['test', 'registration_info'],
		queryFn: () => {
			if (mocks.registrationFails) {
				throw new Error('registration_info failed');
			}
			return { version: '5.2.2' };
		},
		retry: false,
	}),
}));

const dogSchema = {
	data: {
		dog: {
			name: 'dog',
			schema: 'data',
			primary_key: 'id',
			attributes: [{ attribute: 'id', is_primary_key: true }, { attribute: 'name' }],
		},
	},
} as unknown as InstanceDatabaseMap;

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

beforeEach(() => {
	mocks.schema = dogSchema;
	mocks.describeAllFails = false;
	mocks.registrationFails = false;
	mocks.selfRoleId = 'someone-elses-role';
});

afterEach(() => {
	cleanup();
	mocks.alterRoleMutate.mockClear();
});

function roleData(permission: unknown, updatedTime = 0): LocalRole {
	return {
		id: 'role-1',
		role: 'test_role',
		permission: permission as LocalRole['permission'],
		__createdtime__: 0,
		__updatedtime__: updatedTime,
	};
}

function modal(data: LocalRole) {
	return (
		<EditRoleModal
			data={data}
			isModalOpen
			closeModal={() => {}}
			onSelectRole={() => {}}
			onChangesSaved={() => {}}
		/>
	);
}

function renderModal(permission: unknown) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const result = render(<QueryClientProvider client={queryClient}>{modal(roleData(permission))}</QueryClientProvider>);
	return {
		...result,
		rerenderWith: (data: LocalRole) =>
			result.rerender(<QueryClientProvider client={queryClient}>{modal(data)}</QueryClientProvider>),
	};
}

function save() {
	fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
	expect(mocks.alterRoleMutate).toHaveBeenCalledTimes(1);
	const [payload] = mocks.alterRoleMutate.mock.calls[0];
	expect(payload.id).toBe('role-1');
	return payload.permission as Record<string, unknown>;
}

function jsonEditor() {
	fireEvent.click(screen.getByRole('button', { name: 'Edit as JSON' }));
	return screen.getByRole('textbox', { name: 'Role permission JSON' }) as HTMLTextAreaElement;
}

const readOnlyDog = (attributePermissions: unknown, extra: object = {}) => ({
	tables: {
		dog: {
			read: true,
			insert: false,
			update: false,
			delete: false,
			attribute_permissions: attributePermissions,
			...extra,
		},
	},
});

describe('EditRoleModal visual editor', () => {
	it('opens on the visual editor and saves a table grant with an empty attribute_permissions array', async () => {
		// The shape AddRoleModal has always created before any table is granted.
		renderModal({ super_user: false, structure_user: false });

		fireEvent.click(await screen.findByRole('checkbox', { name: 'Read on data.dog' }));
		// A null here makes every `['*']` read the role sends 500 (#1299, HarperFast/harper#3143).
		expect(save()).toEqual({ super_user: false, structure_user: false, data: readOnlyDog([]) });
	});

	it('repairs a role already stored with null when it is saved again', async () => {
		renderModal({ super_user: false, data: readOnlyDog(null) });

		expect((await screen.findByRole('checkbox', { name: 'Read on data.dog' }) as HTMLInputElement).checked).toBe(
			true,
		);
		expect(save()).toEqual({ super_user: false, data: readOnlyDog([]) });
	});

	it('keeps content the GUI does not model through an edit', async () => {
		renderModal({ data: { describe: true, ...readOnlyDog([], { note: 'kept' }) }, gone: { tables: {} } });

		expect(await screen.findByText(/Also kept as they are/)).toBeTruthy();
		fireEvent.click(screen.getByRole('checkbox', { name: 'Insert on data.dog' }));
		const permission = save();
		expect(permission.data).toEqual({
			describe: true,
			tables: {
				dog: { read: true, insert: true, update: false, delete: false, attribute_permissions: [], note: 'kept' },
			},
		});
		// Not in the schema, but the GUI never deletes it on its own.
		expect(permission.gone).toEqual({ tables: {} });
	});

	it('removes databases and tables the schema lacks only when asked, since Harper rejects them', async () => {
		renderModal({ data: { tables: { dog: readOnlyDog([]).tables.dog, removed_table: {} } }, gone: { tables: {} } });

		expect(await screen.findByText(/table "data.removed_table", database "gone"/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Remove them' }));
		expect(save()).toEqual({ data: readOnlyDog([]) });
	});

	it('scopes a table to attributes and saves the per-attribute grants', async () => {
		renderModal({ data: readOnlyDog([]) });

		fireEvent.click(await screen.findByRole('button', { name: 'Attribute permissions for data.dog' }));
		fireEvent.click(screen.getByRole('switch', { name: 'Limit data.dog to specific attributes' }));
		fireEvent.click(screen.getByRole('checkbox', { name: 'Read on data.dog.name' }));
		expect(save()).toEqual({
			data: readOnlyDog([
				{ attribute_name: 'id', read: true, insert: false, update: false },
				{ attribute_name: 'name', read: false, insert: false, update: false },
			]),
		});
	});

	it('shares one draft between the visual editor and the JSON view', async () => {
		renderModal({ super_user: false });

		fireEvent.click(await screen.findByRole('checkbox', { name: 'Read on data.dog' }));
		const editor = jsonEditor();
		const document = JSON.parse(editor.value) as { data: { tables: { dog: { delete: boolean } } } };
		expect(document.data.tables.dog).toEqual(readOnlyDog([]).tables.dog);
		document.data.tables.dog.delete = true;
		fireEvent.change(editor, { target: { value: JSON.stringify(document, null, 2) } });

		fireEvent.click(screen.getByRole('button', { name: /Visual editor/ }));
		expect((screen.getByRole('checkbox', { name: 'Delete on data.dog' }) as HTMLInputElement).checked).toBe(true);
		expect(save()).toEqual({ super_user: false, data: { tables: { dog: { ...document.data.tables.dog } } } });
	});

	it('keeps the JSON view in charge, and says why, while the document is not representable', async () => {
		renderModal({ data: readOnlyDog([]) });

		await screen.findByRole('button', { name: 'Edit as JSON' });
		const editor = jsonEditor();
		fireEvent.change(editor, { target: { value: '{"data": ' } });
		expect(screen.getByText('The JSON is not a valid object.')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Visual editor/ }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByRole('button', { name: 'Save Changes' }).hasAttribute('disabled')).toBe(true);

		fireEvent.change(editor, { target: { value: '{"data": {"tables": {"dog": {"read": "yes"}}}}' } });
		expect(screen.getByText(/"data.dog": read, insert, update, delete must each be true or false/)).toBeTruthy();
		expect(screen.getByRole('button', { name: /Visual editor/ }).hasAttribute('disabled')).toBe(true);
	});

	it('opens a role the GUI cannot represent straight into the JSON view', async () => {
		renderModal({ data: { tables: { dog: { read: 1 } } } });

		expect(await screen.findByRole('textbox', { name: 'Role permission JSON' })).toBeTruthy();
		expect(screen.queryByRole('checkbox', { name: 'Read on data.dog' })).toBeNull();
	});

	it('hides per-table permissions for a structure user of every database and drops them on save', async () => {
		renderModal({ data: readOnlyDog([]) });

		fireEvent.click(await screen.findByRole('radio', { name: /All databases/ }));
		expect(screen.queryByRole('checkbox', { name: 'Read on data.dog' })).toBeNull();
		expect(screen.getByText(/Per-table permissions don't apply to this role/)).toBeTruthy();
		expect(save()).toEqual({ structure_user: true });
	});

	it('saves a super user role with nothing beside the flag', async () => {
		renderModal({ structure_user: ['data'], data: readOnlyDog([]) });

		fireEvent.click(await screen.findByRole('radio', { name: /Super user/ }));
		expect(screen.getByText(/Saving keeps only the/)).toBeTruthy();
		// validateNoSUPerms rejects super_user beside any other key, structure_user included.
		expect(save()).toEqual({ super_user: true });
	});

	it("is read-only on the editor's own role", async () => {
		mocks.selfRoleId = 'role-1';
		renderModal({ data: readOnlyDog([]) });

		const read = await screen.findByRole('checkbox', { name: 'Read on data.dog' });
		expect(read.hasAttribute('disabled')).toBe(true);
		expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
	});

	it('falls back to the JSON view, still saveable, when the schema does not load', async () => {
		mocks.describeAllFails = true;
		renderModal({ data: readOnlyDog([]) });

		expect(await screen.findByRole('button', { name: /Retry/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Visual editor/ })).toBeNull();
		expect(save()).toEqual({ data: readOnlyDog([]) });
	});

	it('without the instance version, will not save a malformed operations value it might drop', async () => {
		mocks.registrationFails = true;
		renderModal({ structure_user: true, operations: 'read_only' });

		expect(await screen.findByRole('button', { name: /Retry/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save Changes' }).hasAttribute('disabled')).toBe(true);
		cleanup();

		// A list of names is still saveable: preparePermissionForSave keeps it either way.
		renderModal({ structure_user: true, operations: ['read_only'] });
		await screen.findByRole('button', { name: /Retry/ });
		expect(save()).toEqual({ structure_user: true, operations: ['read_only'] });
	});

	it('warns when the role changes elsewhere while open, and can load that version', async () => {
		const { rerenderWith } = renderModal({ data: readOnlyDog([]) });
		fireEvent.click(await screen.findByRole('checkbox', { name: 'Insert on data.dog' }));

		// A list refetch with the same role must not touch the draft…
		rerenderWith(roleData({ data: readOnlyDog([]) }));
		expect(screen.queryByText(/changed somewhere else/)).toBeNull();
		expect((screen.getByRole('checkbox', { name: 'Insert on data.dog' }) as HTMLInputElement).checked).toBe(true);

		// …while a newer stored version blocks Save: alter_role would replace it wholesale.
		rerenderWith(roleData({ super_user: true }, 5));
		expect(screen.getByText(/changed somewhere else/)).toBeTruthy();
		const saveButton = screen.getByRole('button', { name: 'Save Changes' });
		expect(saveButton.hasAttribute('disabled')).toBe(true);
		fireEvent.click(saveButton);
		expect(mocks.alterRoleMutate).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('button', { name: 'Load the latest version' }));
		expect(screen.queryByText(/changed somewhere else/)).toBeNull();
		expect((screen.getByRole('radio', { name: /Super user/ }) as HTMLButtonElement).getAttribute('aria-checked')).toBe(
			'true',
		);
		expect(save()).toEqual({ super_user: true });
	});

	it('saves over a newer stored version only once the author chooses to keep theirs', async () => {
		const { rerenderWith } = renderModal({ data: readOnlyDog([]) });
		fireEvent.click(await screen.findByRole('checkbox', { name: 'Insert on data.dog' }));

		rerenderWith(roleData({ super_user: true }, 5));
		fireEvent.click(screen.getByRole('button', { name: 'Keep my changes' }));
		expect(screen.queryByText(/changed somewhere else/)).toBeNull();
		expect(save()).toEqual({
			data: { tables: { dog: { ...readOnlyDog([]).tables.dog, insert: true } } },
		});
	});
});

describe('EditRoleModal operations wiring', () => {
	it('writes picker changes into the JSON with operations at the top, and saves that payload', async () => {
		renderModal({});

		fireEvent.click(await screen.findByRole('checkbox', { name: 'Read on data.dog' }));
		fireEvent.click(screen.getByRole('switch', { name: 'Restrict operations' }));
		fireEvent.click(screen.getByRole('checkbox', { name: /^read_only/ }));

		const written = JSON.parse(jsonEditor().value) as Record<string, unknown>;
		expect(written.operations).toEqual(['read_only']);
		// The allowlist must sit above the table permissions, not below them.
		expect(Object.keys(written).indexOf('operations')).toBeLessThan(Object.keys(written).indexOf('data'));

		const permission = save();
		expect(permission.operations).toEqual(['read_only']);
		expect(permission.data).toEqual(readOnlyDog([]));
	});

	it('drops the allowlist when saving a super_user role, which Harper would otherwise reject', async () => {
		renderModal({ super_user: true, operations: ['read_only', 'deploy_component'] });

		// The switch reflects the existing restriction once registration info resolves…
		const restrictSwitch = await screen.findByRole('switch', { name: 'Restrict operations' });
		expect(restrictSwitch.getAttribute('aria-checked')).toBe('true');
		// …and the conflict is stated before the author saves.
		expect(screen.getByText(/does not accept an operations allowlist/)).toBeTruthy();

		// validateNoSUPerms rejects a multi-key permission with super_user: true.
		expect(save()).toEqual({ super_user: true });
	});

	it('keeps the allowlist when saving a structure_user role, which Harper accepts', async () => {
		renderModal({ structure_user: true, operations: ['read_only'] });

		await screen.findByRole('switch', { name: 'Restrict operations' });
		expect(save()).toEqual({ structure_user: true, operations: ['read_only'] });
	});

	it('states the instance-wide consequence for a record-shaped operations value', async () => {
		// cacheExpandedOperationsPerms guards on truthiness only, so this reaches expandOperationsPerms
		// and throws during the user-cache load, failing auth for every user on the instance.
		renderModal({ operations: { tables: {} } });

		expect(await screen.findByText(/authentication breaks for every user/)).toBeTruthy();
		// The old copy invited exactly the edit that keeps the instance broken.
		expect(screen.queryByText(/edit it in the JSON below/)).toBeNull();
		// The structured editor must stay out of the way so a click can't overwrite the record.
		expect(screen.queryByRole('switch', { name: 'Restrict operations' })).toBeNull();
		// …and Save must not normalize the value away, which would silently widen the role.
		expect(screen.getByRole('button', { name: 'Save Changes' }).hasAttribute('disabled')).toBe(true);
	});

	it('blocks Save while a string-shaped operations value would be normalized away', async () => {
		// preparePermissionForSave drops a non-array value, so saving an unrelated edit on this role
		// would remove a restriction Harper is currently enforcing.
		renderModal({ structure_user: true, operations: 'read_only' });

		expect(await screen.findByText(/value is not a list of operation names/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save Changes' }).hasAttribute('disabled')).toBe(true);
		expect(mocks.alterRoleMutate).not.toHaveBeenCalled();
	});
});
