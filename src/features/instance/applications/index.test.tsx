/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationsEditor } from './index';

vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => true }));
vi.mock('@/hooks/useSessionToggler', () => ({ useSessionToggler: () => ({ toggle: () => {}, toggled: false }) }));
vi.mock('@tanstack/react-router', () => ({ Navigate: () => null, useParams: () => ({}) }));
vi.mock('./components/ApplicationsSidebar', () => ({ ApplicationsSidebar: () => null }));
vi.mock('./components/ContentActions', () => ({ ContentActions: () => null }));
vi.mock('./components/ContentViewer', () => ({ ContentViewer: () => null }));
vi.mock('./context/EditorViewProvider', () => ({
	EditorViewProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./modals/AddDirectoryOrFileModal', () => ({ AddDirectoryOrFileModal: () => null }));
vi.mock('./modals/DeleteDirectoryOrFileModal', () => ({ DeleteDirectoryOrFileModal: () => null }));
vi.mock('./modals/DownloadApplicationModal', () => ({ DownloadApplicationModal: () => null }));
vi.mock('./modals/OverwriteConfirmModal', () => ({ OverwriteConfirmModal: () => null }));
vi.mock('./modals/RedeployApplicationModal', () => ({ RedeployApplicationModal: () => null }));
vi.mock('./modals/RenameFileModal', () => ({ RenameFileModal: () => null }));

describe('ApplicationsEditor sidebar resizing', () => {
	beforeEach(() => localStorage.clear());
	afterEach(cleanup);

	it('moves both the file tray and the content pane while dragging, then saves the width', () => {
		const { container } = render(<ApplicationsEditor />);
		const tray = container.querySelector<HTMLElement>('#file-explorer-sidebar')!;
		const content = container.querySelector<HTMLElement>('.applications-content')!;
		const separator = screen.getByRole('separator', { name: 'Resize sidebar' });
		expect(tray.style.getPropertyValue('--app-sidebar-width')).toBe('224px');
		expect(content.style.getPropertyValue('--app-sidebar-width')).toBe('224px');
		expect(separator.className).toContain('touch-none');

		fireEvent.pointerDown(separator, { button: 0, pointerId: 1, clientX: 222 });
		fireEvent.pointerMove(window, { pointerId: 1, clientX: 302 });
		expect(tray.style.getPropertyValue('--app-sidebar-width')).toBe('304px');
		expect(content.style.getPropertyValue('--app-sidebar-width')).toBe('304px');
		fireEvent.pointerUp(window, { pointerId: 1, clientX: 302 });

		expect(separator.getAttribute('aria-valuenow')).toBe('304');
		expect(localStorage.getItem('ApplicationsSidebarWidth')).toBe('304');
	});

	it('resizes from the keyboard through the focusable separator', () => {
		render(<ApplicationsEditor />);
		const separator = screen.getByRole('separator', { name: 'Resize sidebar' });
		expect(separator.tabIndex).toBe(0);
		expect(separator.getAttribute('aria-valuemin')).toBe('180');
		expect(separator.getAttribute('aria-valuemax')).toBe('512');

		fireEvent.keyDown(separator, { key: 'ArrowRight' });
		expect(separator.getAttribute('aria-valuenow')).toBe('234');
		expect(localStorage.getItem('ApplicationsSidebarWidth')).toBe('234');
	});
});
