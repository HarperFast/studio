/**
 * @vitest-environment jsdom
 */
import { ImportDataModal } from '@/features/instance/databases/modals/ImportDataModal';
import { LocalRolePermission } from '@/integrations/api/api.patch';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Only the auth store and the router are stubbed, so these assertions run the real
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

function renderModal(rolePermission?: Record<string, unknown>) {
	permission.current = rolePermission as unknown as LocalRolePermission | undefined;
	render(
		<ImportDataModal
			isModalOpen
			setIsModalOpen={() => undefined}
			instanceDatabaseMap={{ data: { dog: {} } } as never}
			databaseName="data"
			tableName="dog"
			onImported={() => undefined}
		/>,
	);
}

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

	// An insert-only role can post records (sample/random, .json upload) but cannot run either CSV
	// load, so the URL method -- which has no non-CSV path -- must not be offered.
	it('drops the URL method for an insert-only role', () => {
		renderModal({ operations: ['insert'], data: { tables: { dog: tableGrant() } } });
		expect(methodNames()).toEqual(['import-method-sample', 'import-method-file']);
	});

	// The mirror image: a URL-load role cannot insert records, so only the URL method survives.
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
