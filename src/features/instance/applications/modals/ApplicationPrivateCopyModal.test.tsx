/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const post = vi.fn();
	return {
		post,
		instanceParams: { entityId: 'clu-1', entityType: 'cluster', instanceClient: { post } },
		editor: {
			openedEntry: { name: 'web', path: 'web', project: 'web', entries: [] },
			openedEntryContents: undefined as string | undefined,
			rootEntries: [] as unknown[],
			isSavingAnyFile: false,
		},
		unsavedEdits: false,
		current: {
			readable: true,
			setting: undefined as string[] | true | undefined,
			known: true,
			loading: false,
			failed: false,
			retry: vi.fn(),
		},
		hasPackage: false,
		configurationAfter: {} as unknown,
		configurationReadFails: false,
		runHealthCheck: vi.fn(),
		readSetting: vi.fn(),
		invalidateConfiguration: vi.fn(),
	};
});

vi.mock('sonner', () => ({
	toast: { loading: vi.fn(), dismiss: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
	useNavigate: () => vi.fn(),
}));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => mocks.instanceParams }));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({ useEditorView: () => mocks.editor }));
vi.mock('@/features/instance/applications/context/editorFileContent', () => ({
	useEditorFileContentId: () => 'clu-1',
	hasEditorFileContentAtOrUnder: (_id: string, project: string) => project === 'web' && mocks.unsavedEdits,
}));
vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', () => ({
	readApplicationSetting: mocks.readSetting,
	useApplicationBranchedDatabases: () => mocks.current,
	useApplicationEntryHasPackage: () => mocks.hasPackage,
	invalidateApplicationConfiguration: mocks.invalidateConfiguration,
}));
vi.mock('@/features/instance/applications/hooks/useComponentHealthCheck', () => ({
	useComponentHealthCheck: () => mocks.runHealthCheck,
}));
vi.mock('@/integrations/api/instance/applications/packageComponent', () => ({ fetchComponentArchive: vi.fn() }));
vi.mock('@/integrations/api/instance/applications/deployComponentStream', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/applications/deployComponentStream')>()),
	deployComponentStream: vi.fn(),
}));
vi.mock('@/lib/attemptToRestoreFocus', () => ({ attemptToRestoreFocus: vi.fn() }));

import { authStore } from '@/features/auth/store/authStore';
import { readBranchedDatabases } from '@/integrations/api/instance/applications/branchedDatabases';
import { deployComponentStream } from '@/integrations/api/instance/applications/deployComponentStream';
import { fetchComponentArchive } from '@/integrations/api/instance/applications/packageComponent';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { setWatchedValue } from '@/lib/events/watcher';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { toast } from 'sonner';
import { ApplicationPrivateCopyModal } from './ApplicationPrivateCopyModal';

const ARCHIVE = new Blob(['tarball'], { type: 'application/gzip' });

async function renderOpenModal() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<ApplicationPrivateCopyModal />
		</QueryClientProvider>,
	);
	await act(async () => setWatchedValue('ShowApplicationPrivateCopyModal', true));
}

function saveButton() {
	return screen.getByRole('button', { name: /Save and Redeploy/ }) as HTMLButtonElement;
}

async function choose(mode: RegExp) {
	await act(async () => {
		fireEvent.click(screen.getByRole('radio', { name: mode }));
	});
}

