/**
 * @vitest-environment jsdom
 */
import { RoleOperationsSummary } from '@/features/instance/config/roles/operations/RoleOperationsSummary';
import { LocalRole } from '@/integrations/api/api.patch';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The component reads the instance version to tell an allowlist from a pre-5.0 database record.
const { allowlistSupported } = vi.hoisted(() => ({ allowlistSupported: vi.fn<() => boolean | undefined>() }));
vi.mock('@/features/instance/config/roles/operations/useOperationsAllowlistSupported', () => ({
	useOperationsAllowlistSupported: () => allowlistSupported(),
}));

beforeEach(() => allowlistSupported.mockReturnValue(true));

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
		expect(screen.getByText(/create\/drop database — apply on any/)).toBeTruthy();
	});

	it('does not leave the absolute wording standing for a structure_user with an empty list', () => {
		render(<RoleOperationsSummary role={role({ structure_user: true, operations: [] })} />);
		const text = screen.getByText(/cannot run any operation/).textContent ?? '';
		// The DDL carve-out has to qualify the sentence, not contradict it after a full stop.
		expect(text).not.toMatch(/cannot run any operation\./);
		expect(text).toContain('except that it is a structure user');
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

	it('says nothing while the instance version is still loading', () => {
		// Collapsing "unknown" into "unsupported" would briefly describe a restricted role as
		// unrestricted — and is the shape that let a write path replace a real allowlist.
		allowlistSupported.mockReturnValue(undefined);
		const { container } = render(<RoleOperationsSummary role={role({ operations: ['read_only'] })} />);
		expect(container.textContent).toBe('');
	});

	it('treats a record under operations as a database below the allowlist floor', () => {
		allowlistSupported.mockReturnValue(false);
		const v4 = role({ operations: { tables: {} } } as unknown as LocalRole['permission']);
		expect(render(<RoleOperationsSummary role={v4} />).container.textContent).toBe('');

		// …and as an unmanageable collision once the instance reserves the key — described, never
		// presented as something to "fix", since replacing it breaks permission translation.
		cleanup();
		allowlistSupported.mockReturnValue(true);
		render(<RoleOperationsSummary role={v4} />);
		expect(screen.getByText(/Those table grants still apply/)).toBeTruthy();
		expect(screen.queryByText(/Fix it in the role editor/)).toBeNull();
	});
});
