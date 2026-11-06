/** @vitest-environment jsdom */
/**
 * The sidebar context menu calls `useEntryActions(target?.entry)` for a row it deliberately does
 * NOT open (FileTreeContextMenu remembers the right-clicked row without setting `openedEntry`).
 * These assert the capability flags follow that argument, so protection cannot be read off a
 * different entry than the one being acted on.
 */
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ payloadBranches: { value: false } }));

vi.mock('@/hooks/usePermissions', () => ({ useInstanceBrowseManagePermission: () => true }));
vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', () => ({
	usePayloadBranchedDatabasesAvailable: () => mocks.payloadBranches.value,
}));

import { useEntryActions } from './useEntryActions';

afterEach(() => {
	mocks.payloadBranches.value = false;
});

function packageRoot(packageSpec: string | undefined): DirectoryEntry {
	return { name: 'status-check', path: 'status-check', project: 'status-check', package: packageSpec, entries: [] };
}

describe('useEntryActions', () => {
	it('refuses delete and redeploy for a protected package', () => {
		const { result } = renderHook(() => useEntryActions(packageRoot('@harperdb/akamai-status@1.0.0')));

		expect(result.current.canDeleteEntry).toBe(false);
		expect(result.current.canRedeploy).toBe(false);
	});

	it('still allows delete and redeploy for an ordinary imported package', () => {
		const { result } = renderHook(() =>
			useEntryActions(packageRoot('git+https://git@github.com/acme/widgets.git#semver:v1.0.0'))
		);

		expect(result.current.canDeleteEntry).toBe(true);
		expect(result.current.canRedeploy).toBe(true);
	});

	it('allows delete for a plain application directory', () => {
		const { result } = renderHook(() =>
			useEntryActions({ name: 'anvils', path: 'anvils', project: 'anvils', entries: [] })
		);

		expect(result.current.canDeleteEntry).toBe(true);
	});

	it('refuses delete when there is no entry', () => {
		const { result } = renderHook(() => useEntryActions(undefined));

		expect(result.current.canDeleteEntry).toBe(false);
	});
});

describe('canChangePrivateCopy', () => {
	const appRoot: DirectoryEntry = { name: 'anvils', path: 'anvils', project: 'anvils', entries: [] };

	it('is offered on the root of an application that is not package-deployed, where a payload deploy carries it', () => {
		mocks.payloadBranches.value = true;
		expect(renderHook(() => useEntryActions(appRoot)).result.current.canChangePrivateCopy).toBe(true);
	});

	it('is not offered on a package, a directory inside an application, or before Harper supports it', () => {
		mocks.payloadBranches.value = true;
		expect(renderHook(() => useEntryActions(packageRoot('npm:status-check'))).result.current.canChangePrivateCopy)
			.toBe(false);
		expect(
			renderHook(() => useEntryActions({ ...appRoot, name: 'resources', path: 'anvils/resources' })).result.current
				.canChangePrivateCopy,
		).toBe(false);
		mocks.payloadBranches.value = false;
		expect(renderHook(() => useEntryActions(appRoot)).result.current.canChangePrivateCopy).toBe(false);
	});
});
