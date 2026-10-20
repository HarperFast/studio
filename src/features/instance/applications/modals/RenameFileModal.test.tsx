/**
 * @vitest-environment jsdom
 */
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const openedEntry: FileEntry = { name: 'index.js', path: 'my-app/index.js', project: 'my-app' } as FileEntry;

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'test-instance', entityType: 'instance' }),
}));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({ openedEntry, entryExists: () => false, reloadRootEntries: vi.fn() }),
}));
vi.mock('@/features/instance/applications/hooks/useRenameFiles', () => ({ useRenameFiles: () => vi.fn() }));
vi.mock('@/lib/events/watcher', () => ({
	useWatchedValue: () => ({ value: true, trigger: undefined }),
	setWatchedValue: vi.fn(),
}));
vi.mock('@/lib/attemptToRestoreFocus', () => ({ attemptToRestoreFocus: vi.fn() }));
vi.mock('@/integrations/api/instance/applications/dropComponent', () => ({ dropComponent: vi.fn() }));
vi.mock('@/integrations/api/instance/applications/setComponentFile', () => ({ setComponentFile: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RenameFileModal } from './RenameFileModal';

function renderWithQueryClient(ui: ReactElement) {
	return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

async function typeName(value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Name'), { target: { value } });
	});
}

async function leaveName() {
	await act(async () => {
		fireEvent.blur(screen.getByLabelText('Name'));
	});
}

function renameButton() {
	return screen.getByRole('button', { name: /Rename/ }) as HTMLButtonElement;
}

describe('RenameFileModal', () => {
	it('stops the name at the 50 characters the form accepts, and says so there', () => {
		renderWithQueryClient(<RenameFileModal />);
		const name = screen.getByLabelText('Name') as HTMLInputElement;
		expect(name.maxLength).toBe(50);

		fireEvent.change(name, { target: { value: 'a'.repeat(50) } });
		expect(screen.getByText('Maximum 50 characters reached.')).toBeTruthy();
	});

	it('shows the reason when Enter is pressed, then clears it once the name is fixed', async () => {
		renderWithQueryClient(<RenameFileModal />);
		await typeName('index(1).js');
		await act(async () => {
			fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Enter' });
		});

		const message = 'Names can only contain letters, numbers, underscores, hyphens, periods, and spaces.';
		expect(await screen.findByText(message)).toBeTruthy();
		expect(renameButton().disabled).toBe(true);

		await typeName('renamed.js');
		await waitFor(() => expect(screen.queryByText(message)).toBeNull());
		expect(renameButton().disabled).toBe(false);
	});

	it('enables Rename after a single change, such as pasting a new name', async () => {
		renderWithQueryClient(<RenameFileModal />);
		await typeName('renamed.js');

		await waitFor(() => expect(renameButton().disabled).toBe(false));
	});

	it.each([
		[
			"a character names can't hold",
			'index(1).js',
			'Names can only contain letters, numbers, underscores, hyphens, periods, and spaces.',
		],
		['the current name', 'index.js', 'Please enter a new name.'],
		['only spaces', '   ', 'Please enter a valid name.'],
	])('explains why %s is refused once the field is left', async (_, value, message) => {
		renderWithQueryClient(<RenameFileModal />);
		await typeName('renamed.js');
		await typeName(value);
		expect(screen.queryByText(message)).toBeNull();

		await leaveName();

		expect(await screen.findByText(message)).toBeTruthy();
		expect(renameButton().disabled).toBe(true);
	});
});
