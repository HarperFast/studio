/** @vitest-environment jsdom */
/**
 * Integration coverage for the react-dropzone / file-selector boundary.
 *
 * `DropTarget` depends on a runtime contract no type can express: react-dropzone hands each
 * picked file to `file-selector`, which defines a `relativePath` on it — `webkitRelativePath`
 * for a folder upload, else `./<name>`. `getFilePath` then strips that `./` prefix to build the
 * destination path. A major bump of either package can quietly change that shape (v19 widened
 * `onDrop` to `<T extends File>`, so TypeScript no longer checks it at all), and the only
 * symptom would be files uploaded as `./name` or dumped in the wrong directory.
 *
 * These tests drive the real hook through the hidden file input, so file-selector's actual
 * output is what gets asserted.
 */
import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { EditorViewContext, EditorViewContextValue } from '@/features/instance/applications/context/EditorViewContext';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	setComponentFile: vi.fn(),
	toast: {
		loading: vi.fn(),
		success: vi.fn(),
		error: vi.fn(),
		dismiss: vi.fn(),
	},
	errorHandler: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({}) }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'instance-1', entityType: 'instance' }),
}));
vi.mock('@/features/auth/store/authStore', () => ({
	authStore: { checkForFabricConnect: () => false },
}));
vi.mock('@/integrations/api/instance/applications/setComponentFile', () => ({
	setComponentFile: mocks.setComponentFile,
}));
vi.mock('@/react-query/queryClient', () => ({ errorHandler: mocks.errorHandler }));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { DropTarget } from './DropTarget';

// The editor has `my-app/routes` open, so uploads land inside `routes`.
const openedEntry: DirectoryEntry = {
	name: 'routes',
	path: 'my-app/routes',
	project: 'my-app',
	entries: [],
};

function mount() {
	const value: EditorViewContextValue = {
		rootEntries: [],
		reloadRootEntries: () => Promise.resolve({ name: '', entries: [] }),
		entryExists: () => false,
		openedEntry,
		setOpenedEntry: () => {},
		restrictPackageModification: false,
		openedEntryContents: undefined,
		setOpenedEntryContents: () => {},
		focusedItem: undefined,
		setFocusedItem: () => {},
		expandedItems: [],
		setExpandedItems: () => {},
		selectedItems: [],
		setSelectedItems: () => {},
		saveFile: () => {},
		isSavingFile: false,
	};
	return render(
		<EditorViewContext.Provider value={value}>
			<DropTarget />
		</EditorViewContext.Provider>,
	);
}

/**
 * Select files through the hidden input react-dropzone renders — the same path a click on the
 * drop zone takes. jsdom's `HTMLInputElement.files` is read-only, hence the redefine.
 */
function pickFiles(files: File[]) {
	const input = document.getElementById('dropTarget') as HTMLInputElement;
	Object.defineProperty(input, 'files', { value: files, configurable: true });
	fireEvent.change(input);
}

/** A folder upload arrives as flat files carrying the browser's `webkitRelativePath`. */
function fileInFolder(relativePath: string, contents: string) {
	const file = new File([contents], relativePath.split('/').pop() ?? relativePath, {
		type: 'text/plain',
	});
	Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
	return file;
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('DropTarget uploads', () => {
	it('uploads a selected file into the opened directory, base64 encoded', async () => {
		mount();

		pickFiles([new File(['hello'], 'hello.js', { type: 'text/javascript' })]);

		await waitFor(() => expect(mocks.setComponentFile).toHaveBeenCalledTimes(1));
		// `./hello.js` from file-selector — the leading `./` must not reach the server.
		expect(mocks.setComponentFile).toHaveBeenCalledWith(expect.objectContaining({
			project: 'my-app',
			file: 'routes/hello.js',
			encoding: 'base64',
			payload: 'aGVsbG8=',
		}));
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith(
				'Uploaded 1 file!',
				expect.anything(),
			)
		);
		expect(mocks.toast.error).not.toHaveBeenCalled();
	});

	it('preserves the folder structure of a dropped directory', async () => {
		mount();

		pickFiles([
			fileInFolder('my-folder/index.js', 'a'),
			fileInFolder('my-folder/nested/deep.js', 'b'),
		]);

		await waitFor(() => expect(mocks.setComponentFile).toHaveBeenCalledTimes(2));
		expect(mocks.setComponentFile.mock.calls.map(([request]) => request.file)).toEqual([
			'routes/my-folder/index.js',
			'routes/my-folder/nested/deep.js',
		]);
		expect(mocks.toast.error).not.toHaveBeenCalled();
	});

	it('skips dot files and folders instead of uploading them', async () => {
		mount();

		pickFiles([
			new File(['SECRET=1'], '.env', { type: 'text/plain' }),
			fileInFolder('my-folder/.git/config', 'c'),
		]);

		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith(
				'Rejected uploads',
				expect.objectContaining({
					description: expect.stringContaining('Sensitive files and folders starting with . are skipped.'),
				}),
			)
		);
		expect(mocks.setComponentFile).not.toHaveBeenCalled();
	});
});
