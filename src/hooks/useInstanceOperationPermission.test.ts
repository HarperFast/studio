/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
	permission: undefined as Record<string, unknown> | undefined,
	version: undefined as string | undefined,
	versionFailed: false,
}));

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({ entityId: 'ins-1' }) }));
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: { role: { permission: session.permission } } }) }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: () => ({
		data: session.version ? { version: session.version } : undefined,
		isError: session.versionFailed,
	}),
}));

const { useInstanceOperationAccess, useInstanceOperationPermission } = await import('./useInstanceOperationPermission');

const can = (operation: string) => renderHook(() => useInstanceOperationAccess(operation)).result.current;
const readOnly = { super_user: false, operations: ['read_log'] };

describe('useInstanceOperationAccess', () => {
	beforeEach(() => {
		session.permission = readOnly;
		session.version = undefined;
		session.versionFailed = false;
	});

	it('reads the instance user and version for the current route', () => {
		session.version = '5.3.0';

		expect(can('read_log')).toBe(true);
		expect(can('get_component_file')).toBe(false);
	});

	it('lets a super user run anything, before the version is known', () => {
		session.permission = { super_user: true };

		expect(can('deploy_component')).toBe(true);
	});

	it("has no answer while the user or an allowlisted role's version is loading", () => {
		expect(can('read_log')).toBeUndefined();
		session.permission = undefined;
		session.version = '5.3.0';
		expect(can('read_log')).toBeUndefined();
	});

	it('denies, rather than waiting forever, when the version cannot be read', () => {
		session.versionFailed = true;

		expect(can('read_log')).toBe(false);
	});
});

describe('useInstanceOperationPermission', () => {
	it('reads an unknown answer as no, so it can gate a query directly', () => {
		session.permission = readOnly;
		session.version = undefined;
		session.versionFailed = false;

		expect(renderHook(() => useInstanceOperationPermission('read_log')).result.current).toBe(false);
	});
});
