/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const operations = vi.hoisted(() => ({ denied: new Set<string>(), deploymentsAvailable: false }));

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'ins-1', instanceClient: {} }),
}));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({
		openedEntry: { name: 'anvils', path: 'anvils', project: 'anvils', entries: [] },
		openedEntryContents: undefined,
		isSavingFile: false,
		isSavingAnyFile: false,
		restrictPackageModification: false,
	}),
}));
vi.mock('@/features/instance/applications/context/editorFileContent', () => ({
	useEditorFileContent: () => ({ content: undefined }),
}));
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useDeploymentsAvailable: () => operations.deploymentsAvailable,
	useStagedDeploymentsAvailable: () => false,
}));
vi.mock('@/hooks/useInstanceOperationPermission', () => ({
	useInstanceOperationPermission: (operation: string) => !operations.denied.has(operation),
}));
vi.mock('@/hooks/useRestartInstanceClick', () => ({
	useRestartInstanceClick: () => ({ onRestartClick: vi.fn(), isRestartPending: false }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock('./PrivateDatabaseCopy/PrivateCopyIndicator', () => ({ PrivateCopyIndicator: () => null }));
vi.mock('@/features/instance/config/previews/usePreviewsAvailable', () => ({ usePreviewsProject: () => undefined }));
vi.mock('@/features/instance/config/deployFromGitHub/useDeployFromGitHubAvailable', () => ({
	useDeployFromGitHubProject: () => undefined,
}));
vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', () => ({
	usePayloadBranchedDatabasesAvailable: () => false,
}));

const { ContentActions } = await import('./ContentActions');

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	operations.denied.clear();
	operations.deploymentsAvailable = false;
});

async function openApplicationMenu() {
	render(<ContentActions toggledSidebar={false} toggleSidebar={() => {}} />);
	await act(async () => {
		// Radix menus open on pointerdown, not click.
		fireEvent.pointerDown(screen.getByTitle('Application'), { button: 0, ctrlKey: false });
	});
}

describe('ContentActions Application menu', () => {
	it('offers Restart to a session that can run restart_service', async () => {
		await openApplicationMenu();

		expect(screen.getByRole('menuitem', { name: /Restart/ })).toBeTruthy();
	});

	it('offers no Restart to a session that cannot', async () => {
		operations.denied.add('restart_service');
		await openApplicationMenu();

		expect(screen.queryByRole('menuitem', { name: /Restart/ })).toBeNull();
		expect(screen.getByRole('menuitem', { name: /Download Application/ })).toBeTruthy();
	});

	it("links to the project's deployments for a session that can list them, manager or not", async () => {
		operations.deploymentsAvailable = true;
		await openApplicationMenu();

		expect(screen.getByRole('menuitem', { name: /View Deployments/ })).toBeTruthy();
	});

	it('offers no deployments link to a session that cannot list them', async () => {
		operations.deploymentsAvailable = true;
		operations.denied.add('list_deployments');
		await openApplicationMenu();

		expect(screen.queryByRole('menuitem', { name: /View Deployments/ })).toBeNull();
	});
});
