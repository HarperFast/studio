/**
 * @vitest-environment jsdom
 */
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { LocalUser } from '@/integrations/api/api.patch';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dataTableColumns } from './tableDefinition';

afterEach(() => cleanup());

const CREATED = 1_700_000_000_000;

function user(username: string, role: string, createdOffset = 0): LocalUser {
	return {
		username,
		active: true,
		role: { id: `role-${role}`, role, permission: {}, __createdtime__: CREATED, __updatedtime__: CREATED },
		__createdtime__: CREATED + createdOffset,
		__updatedtime__: CREATED + createdOffset,
	};
}

function renderedUsernames() {
	return Array.from(document.querySelectorAll('tbody tr')).map((row) => row.querySelector('td')?.textContent);
}

/** As the Users page renders it, including its initial username sort. */
function renderUsers(users: LocalUser[]) {
	render(
		<SimpleBrowseDataTable
			columns={dataTableColumns}
			data={users}
			sortingState={[{ id: 'username', desc: false }]}
			filter={{ label: 'Filter users' }}
			paginated
		/>,
	);
}

async function typeFilter(text: string) {
	await act(async () => {
		fireEvent.change(screen.getByRole('searchbox', { name: 'Filter users' }), { target: { value: text } });
	});
}

describe('instance users table columns', () => {
	it('filters by username and role, but not by the active flag or the timestamps', async () => {
		renderUsers([user('admin', 'super_user'), user('reader', 'read_only'), user('etl-bot', 'writer')]);

		await typeFilter('READ');
		expect(renderedUsernames()).toEqual(['reader']);

		await typeFilter('writer');
		expect(renderedUsernames()).toEqual(['etl-bot']);

		// Every user is active and shares one timestamp prefix, so either would match the whole list.
		await typeFilter('true');
		expect(screen.getByText('No results.')).toBeTruthy();
		await typeFilter(String(CREATED).slice(0, 6));
		expect(screen.getByText('No results.')).toBeTruthy();
	});

	it('sorts by role, and by when the user was created', () => {
		renderUsers([
			user('carol', 'writer', 2_000),
			user('alice', 'super_user', 3_000),
			user('bob', 'read_only', 1_000),
		]);

		expect(renderedUsernames()).toEqual(['alice', 'bob', 'carol']);

		fireEvent.click(screen.getByRole('button', { name: 'Role' }));
		expect(renderedUsernames()).toEqual(['bob', 'alice', 'carol']);

		fireEvent.click(screen.getByRole('button', { name: 'Created' }));
		expect(renderedUsernames()).toEqual(['bob', 'carol', 'alice']);
	});
});
