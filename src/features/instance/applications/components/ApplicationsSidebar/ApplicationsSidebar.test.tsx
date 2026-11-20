/** @vitest-environment jsdom */
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	renameFiles: vi.fn(),
	toastError: vi.fn(),
	canDragAndDrop: undefined as boolean | undefined,
	deniedOperations: [] as string[],
}));

const protectedRoot: DirectoryEntry = {
	name: 'status-check',
	path: 'status-check',
	project: 'status-check',
	package: '@harperdb/akamai-status@1.0.0',
	entries: [{ name: 'resources.js', path: 'status-check/resources.js', project: 'status-check' }],
};
const destinationRoot: DirectoryEntry = {
	name: 'anvils',
	path: 'anvils',
	project: 'anvils',
	entries: [],
};

vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({
		rootEntries: [protectedRoot, destinationRoot],
		openedEntry: undefined,
		setOpenedEntry: vi.fn(),
		focusedItem: undefined,
		setFocusedItem: vi.fn(),
		expandedItems: [],
		setExpandedItems: vi.fn(),
		selectedItems: [],
		setSelectedItems: vi.fn(),
		entryExists: () => false,
	}),
}));
vi.mock('@/features/instance/applications/hooks/useRenameFiles', () => ({
	useRenameFiles: () => mocks.renameFiles,
}));
vi.mock('@/features/instance/applications/shortcuts', () => ({ useGlobalShortcutKeys: vi.fn() }));
vi.mock('@/hooks/useInstanceOperationPermission', () => ({
	useInstanceOperationPermission: (operation: string) => !mocks.deniedOperations.includes(operation),
}));
vi.mock('@/lib/events/listener', () => ({ useListener: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
vi.mock('./DropTarget', () => ({ DropTarget: () => <div data-testid="drop-target" /> }));
vi.mock('./FileTreeContextMenu', () => ({
	FileTreeContextMenu: ({ children }: PropsWithChildren) => children,
}));
vi.mock('./ItemArrow', () => ({ ItemArrow: () => null }));
vi.mock('./ItemTitle', () => ({ ItemTitle: () => null }));
vi.mock('react-complex-tree', () => ({
	ControlledTreeEnvironment: ({ children, onDrop, canDragAndDrop }: PropsWithChildren<{
		canDragAndDrop?: boolean;
		onDrop: (
			droppedItems: Array<{ index: string }>,
			target: { targetType: 'item'; targetItem: string },
		) => unknown;
	}>) => {
		mocks.canDragAndDrop = canDragAndDrop;
		return (
			<button
				type="button"
				onClick={() =>
					void onDrop(
						[{ index: 'status-check/resources.js' }],
						{ targetType: 'item', targetItem: 'anvils' },
					)}
			>
				{children}
			</button>
		);
	},
	InteractionMode: { DoubleClickItemToExpand: 'DoubleClickItemToExpand' },
	Tree: () => null,
}));

import { ApplicationsSidebar } from './index';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.deniedOperations = [];
});

describe('ApplicationsSidebar internal moves', () => {
	it('refuses to move a file out of a protected component', async () => {
		render(<ApplicationsSidebar />);

		fireEvent.click(screen.getByRole('button'));

		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Move refused',
				expect.objectContaining({ description: expect.stringContaining('managed by Harper') }),
			)
		);
		expect(mocks.renameFiles).not.toHaveBeenCalled();
	});
});

describe('ApplicationsSidebar write gate', () => {
	it.each(['get_component_file', 'set_component_file', 'drop_component'])(
		'offers no drag-move without %s',
		(operation) => {
			mocks.deniedOperations = [operation];

			render(<ApplicationsSidebar />);

			expect(mocks.canDragAndDrop).toBe(false);
		},
	);

	it('offers file upload with write alone', () => {
		mocks.deniedOperations = ['get_component_file', 'drop_component'];

		render(<ApplicationsSidebar />);

		expect(screen.getByTestId('drop-target')).toBeTruthy();
	});

	it('offers no file upload without write', () => {
		mocks.deniedOperations = ['set_component_file'];

		render(<ApplicationsSidebar />);

		expect(screen.queryByTestId('drop-target')).toBeNull();
	});

	it('offers both with read, write and drop', () => {
		render(<ApplicationsSidebar />);

		expect(mocks.canDragAndDrop).toBe(true);
		expect(screen.getByTestId('drop-target')).toBeTruthy();
	});
});
