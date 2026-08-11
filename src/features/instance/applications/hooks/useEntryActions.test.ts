/** @vitest-environment jsdom */
/**
 * The sidebar context menu calls `useEntryActions(target?.entry)` for a row it deliberately does
 * NOT open (FileTreeContextMenu remembers the right-clicked row without setting `openedEntry`).
 * These assert the capability flags follow that argument, so protection cannot be read off a
 * different entry than the one being acted on.
 */
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/usePermissions', () => ({ useInstanceBrowseManagePermission: () => true }));

import { useEntryActions } from './useEntryActions';

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
});
