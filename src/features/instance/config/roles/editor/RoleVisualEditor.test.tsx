/**
 * @vitest-environment jsdom
 */
import { getTableEntry } from '@/features/instance/config/roles/editor/rolePermissionModel';
import { RoleVisualEditor } from '@/features/instance/config/roles/editor/RoleVisualEditor';
import { InstanceDatabaseMap, LocalRolePermission } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const schema = {
	data: {
		dog: {
			primary_key: 'id',
			attributes: [{ attribute: 'id' }, { attribute: 'name' }, { attribute: '__createdtime__' }],
		},
		cat: { primary_key: 'id', attributes: [{ attribute: 'id' }] },
	},
	dev: { thing: { primary_key: 'id', attributes: [{ attribute: 'id' }] } },
} as unknown as InstanceDatabaseMap;

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

/** Holds the document like the modal does, and exposes the latest one to the test. */
function renderEditor(initial: unknown, version = '5.3.1') {
	const latest = { current: initial as LocalRolePermission };
	function Harness() {
		const [permission, setPermission] = useState(latest.current);
		return (
			<RoleVisualEditor
				permission={permission}
				onChange={(next) => {
					latest.current = next;
					setPermission(next);
				}}
				instanceDatabaseMap={schema}
				version={version}
			/>
		);
	}
	render(<Harness />);
	return latest;
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const table = (read: boolean, attributes: unknown = [], rest: object = {}) => ({
	read,
	insert: false,
	update: false,
	delete: false,
	attribute_permissions: attributes,
	...rest,
});

describe('RoleVisualEditor', () => {
	it('shows a database-wide action as mixed and sets it on every table at once', () => {
		const latest = renderEditor({ data: { tables: { dog: table(true) } } });

		const allRead = checkbox('Read on every table in data');
		expect(allRead.checked).toBe(false);
		expect(allRead.indeterminate).toBe(true);
		fireEvent.click(allRead);
		expect(latest.current).toEqual({ data: { tables: { dog: table(true), cat: table(true) } } });
		fireEvent.click(checkbox('Read on every table in data'));
		expect(latest.current).toEqual({ data: { tables: { dog: table(false), cat: table(false) } } });
	});

	it("shows a scoped table's effective attribute access, including a derived primary key", () => {
		renderEditor({
			data: {
				tables: {
					dog: table(true, [
						{ attribute_name: 'name', read: true, insert: false, update: false },
						{ attribute_name: '__createdtime__', read: false, insert: true, update: true },
					]),
				},
			},
		});

		fireEvent.click(screen.getByRole('button', { name: 'Attribute permissions for data.dog' }));
		expect(checkbox('Read on data.dog.id').checked).toBe(true);
		expect(screen.getByText(/isn't listed, so it gets whatever access any other attribute has/)).toBeTruthy();
		// A timestamp only ever gets read; its stored insert does not show as granted.
		expect(checkbox('Insert on data.dog.__createdtime__').checked).toBe(false);
		expect(checkbox('Insert on data.dog.__createdtime__').disabled).toBe(true);
		// The attributes-column summary counts attributes with any access.
		expect(screen.getByRole('button', { name: 'Attribute permissions for data.dog' }).textContent).toContain('2 of 3');
	});

	it('grants the table action when an attribute is given it, and restores a list switched off and on', () => {
		const latest = renderEditor({ data: { tables: { dog: table(true) } } });

		fireEvent.click(screen.getByRole('button', { name: 'Attribute permissions for data.dog' }));
		fireEvent.click(screen.getByRole('switch', { name: 'Limit data.dog to specific attributes' }));
		fireEvent.click(checkbox('Update on data.dog.name'));
		const dog = () => getTableEntry(latest.current, 'data', 'dog');
		expect(dog()?.update).toBe(true);
		const scoped = dog()?.attribute_permissions;

		fireEvent.click(screen.getByRole('switch', { name: 'Limit data.dog to specific attributes' }));
		expect(dog()?.attribute_permissions).toEqual([]);
		fireEvent.click(screen.getByRole('switch', { name: 'Limit data.dog to specific attributes' }));
		expect(dog()?.attribute_permissions).toEqual(scoped);
	});

	it('does not restore attribute grants the table no longer has', () => {
		const latest = renderEditor({ data: { tables: { dog: table(true) } } });

		fireEvent.click(screen.getByRole('button', { name: 'Attribute permissions for data.dog' }));
		const limit = () => screen.getByRole('switch', { name: 'Limit data.dog to specific attributes' });
		fireEvent.click(limit());
		fireEvent.click(limit());
		fireEvent.click(checkbox('Read on data.dog'));
		fireEvent.click(limit());
		// Role validation rejects an attribute granting what its table does not (MISMATCHED_TABLE_ATTR_PERMS).
		const attributes = getTableEntry(latest.current, 'data', 'dog')?.attribute_permissions ?? [];
		expect(attributes.length).toBeGreaterThan(0);
		expect(attributes.every((attribute) => attribute.read === false)).toBe(true);
	});

	it('scopes structure_user to selected databases and hides their table grid', () => {
		const latest = renderEditor({ data: { tables: {} } });

		fireEvent.click(screen.getByRole('radio', { name: /Selected databases/ }));
		fireEvent.click(checkbox('Structure user on data'));
		expect(latest.current.structure_user).toEqual(['data']);
		expect(screen.getByText('full access (structure user)')).toBeTruthy();
		expect(screen.queryByRole('checkbox', { name: 'Read on data.dog' })).toBeNull();
	});

	it('offers the cluster user type on Harper 4, and to a role that already has it', () => {
		renderEditor({}, '4.7.40');
		// Harper 4 stores such a user's password reversibly encrypted (harperdb security/user.ts).
		expect(screen.getByRole('radio', { name: /Cluster user.*list every database.*recoverable form/ })).toBeTruthy();
		cleanup();
		renderEditor({ cluster_user: true });
		const radio = screen.getByRole('radio', { name: /Cluster user.*Harper 5 doesn't use this role type/ });
		expect(radio.getAttribute('aria-checked')).toBe('true');
	});

	it.each(['5.0.0-alpha.8', 'not-a-version'])('does not offer the cluster user type to a new role on %s', (version) => {
		renderEditor({}, version);
		expect(screen.queryByRole('radio', { name: /Cluster user/ })).toBeNull();
	});

	it('says before limiting a table that the list may leave out computed and relationship attributes', () => {
		renderEditor({ data: { tables: { dog: table(true) } } });

		fireEvent.click(screen.getByRole('button', { name: 'Attribute permissions for data.dog' }));
		expect(screen.getByRole('switch', { name: 'Limit data.dog to specific attributes' }).getAttribute('aria-checked'))
			.toBe('false');
		expect(screen.getByText(/can leave out computed and relationship attributes/)).toBeTruthy();
	});

	it('opens only one database on a role that grants several, so a large schema stays cheap to open', () => {
		renderEditor({ data: { tables: { dog: table(true) } }, dev: { tables: { thing: table(true) } } });

		expect(screen.getByRole('checkbox', { name: 'Read on data.dog' })).toBeTruthy();
		expect(screen.queryByRole('checkbox', { name: 'Read on dev.thing' })).toBeNull();
	});
});