async function save() {
	await act(async () => {
		fireEvent.click(saveButton());
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(authStore, 'isDirectConnection').mockReturnValue(true);
	mocks.editor.isSavingAnyFile = false;
	mocks.editor.rootEntries = [];
	mocks.editor.openedEntry = { name: 'web', path: 'web', project: 'web', entries: [] };
	mocks.instanceParams.entityId = 'clu-1';
	mocks.unsavedEdits = false;
	mocks.current = { readable: true, setting: ['data'], known: true, loading: false, failed: false, retry: vi.fn() };
	mocks.hasPackage = false;
	mocks.configurationAfter = { web: { branchedDatabases: [] } };
	mocks.configurationReadFails = false;
	mocks.post.mockResolvedValue({ data: { data: {} } });
	mocks.readSetting.mockImplementation(async (_queryClient: unknown, _params: unknown, project: string) =>
		mocks.configurationReadFails ? 'unknown' : readBranchedDatabases(mocks.configurationAfter, project)
	);
	mocks.runHealthCheck.mockResolvedValue({ level: 'healthy' });
	vi.mocked(fetchComponentArchive).mockResolvedValue(ARCHIVE);
	vi.mocked(deployComponentStream).mockResolvedValue({ message: 'deployed', deployment_id: 'dep-1' });
});

afterEach(async () => {
	await act(async () => setWatchedValue('ShowApplicationPrivateCopyModal', false));
	cleanup();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('ApplicationPrivateCopyModal', () => {
	it("turns the copy off with an empty list, from the application's files, and confirms it by reading the entry", async () => {
		await renderOpenModal();
		await choose(/^Off/);
		await save();

		await waitFor(() => expect(toast.success).toHaveBeenCalled());
		expect(fetchComponentArchive).toHaveBeenCalledWith(expect.objectContaining({
			connection: { id: 'clu-1' },
			project: 'web',
			skipNodeModules: true,
		}));
		const { body, file } = vi.mocked(deployComponentStream).mock.calls[0][0];
		expect(body).toMatchObject({ project: 'web', branchedDatabases: [], replicated: true });
		expect(body).not.toHaveProperty('package');
		expect(file).toMatchObject({ name: 'payload', blob: ARCHIVE });
		expect(mocks.readSetting).toHaveBeenCalledWith(expect.anything(), mocks.instanceParams, 'web');
		expect(mocks.invalidateConfiguration).toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('sends the installed dependencies when asked to', async () => {
		mocks.configurationAfter = { web: { branchedDatabases: true } };
		await renderOpenModal();
		await choose(/All databases/);
		await act(async () => {
			fireEvent.click(screen.getByRole('switch'));
		});
		await save();

		await waitFor(() => expect(fetchComponentArchive).toHaveBeenCalled());
		expect(vi.mocked(fetchComponentArchive).mock.calls[0][0].skipNodeModules).toBe(false);
	});

	it('says when the archive is large, and when node_modules makes it so', async () => {
		mocks.editor.rootEntries = [{
			name: 'web',
			path: 'web',
			project: 'web',
			entries: [{ name: 'big.bin', path: 'web/big.bin', project: 'web', size: 150_000_000 }],
		}];
		await renderOpenModal();
		expect(screen.getByText(/web is about 150/)).toBeTruthy();

		mocks.editor.rootEntries = [{ name: 'web', path: 'web', project: 'web', entries: [] }];
		await act(async () => setWatchedValue('ShowApplicationPrivateCopyModal', false));
		cleanup();
		await renderOpenModal();
		expect(screen.queryByText(/holds the whole archive/)).toBeNull();
		await act(async () => {
			fireEvent.click(screen.getByRole('switch'));
		});
		expect(screen.getByText(/With node_modules, web's archive can be large/)).toBeTruthy();
	});

	it('offers Save only once the choice differs from a current reading of the setting', async () => {
		await renderOpenModal();
		expect(saveButton().disabled).toBe(true);

		await choose(/All databases/);
		expect(saveButton().disabled).toBe(false);
	});

	it('waits for a current reading of the setting', async () => {
		mocks.current = { ...mocks.current, known: false, loading: true };
		await renderOpenModal();
		await choose(/All databases/);

		expect(saveButton().disabled).toBe(true);
	});

	it.each([
		[
			'over Fabric Connect',
			() => vi.spyOn(authStore, 'isDirectConnection').mockReturnValue(false),
			/direct connection/,
		],
		['for an application deployed from a package', () => (mocks.hasPackage = true), /deployed from a package/],
		['while one of its files has unsaved changes', () => (mocks.unsavedEdits = true), /Save or revert/],
		['while a file is saving', () => (mocks.editor.isSavingAnyFile = true), /Save or revert/],
	])('refuses %s, and says why', async (_, arrange, why) => {
		arrange();
		await renderOpenModal();
		await choose(/All databases/);

		expect(saveButton().disabled).toBe(true);
		expect(screen.getByRole('alert').textContent).toMatch(why);
	});

	it('shows a packaging failure in the dialog, and deploys nothing', async () => {
		vi.mocked(fetchComponentArchive).mockRejectedValue(new Error('Project not found'));
		await renderOpenModal();
		await choose(/^Off/);
		const readsOnOpen = mocks.invalidateConfiguration.mock.calls.length;
		await save();

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toMatch(
				/couldn't package web, so nothing was deployed: Project not found/,
			)
		);
		expect(deployComponentStream).not.toHaveBeenCalled();
		expect(mocks.invalidateConfiguration).toHaveBeenCalledTimes(readsOnOpen);
		expect(mocks.readSetting).not.toHaveBeenCalled();
	});

	it('never calls a deploy that lost its stream a success', async () => {
		vi.mocked(deployComponentStream).mockRejectedValue(new SSEInconclusiveError('idle'));
		await renderOpenModal();
		await choose(/^Off/);
		await save();

		await waitFor(() => expect(toast.warning).toHaveBeenCalled());
		expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/setting changed, but its deploy didn't report back/);
		expect(toast.success).not.toHaveBeenCalled();
		expect(mocks.invalidateConfiguration).toHaveBeenCalled();
	});

	it('says so when the entry reads differently after the deploy, in the panel too, instead of reporting success', async () => {
		mocks.configurationAfter = { web: { branchedDatabases: ['data'] } };
		await renderOpenModal();
		await choose(/^Off/);
		await save();

		await waitFor(() => expect(toast.warning).toHaveBeenCalled());
		expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/didn't change/);
		expect(toast.success).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog').textContent).toMatch(/Harper reports a different setting/);
	});

	it("never reports success when the setting can't be read back", async () => {
		mocks.configurationReadFails = true;
		await renderOpenModal();
		await choose(/^Off/);
		await save();

		await waitFor(() => expect(toast.warning).toHaveBeenCalled());
		expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/Couldn't confirm web's private database copy setting/);
		expect(toast.success).not.toHaveBeenCalled();
		expect(mocks.runHealthCheck).not.toHaveBeenCalled();
	});

	it('sends one save for two submits in the same tick', async () => {
		vi.mocked(fetchComponentArchive).mockReturnValue(new Promise(() => {}));
		await renderOpenModal();
		await choose(/^Off/);

		await act(async () => {
			fireEvent.click(saveButton());
			fireEvent.click(saveButton());
		});

		await waitFor(() => expect(fetchComponentArchive).toHaveBeenCalled());
		expect(fetchComponentArchive).toHaveBeenCalledOnce();
	});

	it("doesn't hold the same application on another instance behind a save still running", async () => {
		vi.mocked(fetchComponentArchive).mockReturnValueOnce(new Promise(() => {}));
		await renderOpenModal();
		await choose(/^Off/);
		await save();
		await act(async () => {
			fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
		});

		mocks.instanceParams.entityId = 'clu-2';
		await act(async () => setWatchedValue('ShowApplicationPrivateCopyModal', true));
		await choose(/^Off/);
		await save();

		await waitFor(() => expect(fetchComponentArchive).toHaveBeenCalledTimes(2));
		expect(vi.mocked(fetchComponentArchive).mock.calls[1][0].connection).toEqual({ id: 'clu-2' });
	});

	it("doesn't hold another application's save behind one still running", async () => {
		vi.mocked(fetchComponentArchive).mockReturnValueOnce(new Promise(() => {}));
		await renderOpenModal();
		await choose(/^Off/);
		await save();
		await act(async () => {
			fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
		});

		mocks.editor.openedEntry = { name: 'api', path: 'api', project: 'api', entries: [] };
		await act(async () => setWatchedValue('ShowApplicationPrivateCopyModal', true));
		await choose(/^Off/);
		await save();

		await waitFor(() => expect(fetchComponentArchive).toHaveBeenCalledTimes(2));
		expect(vi.mocked(fetchComponentArchive).mock.calls[1][0].project).toBe('api');
	});

	it('reopens on the setting the save made, not the one before it', async () => {
		const health = deferred<{ level: 'healthy' }>();
		mocks.runHealthCheck.mockReturnValue(health.promise);
		await renderOpenModal();
		await choose(/^Off/);
		await save();
		await waitFor(() => expect(mocks.runHealthCheck).toHaveBeenCalled());

		mocks.current = { ...mocks.current, setting: undefined };
		await act(async () => setWatchedValue('ShowApplicationPrivateCopyModal', true));
		await act(async () => health.resolve({ level: 'healthy' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		await act(async () => setWatchedValue('ShowApplicationPrivateCopyModal', true));
		expect(screen.getByRole('radio', { name: /^Off/ }).getAttribute('aria-checked')).toBe('true');
		expect(saveButton().disabled).toBe(true);
	});

	it('runs one save at a time', async () => {
		const packaging = deferred<Blob>();
		vi.mocked(fetchComponentArchive).mockReturnValue(packaging.promise);
		await renderOpenModal();
		await choose(/^Off/);
		await save();
		await act(async () => {
			fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
		});
		await act(async () => setWatchedValue('ShowApplicationPrivateCopyModal', true));
		await choose(/^Off/);

		expect(saveButton().disabled).toBe(true);
		expect(screen.getByRole('status').textContent).toMatch(/still running/);
		await act(async () => packaging.resolve(ARCHIVE));
		expect(fetchComponentArchive).toHaveBeenCalledOnce();
	});
});
