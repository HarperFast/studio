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

vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', () => ({
	usePayloadBranchedDatabasesAvailable: () => mocks.payloadBranches.value,
}));
const { denied } = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock('@/hooks/useInstanceOperationPermission', () => ({
	useInstanceOperationPermission: (operation: string) => !denied.has(operation),
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

	it.each(
		[
			['canDownload', 'package_component'],
			['canEditFile', 'get_component_file'],
			['canEditFile', 'set_component_file'],
			['canRename', 'get_component_file'],
			['canRename', 'set_component_file'],
			['canRename', 'drop_component'],
			['canAddEntries', 'set_component_file'],
			['canAddTable', 'set_component_file'],
			['canDeleteEntry', 'drop_component'],
		] as const,
	)('withholds %s without %s', (action, operation) => {
		const app = { name: 'anvils', path: 'anvils', project: 'anvils', entries: [] };
		const entry = action === 'canDownload' || action === 'canDeleteEntry'
			? app
			: { name: 'schema.graphql', path: 'anvils/schema.graphql', project: 'anvils' };

		expect(renderHook(() => useEntryActions(entry)).result.current[action]).toBe(true);
		denied.add(operation);
		try {
			expect(renderHook(() => useEntryActions(entry)).result.current[action]).toBe(false);
		} finally {
			denied.clear();
		}
	});

	it('withholds redeploy without deploy_component', () => {
		const imported = packageRoot('git+https://git@github.com/acme/widgets.git#semver:v1.0.0');
		denied.add('deploy_component');
		try {
			expect(renderHook(() => useEntryActions(imported)).result.current.canRedeploy).toBe(false);
		} finally {
			denied.clear();
		}
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
