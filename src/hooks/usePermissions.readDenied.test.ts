/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ permission: undefined as Record<string, unknown> | undefined }));

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ instanceId: 'ins-1' }) }));
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/hooks/useAuth')>()),
	useInstanceAuth: () => ({ user: session.permission && { role: { permission: session.permission } } }),
}));

const { useInstanceSchemaTableReadDenied } = await import('./usePermissions');

const denied = () => renderHook(() => useInstanceSchemaTableReadDenied(undefined, 'data', 'dog')).result.current;

describe('useInstanceSchemaTableReadDenied', () => {
	it('denies a known user without read on the table, such as a read-only Fabric Connect token', () => {
		session.permission = { super_user: false, operations: ['describe_table'] };

		expect(denied()).toBe(true);
	});

	it('does not deny a user who may read the table', () => {
		session.permission = { super_user: false, data: { tables: { dog: { read: true } } } };

		expect(denied()).toBe(false);
	});

	it('does not deny while the user is unknown', () => {
		session.permission = undefined;

		expect(denied()).toBe(false);
	});
});
