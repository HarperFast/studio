/** @vitest-environment jsdom */
/**
 * The download modal's job before HarperFast/harper#2150 lands is to be honest about size:
 * `package_component` returns the whole archive as base64 in JSON, and past a few hundred MB
 * decoding it kills the tab with a generic Chrome error and no explanation
 * (HarperFast/studio#1591). These tests cover the up-front size, the warning that fires for a
 * #1591-sized application, and the two failure paths that used to leave the "Packaging..."
 * toast spinning forever.
 */
import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { EditorViewContext, EditorViewContextValue } from '@/features/instance/applications/context/EditorViewContext';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	packageComponent: vi.fn(),
	toast: {
		loading: vi.fn(() => 'toast-1'),
		success: vi.fn(),
		error: vi.fn(),
		dismiss: vi.fn(),
	},
}));

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'instance-1', entityType: 'instance' }),
}));
vi.mock('@/integrations/api/instance/applications/packageComponent', () => ({
	usePackageComponentMutation: () => ({ mutate: mocks.packageComponent, isPending: false, isSuccess: false }),
}));
vi.mock('@/lib/events/watcher', () => ({
	useWatchedValue: () => ({ value: true, trigger: undefined }),
	setWatchedValue: () => {},
}));
vi.mock('@/lib/attemptToRestoreFocus', () => ({ attemptToRestoreFocus: () => {} }));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { DownloadApplicationModal } from './DownloadApplicationModal';

function file(name: string, size: number): FileEntry {
	return { name, path: `my-app/${name}`, project: 'my-app', size } as FileEntry;
}

function mount(files: FileEntry[]) {
	const root: DirectoryEntry = { name: 'my-app', path: 'my-app', project: 'my-app', entries: files };
	const openedEntry: FileEntry = { name: 'index.js', path: 'my-app/index.js', project: 'my-app' };
	const value = {
		rootEntries: [root],
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
	} as unknown as EditorViewContextValue;
	return render(
		<EditorViewContext.Provider value={value}>
			<DownloadApplicationModal />
		</EditorViewContext.Provider>,
	);
}

/** Click Download and hand back the callbacks the modal passed to the mutation. */
function clickDownload() {
	fireEvent.click(screen.getByRole('button', { name: /Download/ }));
	const [, options] = mocks.packageComponent.mock.calls.at(-1)!;
	return options as {
		onSuccess: (response: { payload: string }) => void;
		onError: (error: Error) => void;
	};
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('DownloadApplicationModal size warning', () => {
	it('states the package size up front, before anything is packaged', () => {
		mount([file('index.js', 2_000_000), file('README.md', 1_000_000)]);

		expect(screen.getByText(/About 3 MB across 2 files/)).toBeTruthy();
		expect(mocks.packageComponent).not.toHaveBeenCalled();
	});

	it('stays quiet for an ordinary application', () => {
		mount([file('index.js', 2_000_000)]);

		expect(screen.queryByText('This is a large download')).toBeNull();
		expect(screen.getByRole('button', { name: /Download$/ })).toBeTruthy();
	});

	it('warns and relabels the button for a #1591-sized application', () => {
		mount([file('assets.bin', 800_000_000)]);

		expect(screen.getByText('This is a large download')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Download anyway/ })).toBeTruthy();
	});

	// node_modules is absent from the get_components tree, so the measured total is only a
	// floor once the user opts into including it — warn rather than quote a number we know is low.
	it('warns once node modules are included, even for a small application', () => {
		mount([file('index.js', 1_000)]);
		expect(screen.queryByText('This is a large download')).toBeNull();

		fireEvent.click(screen.getByRole('checkbox'));

		expect(screen.getByText('This is a large download')).toBeTruthy();
		expect(screen.getByText(/plus node modules/)).toBeTruthy();
	});

	it('downloads with the size known but does not block the request', () => {
		mount([file('assets.bin', 800_000_000)]);

		clickDownload();

		expect(mocks.packageComponent).toHaveBeenCalledTimes(1);
		expect(mocks.packageComponent.mock.calls[0][0]).toMatchObject({ project: 'my-app', skipNodeModules: true });
	});
});

describe('DownloadApplicationModal failure reporting', () => {
	it('resolves the loading toast into an error when packaging fails', () => {
		mount([file('index.js', 1_000)]);

		clickDownload().onError(new Error('ERR_STRING_TOO_LONG'));

		expect(mocks.toast.error).toHaveBeenCalledWith(
			expect.stringContaining('ERR_STRING_TOO_LONG'),
			{ id: 'toast-1' },
		);
		expect(mocks.toast.success).not.toHaveBeenCalled();
	});

	it('reports a decode failure instead of letting it escape into react-query', () => {
		mount([file('index.js', 1_000)]);
		const options = clickDownload();

		const atobSpy = vi.spyOn(globalThis, 'atob').mockImplementation(() => {
			throw new RangeError('Invalid string length');
		});
		try {
			expect(() => options.onSuccess({ payload: 'whatever' })).not.toThrow();
		} finally {
			atobSpy.mockRestore();
		}

		expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('too large'), { id: 'toast-1' });
		expect(mocks.toast.success).not.toHaveBeenCalled();
	});

	it('decodes a real payload and reports success', () => {
		mount([file('index.js', 1_000)]);
		const createObjectURL = vi.fn((_obj: Blob | MediaSource) => 'blob:mock');
		const priorCreate = URL.createObjectURL;
		URL.createObjectURL = createObjectURL;
		try {
			clickDownload().onSuccess({ payload: btoa('gzip-bytes') });
		} finally {
			URL.createObjectURL = priorCreate;
		}

		expect(mocks.toast.success).toHaveBeenCalledWith('Download ready!', { id: 'toast-1' });
		expect(createObjectURL).toHaveBeenCalledTimes(1);
		const blob = createObjectURL.mock.calls[0]![0] as Blob;
		expect(blob.size).toBe('gzip-bytes'.length);
	});
});
