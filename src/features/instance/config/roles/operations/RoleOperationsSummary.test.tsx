/**
 * @vitest-environment jsdom
 */
import { RoleOperationsSummary } from '@/features/instance/config/roles/operations/RoleOperationsSummary';
import type { AllowlistVersion } from '@/features/instance/config/roles/operations/useOperationsAllowlistSupported';
import { LocalRole } from '@/integrations/api/api.patch';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The component reads the instance version to tell an allowlist from a pre-5.0 database record.
const { allowlistVersion } = vi.hoisted(() => ({ allowlistVersion: vi.fn<() => AllowlistVersion | undefined>() }));
vi.mock('@/features/instance/config/roles/operations/useOperationsAllowlistSupported', () => ({
	useAllowlistVersion: () => allowlistVersion(),
}));

const ON_5_3: AllowlistVersion = { supported: true, band: '5.3' };
const BEFORE_5_3: AllowlistVersion = { supported: true, band: 'pre-5.3' };

beforeEach(() => allowlistVersion.mockReturnValue(ON_5_3));

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
		allowlistVersion.mockReturnValue(BEFORE_5_3);
		render(<RoleOperationsSummary role={role({ structure_user: true, operations: ['read_only'] })} />);
		expect(screen.getByText(/create\/drop database — apply on any/)).toBeTruthy();
	});

	it('does not leave the absolute wording standing for a structure_user with an empty list', () => {
		allowlistVersion.mockReturnValue(BEFORE_5_3);
		render(<RoleOperationsSummary role={role({ structure_user: true, operations: [] })} />);
		const text = screen.getByText(/cannot run any Operations API call/).textContent ?? '';
		// The DDL carve-out has to qualify the sentence, not contradict it after a full stop.
		expect(text).not.toMatch(/cannot run any operation\./);
		expect(text).toContain('except that it is a structure user');
	});

	it('claims no DDL carve-out where the list runs ahead of structure_user', () => {
		// 5.3.0-alpha.1 on: Harper checks the allowlist before the structure-user returns.
		for (const band of ['5.3-early', '5.3'] as const) {
			allowlistVersion.mockReturnValue({ supported: true, band });
			render(<RoleOperationsSummary role={role({ structure_user: true, operations: ['read_only'] })} />);
			const text = screen.getByText(/restricted to 13 operations/).textContent ?? '';
			expect(text, band).toContain('its structure-user DDL needs listing too');
			expect(text, band).not.toContain('regardless of the list');
			cleanup();

			render(<RoleOperationsSummary role={role({ structure_user: true, operations: [] })} />);
			const empty = screen.getByText(/cannot run any Operations API call/).textContent ?? '';
			expect(empty, band).toContain('not even SQL or its structure-user DDL.');
			expect(empty, band).not.toContain('except that it is a structure user');
			expect(empty, band).not.toContain('SQL is authorized by table permissions');
			cleanup();
		}
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
		// read_only's sql member counts once the list gates SQL; before 5.3 it does not.
		const summary = screen.getByText(/restricted to 13 operations/);
		// Five names shown inline, the full list on the title.
		expect(summary.textContent).toContain(', …');
		expect(summary.getAttribute('title')).toContain('user_info');
		expect(summary.getAttribute('title')).toContain('sql');

		cleanup();
		allowlistVersion.mockReturnValue(BEFORE_5_3);
		render(<RoleOperationsSummary role={role({ operations: ['read_only'] })} />);
		expect(screen.getByText(/restricted to 12 operations/).getAttribute('title')).not.toContain('sql');
	});

	it('says an empty list leaves SQL to table permissions before 5.3 only', () => {
		allowlistVersion.mockReturnValue(BEFORE_5_3);
		render(<RoleOperationsSummary role={role({ operations: [] })} />);
		expect(screen.getByText(/SQL is authorized by table permissions instead/)).toBeTruthy();

		cleanup();
		allowlistVersion.mockReturnValue(ON_5_3);
		render(<RoleOperationsSummary role={role({ operations: [] })} />);
		expect(screen.getByText(/cannot run any Operations API call, not even SQL\./)).toBeTruthy();
	});

	it('counts a deploy-only CI role by what its instance version grants', () => {
		const deployRole = role({ operations: ['deploy_component', 'get_job'] });
		render(<RoleOperationsSummary role={deployRole} />);
		expect(screen.getByText(/restricted to 2 operations/)).toBeTruthy();

		cleanup();
		allowlistVersion.mockReturnValue({ supported: true, band: 'pre-5.3' });
		render(<RoleOperationsSummary role={deployRole} />);
		// Before 5.3 the gate cannot match deploy_component, so only get_job is reachable.
		expect(screen.getByText(/restricted to 1 operation/)).toBeTruthy();
	});

	it('says nothing while the instance version is still loading', () => {
		// Collapsing "unknown" into "unsupported" would briefly describe a restricted role as
		// unrestricted — and is the shape that let a write path replace a real allowlist.
		allowlistVersion.mockReturnValue(undefined);
		const { container } = render(<RoleOperationsSummary role={role({ operations: ['read_only'] })} />);
		expect(container.textContent).toBe('');
	});

	it('treats a record under operations as a database below the allowlist floor', () => {
		allowlistVersion.mockReturnValue({ supported: false, band: 'pre-5.3' });
		const v4 = role({ operations: { tables: {} } } as unknown as LocalRole['permission']);
		expect(render(<RoleOperationsSummary role={v4} />).container.textContent).toBe('');

		// …and as an unmanageable collision once the instance reserves the key — described, never
		// presented as something to "fix", since replacing it breaks permission translation.
		cleanup();
		allowlistVersion.mockReturnValue(ON_5_3);
		render(<RoleOperationsSummary role={v4} />);
		expect(screen.getByText(/breaks authentication for every user/)).toBeTruthy();
		// Never describe the grants as live: Harper never gets far enough to honor them.
		expect(screen.queryByText(/still apply/)).toBeNull();
	});
});
