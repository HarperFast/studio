/**
 * @vitest-environment jsdom
 */
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { SchemaOrganizationRole, SchemaUser } from '@/integrations/api/api.gen';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataTableColumns } from './tableDefinition';

vi.mock('@/features/organization/users/components/ResendInviteButton', () => ({
	ResendInviteButton: () => null,
}));

afterEach(() => cleanup());

function role(roleName: string): SchemaOrganizationRole {
	return { id: `role-${roleName}`, organizationId: 'org-1', roleName, userIds: [] };
}

function user(email: string, roleNames: string[], extra: Partial<SchemaUser> = {}): SchemaUser {
	return {
		id: `id-${email}`,
		email,
		firstname: email.split('@')[0],
		lastname: 'Example',
		status: 'ACTIVE',
		roles: roleNames.map(role),
		...extra,
	};
}

function renderedEmails() {
	return Array.from(document.querySelectorAll('tbody tr')).map((row) => row.querySelectorAll('td')[1]?.textContent);
}

function renderUsers(users: SchemaUser[]) {
	render(
		<SimpleBrowseDataTable columns={dataTableColumns} data={users} filter={{ label: 'Filter users' }} paginated />,
	);
}

async function typeFilter(text: string) {
	await act(async () => {
		fireEvent.change(screen.getByRole('searchbox', { name: 'Filter users' }), { target: { value: text } });
	});
}

describe('org users table columns', () => {
	it('filters by email, name, role and status, but not by the opaque user id', async () => {
		renderUsers([
			user('ada@example.com', ['admin']),
			user('bob@example.com', ['developer'], { firstname: 'Robert' }),
			user('cy@example.com', ['viewer'], { status: 'PENDING' }),
		]);

		await typeFilter('robert');
		expect(renderedEmails()).toEqual(['bob@example.com']);

		await typeFilter('Admin');
		expect(renderedEmails()).toEqual(['ada@example.com']);

		await typeFilter('pending');
		expect(renderedEmails()).toEqual(['cy@example.com']);

		// Every id is `id-<email>`, so an id match would return every row.
		await typeFilter('id-');
		expect(screen.getByText('No results.')).toBeTruthy();
	});

	it('sorts by the roles a user holds', () => {
		renderUsers([
			user('ada@example.com', ['viewer']),
			user('bob@example.com', ['developer', 'admin']),
			user('cy@example.com', ['billing']),
		]);

		fireEvent.click(screen.getByRole('button', { name: 'Roles' }));

		expect(renderedEmails()).toEqual(['bob@example.com', 'cy@example.com', 'ada@example.com']);
		expect(screen.getByText('admin, developer')).toBeTruthy();
	});

	it("lists a user's roles alphabetically without reordering the user's own roles", () => {
		const bob = user('bob@example.com', ['viewer', 'admin']);
		renderUsers([bob]);

		expect(screen.getByText('admin, viewer')).toBeTruthy();
		expect(bob.roles?.map((heldRole) => heldRole.roleName)).toEqual(['viewer', 'admin']);
	});
});
