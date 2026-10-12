/**
 * @vitest-environment jsdom
 */
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { useListener } from '@/lib/events/listener';
import { WatchedValuesTypeMap } from '@/lib/storage/watchedValueKeys';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabasesTree } from './index';
import { createTableId } from './specialItems';

const route = vi.hoisted(() => ({
	params: {} as { databaseName?: string; tableName?: string },
	navigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1', instanceId: 'instance-1', ...route.params }),
	useNavigate: () => route.navigate,
}));

vi.mock('@/config/useInstanceClient', () => {
	const params = { entityId: 'instance-1', entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});

const permission = vi.hoisted(() => ({ canManage: true }));
vi.mock('@/hooks/usePermissions', () => ({
	useInstanceBrowseManagePermission: () => permission.canManage,
	useInstanceSchemaTablePermission: () => true,
	useInstanceImportDataPermission: () => true,
}));

const exportCsv = vi.hoisted(() => vi.fn());
vi.mock('@/features/instance/databases/hooks/useExportTableCsv', () => ({
	useExportTableCsv: () => ({ exportCsv }),
}));

const keyed = { primary_key: 'id', attributes: [{ attribute: 'id', is_primary_key: true }] };
const instanceDatabaseMap = {
	data: { cat: keyed, dog: keyed },
	solo: { only: keyed },
} as unknown as InstanceDatabaseMap;

type WatchedKey = keyof WatchedValuesTypeMap;
const fired = vi.fn<(key: WatchedKey, value: unknown) => void>();
const watchedKeys: WatchedKey[] = [
	'ShowCreateTable',
	'ShowDeleteDatabase',
	'ShowAddTableRecords',
	'ShowImportData',
	'ShowDeleteTable',
];

function WatchedValueSpy({ name }: { name: WatchedKey }) {
	useListener(name, (value) => fired(name, value), []);
	return null;
}

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
	sessionStorage.clear();
	route.params = {};
	route.navigate.mockReset();
	permission.canManage = true;
	fired.mockReset();
	exportCsv.mockReset();
});

