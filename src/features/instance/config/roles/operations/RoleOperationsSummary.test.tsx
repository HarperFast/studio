/**
 * @vitest-environment jsdom
 */
import { RoleOperationsSummary } from '@/features/instance/config/roles/operations/RoleOperationsSummary';
import { LocalRole } from '@/integrations/api/api.patch';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => cleanup());

function role(permission: LocalRole['permission']): LocalRole {
	return { id: 'r1', role: 'r', permission, __createdtime__: 0, __updatedtime__: 0 };
}

describe('RoleOperationsSummary', () => {
	it('renders nothing for unrestricted and missing roles', () => {
		expect(render(<RoleOperationsSummary role={undefined} />).container.textContent).toBe('');
		cleanup();
		expect(render(<RoleOperationsSummary role={role({})} />).container.textContent).toBe('');
	});

	it('flags a malformed allowlist instead of reading as unrestricted', () => {
		// Harper treats any present `operations` as active, so silence here would understate the role.
		render(<RoleOperationsSummary role={role({ operations: true } as unknown as LocalRole['permission'])} />);
		expect(screen.getByText(/not a list of operation names/)).toBeTruthy();
	});

	it('flags the super_user/cluster_user combination Harper refuses to store', () => {
		render(<RoleOperationsSummary role={role({ super_user: true, operations: ['read_only'] })} />);
		expect(screen.getByText(/cannot be saved/)).toBeTruthy();
	});

	it('notes the DDL carve-out for a structure_user role instead of calling the list inert', () => {
		render(<RoleOperationsSummary role={role({ structure_user: true, operations: ['read_only'] })} />);
		expect(screen.getByText(/DDL operations apply regardless/)).toBeTruthy();
	});

	it('warns in destructive copy when the allowlist denies everything', () => {
		render(<RoleOperationsSummary role={role({ operations: [] })} />);
		expect(screen.getByText(/cannot run any operation/)).toBeTruthy();
	});

	it('summarizes the effective expansion with a truncated preview and full title', () => {
		render(<RoleOperationsSummary role={role({ operations: ['read_only'] })} />);
		const summary = screen.getByText(/restricted to 13 operations/);
		// Five names shown inline, the full list on the title.
		expect(summary.textContent).toContain(', …');
		expect(summary.getAttribute('title')).toContain('user_info');
	});
});
