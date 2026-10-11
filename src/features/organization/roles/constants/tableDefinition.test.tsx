/**
 * @vitest-environment jsdom
 */
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dataTableColumns } from './tableDefinition';

afterEach(() => cleanup());

function role(id: string, roleName: string, userCount: number): SchemaOrganizationRole {
	return {
		id,
		organizationId: 'org-1',
		roleName,
		userIds: Array.from({ length: userCount }, (_, index) => `user-${index}`),
	};
}

function renderedRoleNames() {
	return Array.from(document.querySelectorAll('tbody tr')).map((row) => row.querySelector('td')?.textContent);
}

function renderRoles(roles: SchemaOrganizationRole[]) {
	render(
		<SimpleBrowseDataTable columns={dataTableColumns} data={roles} filter={{ label: 'Filter roles' }} paginated />,
	);
}

async function typeFilter(text: string) {
	await act(async () => {
		fireEvent.change(screen.getByRole('searchbox', { name: 'Filter roles' }), { target: { value: text } });
	});
}

describe('org roles table columns', () => {
	it('filters by role name, not by id or user count', async () => {
		renderRoles([role('ab12', 'Admin', 1), role('cd34', 'Developer', 12), role('ef56', 'Viewer', 0)]);

		await typeFilter('dev');
		expect(renderedRoleNames()).toEqual(['Developer']);

		await typeFilter('ab12');
		expect(screen.getByText('No results.')).toBeTruthy();

		await typeFilter('12');
		expect(screen.getByText('No results.')).toBeTruthy();
	});

	it('sorts by how many users hold the role, showing a role nobody holds as unassigned', () => {
		renderRoles([role('a', 'Admin', 2), role('b', 'Developer', 12), role('c', 'Viewer', 0)]);

		fireEvent.click(screen.getByRole('button', { name: 'Users Assigned' }));

		expect(renderedRoleNames()).toEqual(['Viewer', 'Admin', 'Developer']);
		expect(screen.getByText('No users assigned')).toBeTruthy();
	});

	it('sorts by role name', () => {
		renderRoles([role('a', 'viewer', 0), role('b', 'Admin', 0), role('c', 'developer', 0)]);

		fireEvent.click(screen.getByRole('button', { name: 'Role Name' }));

		expect(renderedRoleNames()).toEqual(['Admin', 'developer', 'viewer']);
	});
});
