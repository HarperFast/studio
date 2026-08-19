/**
 * @vitest-environment jsdom
 */
/**
 * The delete modal is the mutation point every delete path funnels through — including the global
 * Cmd+Delete shortcut, which sets no capability flag. These assert the modal itself refuses a
 * selection containing a protected component (running the real `isProtectedPath`), so the guard
 * survives a capability check being bypassed upstream.
 */
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const rootEntries: DirectoryEntry[] = [
	{
		name: 'status-check',
		path: 'status-check',
		project: 'status-check',
		package: '@harperdb/akamai-status@1.0.0',
		entries: [],
	},
	{ name: 'anvils', path: 'anvils', project: 'anvils', entries: [] },
];

let openedEntry: DirectoryEntry | FileEntry | undefined;
let selectedItems: string[] = [];

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'test-instance', entityType: 'instance' }),
}));

vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({
		openedEntry,
		rootEntries,
		selectedItems,
		reloadRootEntries: vi.fn(),
		setFocusedItem: vi.fn(),
		setSelectedItems: vi.fn(),
	}),
}));

vi.mock('@/lib/events/watcher', () => ({
	useWatchedValue: () => ({ value: true, trigger: undefined }),
	setWatchedValue: vi.fn(),
}));

vi.mock('@/lib/attemptToRestoreFocus', () => ({ attemptToRestoreFocus: vi.fn() }));
vi.mock('@/integrations/api/instance/applications/dropComponent', () => ({ dropComponent: vi.fn() }));
vi.mock('@/react-query/queryClient', () => ({ errorHandler: vi.fn() }));

const { toast, deleteSelectedItems } = vi.hoisted(() => ({
	toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
	deleteSelectedItems: vi.fn(async () => ({ lastSplit: [] as string[] })),
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/features/instance/applications/lib/deleteSelectedItems', () => ({ deleteSelectedItems }));

import { DeleteDirectoryOrFileModal } from './DeleteDirectoryOrFileModal';

// Radix dialogs rely on a couple of DOM APIs jsdom doesn't implement.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

// Cancel, the destructive action, and Radix's own "X" close button all render; target the action
// by its accessible name so neither Cancel nor the close button is clicked by position.
function confirmDelete(name: RegExp) {
	fireEvent.click(screen.getByRole('button', { name }));
}

describe('DeleteDirectoryOrFileModal', () => {
	it('refuses to delete a selection containing a protected component', async () => {
		openedEntry = rootEntries[0];
		selectedItems = ['status-check', 'status-check/resources.js'];
		render(<DeleteDirectoryOrFileModal />);

		confirmDelete(/Remove items/i);

		await waitFor(() => expect(toast.error).toHaveBeenCalled());
		expect(deleteSelectedItems).not.toHaveBeenCalled();
	});

	it('deletes an ordinary selection with no protected component', async () => {
		openedEntry = rootEntries[1];
		selectedItems = ['anvils/index.js'];
		render(<DeleteDirectoryOrFileModal />);

		confirmDelete(/Delete Application/i);

		await waitFor(() => expect(deleteSelectedItems).toHaveBeenCalled());
		expect(toast.error).not.toHaveBeenCalled();
	});
});
