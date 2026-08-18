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

	it('warns that assigning a role with a non-iterable operations value breaks instance-wide auth', () => {
		// expandOperationsPerms throws on a non-iterable during the user-cache load, rejecting
		// listUsers for every user — so silence here would understate it badly.
		render(<RoleOperationsSummary role={role({ operations: true } as unknown as LocalRole['permission'])} />);
		expect(screen.getByText(/breaks authentication for every user/)).toBeTruthy();
	});

	it('does not borrow the fatal wording for a value that merely fails validation', () => {
		// A mixed array expands cleanly, so nothing breaks at runtime — it is just rejected on save.
		const mixed = role({ operations: ['read_only', 42] } as unknown as LocalRole['permission']);
		render(<RoleOperationsSummary role={mixed} />);
		expect(screen.getByText(/Harper still gates on it/)).toBeTruthy();
		expect(screen.queryByText(/breaks authentication/)).toBeNull();
		// …and the remedy has to be actionable from a user form, which has no JSON editor.
		expect(screen.getByText(/in the role editor/)).toBeTruthy();
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
		const text = screen.getByText(/cannot run any Operations API call/).textContent ?? '';
		// The DDL carve-out has to qualify the sentence, not contradict it after a full stop.
		expect(text).not.toMatch(/cannot run any operation\./);
		expect(text).toContain('except that it is a structure user');
	});

	it('says the entries are inert rather than claiming the list is empty', () => {
		// A directly granted alias is listed but grants nothing, so "is empty" would contradict the JSON.
		render(<RoleOperationsSummary role={role({ operations: ['describe_database'] })} />);
		expect(screen.getByText(/Every entry in this role's operations allowlist is inert/)).toBeTruthy();
		expect(screen.queryByText(/allowlist is empty/)).toBeNull();
	});

	it('warns in destructive copy when the allowlist denies everything', () => {
		render(<RoleOperationsSummary role={role({ operations: [] })} />);
		expect(screen.getByText(/cannot run any Operations API call/)).toBeTruthy();
	});

	it('summarizes the effective expansion with a truncated preview and full title', () => {
		render(<RoleOperationsSummary role={role({ operations: ['read_only'] })} />);
		const summary = screen.getByText(/restricted to 12 operations/);
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
		expect(screen.getByText(/breaks authentication for every user/)).toBeTruthy();
		// Never describe the grants as live: Harper never gets far enough to honor them.
		expect(screen.queryByText(/still apply/)).toBeNull();
	});
});