function renderTree(params: typeof route.params = {}) {
	route.params = params;
	return render(
		<>
			{watchedKeys.map((name) => <WatchedValueSpy key={name} name={name} />)}
			<DatabasesTree instanceDatabaseMap={instanceDatabaseMap} />
		</>,
	);
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-rct-item-id="${id}"]`);
const treeItem = (id: string) => row(id)!.closest<HTMLElement>('[role="treeitem"]')!;
const chevron = (id: string) =>
	row(id)!.closest('[data-rct-item-container]')!.querySelector<HTMLElement>('.rct-tree-item-arrow')!;
const linkTo = (databaseName?: string, tableName?: string) => ({
	to: buildAbsoluteLinkToDatabasePage({
		organizationId: 'org-1',
		instanceId: 'instance-1',
		databaseName,
		tableName,
	}),
});

function rightClick(id: string, at = { clientX: 10, clientY: 10 }) {
	fireEvent.contextMenu(row(id)!, at);
}
const menuItems = () => screen.queryAllByRole('menuitem').map((item) => item.textContent);

describe('DatabasesTree navigation', () => {
	it('opens a table on a single click', () => {
		renderTree({ databaseName: 'data' });
		fireEvent.click(row('data/dog')!);
		expect(route.navigate).toHaveBeenCalledExactlyOnceWith(linkTo('data', 'dog'));
	});

	it('opens a database’s overview on a single click', () => {
		renderTree({ databaseName: 'data', tableName: 'dog' });
		fireEvent.click(row('solo')!);
		expect(route.navigate).toHaveBeenCalledExactlyOnceWith(linkTo('solo'));
	});

	it('does not navigate to the row that is already open', () => {
		renderTree({ databaseName: 'data', tableName: 'dog' });
		fireEvent.click(row('data/dog')!);
		expect(route.navigate).not.toHaveBeenCalled();
	});

	it('asks to create a table in the open database from the Create a Table row', () => {
		renderTree({ databaseName: 'solo' });
		fireEvent.click(row(createTableId)!);
		expect(fired).toHaveBeenCalledExactlyOnceWith('ShowCreateTable', { databaseName: 'solo' });
		expect(route.navigate).not.toHaveBeenCalled();
	});

	it('offers no Create a Table row to a role that cannot manage', () => {
		permission.canManage = false;
		renderTree();
		expect(row(createTableId)).toBeNull();
		expect(row('data')).not.toBeNull();
	});
});

describe('DatabasesTree expansion', () => {
	it('expands a database from its chevron without navigating', () => {
		renderTree({ databaseName: 'data' });
		expect(treeItem('solo').getAttribute('aria-expanded')).toBe('false');
		expect(row('solo/only')).toBeNull();

		fireEvent.click(chevron('solo'));

		expect(treeItem('solo').getAttribute('aria-expanded')).toBe('true');
		expect(row('solo/only')).not.toBeNull();
		expect(route.navigate).not.toHaveBeenCalled();
	});

	it('toggles the open database on a double-click without navigating again', () => {
		renderTree({ databaseName: 'data' });
		expect(treeItem('data').getAttribute('aria-expanded')).toBe('true');

		fireEvent.doubleClick(row('data')!);

		expect(treeItem('data').getAttribute('aria-expanded')).toBe('false');
		expect(row('data/dog')).toBeNull();
		expect(route.navigate).not.toHaveBeenCalled();
	});
});

describe('DatabasesTree context menus', () => {
	it('offers Create a Table and Drop Database on a database, each carrying the database', () => {
		renderTree({ databaseName: 'data' });
		rightClick('data');
		expect(menuItems()).toEqual(['Create a Table', 'Drop Database']);

		fireEvent.click(screen.getByRole('menuitem', { name: 'Drop Database' }));
		expect(fired).toHaveBeenCalledExactlyOnceWith('ShowDeleteDatabase', { databaseName: 'data' });

		rightClick('solo');
		fireEvent.click(screen.getByRole('menuitem', { name: 'Create a Table' }));
		expect(fired).toHaveBeenLastCalledWith('ShowCreateTable', { databaseName: 'solo' });
	});

	it('offers a table’s actions, each carrying that table', () => {
		renderTree({ databaseName: 'data' });
		const target = { databaseName: 'data', tableName: 'dog' };

		rightClick('data/dog');
		expect(menuItems()).toEqual(['Add New Record(s)', 'Import Data', 'Export CSV', 'Drop Table']);

		fireEvent.click(screen.getByRole('menuitem', { name: 'Add New Record(s)' }));
		expect(fired).toHaveBeenLastCalledWith('ShowAddTableRecords', target);
		rightClick('data/dog');
		fireEvent.click(screen.getByRole('menuitem', { name: 'Import Data' }));
		expect(fired).toHaveBeenLastCalledWith('ShowImportData', target);
		rightClick('data/dog');
		fireEvent.click(screen.getByRole('menuitem', { name: 'Drop Table' }));
		expect(fired).toHaveBeenLastCalledWith('ShowDeleteTable', target);
		rightClick('data/dog');
		fireEvent.click(screen.getByRole('menuitem', { name: 'Export CSV' }));
		expect(exportCsv).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ...target, primaryKey: 'id' }));

		expect(fired).toHaveBeenCalledTimes(3);
		expect(route.navigate).not.toHaveBeenCalled();
	});

	it('withholds Drop Table from the last table in its database', () => {
		renderTree({ databaseName: 'solo' });
		rightClick('solo/only');
		expect(menuItems()).toEqual(['Add New Record(s)', 'Import Data', 'Export CSV']);
	});

	it('opens no menu on the Create a Table row', () => {
		renderTree();
		rightClick(createTableId);
		expect(screen.queryByRole('menu')).toBeNull();
	});

	it('offers no database actions to a role that cannot manage', () => {
		permission.canManage = false;
		renderTree();
		rightClick('data');
		expect(menuItems()).toEqual([]);
	});

	it('re-anchors an open menu on a second right-click', () => {
		renderTree({ databaseName: 'data' });
		rightClick('data/dog', { clientX: 10, clientY: 10 });
		const first = screen.getByRole('menu');

		rightClick('data/dog', { clientX: 40, clientY: 90 });
		const second = screen.getByRole('menu');
		expect(second).not.toBe(first);
		expect(first.isConnected).toBe(false);

		rightClick('data/cat', { clientX: 40, clientY: 120 });
		fireEvent.click(screen.getByRole('menuitem', { name: 'Drop Table' }));
		expect(fired).toHaveBeenLastCalledWith('ShowDeleteTable', { databaseName: 'data', tableName: 'cat' });
	});
});
