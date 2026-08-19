/** @vitest-environment jsdom */
import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	renameFiles: vi.fn(),
	toastError: vi.fn(),
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
vi.mock('@/lib/events/listener', () => ({ useListener: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
vi.mock('./DropTarget', () => ({ DropTarget: () => null }));
vi.mock('./FileTreeContextMenu', () => ({
	FileTreeContextMenu: ({ children }: PropsWithChildren) => children,
}));
vi.mock('./ItemArrow', () => ({ ItemArrow: () => null }));
vi.mock('./ItemTitle', () => ({ ItemTitle: () => null }));
vi.mock('react-complex-tree', () => ({
	ControlledTreeEnvironment: ({ children, onDrop }: PropsWithChildren<{
		onDrop: (
			droppedItems: Array<{ index: string }>,
			target: { targetType: 'item'; targetItem: string },
		) => unknown;
	}>) => (
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
	),
	InteractionMode: { DoubleClickItemToExpand: 'DoubleClickItemToExpand' },
	Tree: () => null,
}));

import { ApplicationsSidebar } from './index';

beforeEach(() => {
	vi.clearAllMocks();
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
