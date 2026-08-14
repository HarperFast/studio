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
	it('renders nothing for unrestricted roles, missing roles, and malformed allowlists', () => {
		expect(render(<RoleOperationsSummary role={undefined} />).container.textContent).toBe('');
		cleanup();
		expect(render(<RoleOperationsSummary role={role({})} />).container.textContent).toBe('');
		cleanup();
		const malformed = role({ operations: true } as unknown as LocalRole['permission']);
		expect(render(<RoleOperationsSummary role={malformed} />).container.textContent).toBe('');
	});

	it('warns in destructive copy when the allowlist denies everything', () => {
		render(<RoleOperationsSummary role={role({ operations: [] })} />);
		expect(screen.getByText(/cannot run any operation/)).toBeTruthy();
	});

	it('summarizes the effective expansion with a truncated preview and full title', () => {
		render(<RoleOperationsSummary role={role({ operations: ['read_only'] })} />);
		const summary = screen.getByText(/restricted to 15 operations/);
		// Five names shown inline, the full list on the title.
		expect(summary.textContent).toContain(', …');
		expect(summary.getAttribute('title')).toContain('user_info');
	});
});
