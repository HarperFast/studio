/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Databases } from './index';

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => ({}) }));
vi.mock('@/integrations/api/instance/database/getDescribeAll', () => ({ getDescribeAllQueryOptions: () => ({}) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }));
vi.mock('@tanstack/react-router', () => ({ Navigate: () => null, useParams: () => ({}) }));
vi.mock('./functions/resolveDatabasesRedirect', () => ({ resolveDatabasesRedirect: () => null }));
vi.mock('./components/DatabaseActionModals', () => ({ DatabaseActionModals: () => null }));
vi.mock('./components/DatabaseOverview', () => ({ DatabaseOverview: () => null }));
vi.mock('./components/DatabasesSidebar', () => ({ DatabasesSidebar: () => null }));
vi.mock('./components/DatabaseTableView', () => ({ DatabaseTableView: () => null }));

describe('Databases sidebar resizing', () => {
	beforeEach(() => localStorage.clear());
	afterEach(cleanup);

	it('drags the separator to resize the sidebar and saves the width under its storage key', () => {
		localStorage.setItem('DatabasesSidebarWidth', '300');
		render(<Databases />);
		const separator = screen.getByRole('separator', { name: 'Resize sidebar' });
		const sidebar = separator.parentElement!;
		expect(sidebar.style.getPropertyValue('--db-sidebar-width')).toBe('300px');
		expect(separator.getAttribute('aria-valuemin')).toBe('200');
		expect(separator.getAttribute('aria-valuemax')).toBe('512');
		expect(separator.className).toContain('touch-none');

		fireEvent.pointerDown(separator, { button: 0, pointerId: 1, clientX: 300 });
		fireEvent.pointerMove(window, { pointerId: 1, clientX: 360 });
		expect(sidebar.style.getPropertyValue('--db-sidebar-width')).toBe('360px');
		fireEvent.pointerUp(window, { pointerId: 1, clientX: 360 });

		expect(separator.getAttribute('aria-valuenow')).toBe('360');
		expect(localStorage.getItem('DatabasesSidebarWidth')).toBe('360');
	});
});
