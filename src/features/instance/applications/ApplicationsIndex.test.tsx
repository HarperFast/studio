/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const studio = vi.hoisted(() => ({
	isPending: true,
	applications: 'visible' as 'visible' | 'tucked' | 'hidden',
}));

vi.mock('@/features/instance/extensions/useStudioExtensions', () => ({
	useStudioConfiguration: () => ({ isPending: studio.isPending }),
	useNavigationVisibility: () => (key: string) => key === 'applications' ? studio.applications : 'visible',
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...await importOriginal<typeof import('@tanstack/react-router')>(),
	Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1', instanceId: 'ins-1' }),
}));

let ApplicationsIndex: typeof import('@/features/instance/applications/ApplicationsIndex').ApplicationsIndex;
let editorLoads = 0;

// The editor's chunk loads once per module, so each case starts from a copy that hasn't loaded it yet.
beforeEach(async () => {
	vi.resetModules();
	editorLoads = 0;
	vi.doMock('@/features/instance/applications', () => {
		editorLoads += 1;
		return { ApplicationsEditor: () => <div>Applications editor</div> };
	});
	({ ApplicationsIndex } = await import('@/features/instance/applications/ApplicationsIndex'));
});

afterEach(() => {
	cleanup();
	studio.isPending = true;
	studio.applications = 'visible';
});

describe('ApplicationsIndex', () => {
	it('sends a cluster known to hide Applications to its landing page without loading the editor', async () => {
		studio.isPending = false;
		studio.applications = 'hidden';
		render(<ApplicationsIndex />);
		expect(screen.getByTestId('navigate').textContent).toBe('/org-1/clu-1/instance/ins-1/start');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(editorLoads).toBe(0);
	});

	it("starts loading the editor while the cluster's configuration is still being read", async () => {
		render(<ApplicationsIndex />);
		expect(screen.getByText('Opening…')).toBeTruthy();
		await vi.waitFor(() => expect(editorLoads).toBe(1));
	});

	it('opens the editor once the configuration shows Applications', async () => {
		studio.isPending = false;
		// The editor suspends until its chunk arrives; an awaited act lets React commit the retry.
		await act(async () => {
			render(<ApplicationsIndex />);
		});
		expect(await screen.findByText('Applications editor')).toBeTruthy();
	});
});
