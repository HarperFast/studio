/**
 * @vitest-environment jsdom
 */
import { ImportDataModal } from '@/features/instance/databases/modals/ImportDataModal';
import { LocalRolePermission } from '@/integrations/api/api.patch';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Only the auth store and the router are stubbed, so these run the real
// allowlist -> checkImportMethodAllowed -> rendered-radio chain.
const permission = vi.hoisted(() => ({ current: undefined as LocalRolePermission | undefined }));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ instanceId: 'instance-1' }),
}));

vi.mock('@/hooks/useAuth', () => ({
	useInstanceAuth: () => ({ user: { role: { permission: permission.current } } }),
	isAdminMode: () => false,
	useCloudAuth: () => ({ user: null }),
}));

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'entity-1', entityType: 'instance' }),
}));

vi.mock('@/integrations/api/instance/database/importData', () => ({
	useImportDataMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), loading: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

// A 5.x instance; the version gate itself is covered in checkOperationPermission.test.ts.
vi.mock('@/features/instance/config/roles/operations/useOperationsAllowlistSupported', () => ({
	useOperationsAllowlistSupported: () => true,
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
	permission.current = undefined;
});

const withColumn = {
	data: { dog: { attributes: [{ attribute: 'id', is_primary_key: true }, { attribute: 'name', type: 'String' }] } },
};

function renderModal(rolePermission?: Record<string, unknown>, initialMethod?: 'sample' | 'file' | 'url') {
	permission.current = rolePermission as unknown as LocalRolePermission | undefined;
	render(
		<ImportDataModal
			isModalOpen
			setIsModalOpen={() => undefined}
			instanceDatabaseMap={withColumn as never}
			databaseName="data"
			tableName="dog"
			initialMethod={initialMethod}
			onImported={() => undefined}
		/>,
	);
}

const selectedMethod = () =>
	screen.getAllByRole('radio').find((radio) => radio.getAttribute('data-state') === 'checked')
		?.getAttribute('id');

const methodNames = () => screen.getAllByRole('radio').map((radio) => radio.getAttribute('id'));

describe('ImportDataModal method gating', () => {
	it('offers every method to an unrestricted role', () => {
		renderModal({ super_user: true });
		expect(methodNames()).toEqual([
			'import-method-sample',
			'import-method-file',
			'import-method-url',
		]);
	});

	// The URL method has no non-CSV path, so an insert-only role cannot use it at all.
	it('drops the URL method for an insert-only role', () => {
		renderModal({ operations: ['insert'], data: { tables: { dog: tableGrant() } } });
		expect(methodNames()).toEqual(['import-method-sample', 'import-method-file']);
	});

	it('keeps only the URL method for a csv_url_load role', () => {
		renderModal({ operations: ['csv_url_load', 'get_job'], data: { tables: { dog: tableGrant() } } });
		expect(methodNames()).toEqual(['import-method-url']);
	});

	it('selects an allowed method by default rather than the contextual preference', () => {
		// A table is in context, so `file` is preferred -- but this role can only load from a URL.
		renderModal({ operations: ['csv_url_load', 'get_job'], data: { tables: { dog: tableGrant() } } });
		expect((screen.getByRole('radio', { checked: true }) as HTMLElement).getAttribute('id')).toBe(
			'import-method-url',
		);
	});
});

function tableGrant() {
	return { read: true, insert: true, update: false, delete: false, attribute_permissions: null };
}

// The empty-table state's two cards launch this modal on a method each; without that preselection
// they would both land on the same contextual default and stop being two different invitations.
describe('ImportDataModal requested method', () => {
	it('opens on the method the launcher asked for, over the contextual default', () => {
		renderModal({ super_user: true }, 'sample');
		expect(selectedMethod()).toBe('import-method-sample');
	});

	it('still falls back to the contextual default when no method was asked for', () => {
		renderModal({ super_user: true });
		expect(selectedMethod()).toBe('import-method-file');
	});

	// The launcher gates its cards on permissions, but the modal must not seat a method this role
	// cannot run even if something asks for one.
	it('ignores a requested method the role cannot run', () => {
		renderModal({ operations: ['csv_url_load', 'get_job'], data: { tables: { dog: tableGrant() } } }, 'sample');
		expect(selectedMethod()).toBe('import-method-url');
	});
});

describe('ImportDataModal name fields', () => {
	it('stops the database and table names at the lengths the form accepts', () => {
		renderModal({ super_user: true });

		expect((screen.getByLabelText('Database') as HTMLInputElement).maxLength).toBe(75);
		expect((screen.getByLabelText('Table') as HTMLInputElement).maxLength).toBe(250);
	});
});
