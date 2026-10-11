/**
 * @vitest-environment jsdom
 */
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const openedEntry: FileEntry = { name: 'index.js', path: 'my-app/index.js', project: 'my-app' } as FileEntry;

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'test-instance', entityType: 'instance' }),
}));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({
		openedEntry,
		entryExists: () => false,
		reloadRootEntries: vi.fn(),
		setFocusedItem: vi.fn(),
		setSelectedItems: vi.fn(),
		setExpandedItems: vi.fn(),
	}),
}));
vi.mock('@/integrations/api/instance/applications/setComponentFile', () => ({
	useSetComponentFile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/events/watcher', () => ({
	useWatchedValue: () => ({ value: 'file', trigger: undefined }),
	setWatchedValue: vi.fn(),
}));
vi.mock('@/lib/attemptToRestoreFocus', () => ({ attemptToRestoreFocus: vi.fn() }));

import { AddDirectoryOrFileModal } from './AddDirectoryOrFileModal';

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

describe('AddDirectoryOrFileModal', () => {
	it('stops the name at the 50 characters the form accepts', () => {
		render(<AddDirectoryOrFileModal />);

		expect((screen.getByLabelText('Name') as HTMLInputElement).maxLength).toBe(50);
	});
});
