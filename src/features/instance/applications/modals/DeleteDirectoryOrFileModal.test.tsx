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
import type { DeleteSelectedItemsCallbacks } from '@/features/instance/applications/lib/deleteSelectedItems';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
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
let currentBranches: { setting: string[] | true | undefined; known: boolean } = { setting: undefined, known: false };

vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/instance/applications/hooks/useBranchedDatabases')>()),
	useApplicationBranchedDatabases: (
		project: string | undefined,
	) => (project ? currentBranches : { setting: undefined, known: false }),
}));

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
	deleteSelectedItems: vi.fn(async (_items: readonly string[], _callbacks: DeleteSelectedItemsCallbacks) => ({
		lastSplit: [] as string[],
	})),
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/features/instance/applications/lib/deleteSelectedItems', () => ({ deleteSelectedItems }));

import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { DeleteDirectoryOrFileModal } from './DeleteDirectoryOrFileModal';

function renderWithQueryClient(ui: ReactElement) {
	return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

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
	currentBranches = { setting: undefined, known: false };
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
		renderWithQueryClient(<DeleteDirectoryOrFileModal />);

		confirmDelete(/Remove items/i);

		await waitFor(() => expect(toast.error).toHaveBeenCalled());
		expect(deleteSelectedItems).not.toHaveBeenCalled();
	});

	it('deletes an ordinary selection with no protected component', async () => {
		openedEntry = rootEntries[1];
		selectedItems = ['anvils/index.js'];
		renderWithQueryClient(<DeleteDirectoryOrFileModal />);

		confirmDelete(/Delete Application/i);

		await waitFor(() => expect(deleteSelectedItems).toHaveBeenCalled());
		expect(toast.error).not.toHaveBeenCalled();
	});

	describe('an application on a private database copy', () => {
		const KEPT = 'Successfully dropped: anvils. Any branched database storage this application owns was left in place; '
			+ 'drop it again with restart: true to discard that data';

		it('says the copy stays on disk before it is removed', () => {
			openedEntry = rootEntries[1];
			selectedItems = ['anvils'];
			currentBranches = { setting: ['data'], known: true };
			renderWithQueryClient(<DeleteDirectoryOrFileModal />);

			expect(screen.getByText(/runs on a private copy of data/)).toBeTruthy();
		});

		it('says nothing about the copy when deleting a file inside the application', () => {
			openedEntry = rootEntries[1];
			selectedItems = ['anvils/index.js'];
			currentBranches = { setting: ['data'], known: true };
			renderWithQueryClient(<DeleteDirectoryOrFileModal />);

			expect(screen.queryByText(/runs on a private copy/)).toBeNull();
		});

		it('says nothing about the copy until the setting is current', () => {
			openedEntry = rootEntries[1];
			selectedItems = ['anvils'];
			currentBranches = { setting: ['data'], known: false };
			renderWithQueryClient(<DeleteDirectoryOrFileModal />);

			expect(screen.queryByText(/runs on a private copy/)).toBeNull();
		});

		it("shows Harper's answer when it kept the copy, and forgets the dropped application's setting", async () => {
			const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
			openedEntry = rootEntries[1];
			selectedItems = ['anvils'];
			vi.mocked(dropComponent).mockResolvedValue({ message: KEPT });
			deleteSelectedItems.mockImplementationOnce(async (_items, callbacks) => {
				await callbacks.dropItem('anvils', undefined);
				return { lastSplit: [] };
			});
			renderWithQueryClient(<DeleteDirectoryOrFileModal />);

			confirmDelete(/Delete Application/i);

			await waitFor(() =>
				expect(toast.warning).toHaveBeenCalledWith(
					'Delete completed, private database copy kept',
					expect.objectContaining({ description: KEPT }),
				)
			);
			expect(toast.success).not.toHaveBeenCalled();
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ['get_configuration', 'test-instance'] });
			invalidate.mockRestore();
		});

		it("doesn't read a file's drop as the application's", async () => {
			openedEntry = rootEntries[1];
			selectedItems = ['anvils/index.js'];
			vi.mocked(dropComponent).mockResolvedValue({ message: KEPT });
			deleteSelectedItems.mockImplementationOnce(async (_items, callbacks) => {
				await callbacks.dropItem('anvils', 'index.js');
				return { lastSplit: [] };
			});
			renderWithQueryClient(<DeleteDirectoryOrFileModal />);

			confirmDelete(/Delete Application/i);

			await waitFor(() => expect(toast.success).toHaveBeenCalled());
			expect(toast.warning).not.toHaveBeenCalled();
		});
	});
});
