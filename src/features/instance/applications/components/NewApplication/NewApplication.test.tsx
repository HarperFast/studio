/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const importState = vi.hoisted(() => ({
	importFailure: undefined as { title: string; message: string; deploymentId?: string } | undefined,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	useRouteContext: () => ({ organization: { name: 'Acme' } }),
	useParams: () => ({ organizationId: 'org-1', instanceId: 'ins-1' }),
	Link: ({ children, to }: { children?: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({ rootEntries: [{ name: 'taken-app', path: 'taken-app', project: 'taken-app', entries: [] }] }),
}));
vi.mock('./useCreateFromTemplate', () => ({
	useCreateFromTemplate: () => ({ isCreatingFromTemplate: false, createFromTemplate: vi.fn() }),
}));
vi.mock('./useImportApplication', () => ({
	useImportApplication: () => ({
		isImportingApplication: false,
		importApplication: vi.fn(),
		importFailure: importState.importFailure,
	}),
}));
vi.mock('./useCheckCLI', () => ({ useCheckCLI: () => ({ checkCLI: vi.fn() }) }));
// These read the instance's SSH keys and auth, which aren't what these tests exercise.
vi.mock('./ImportAuthorization', () => ({ ImportAuthorization: () => null }));
vi.mock('./useCLISteps', () => ({ useCLISteps: () => [] }));
vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', () => ({
	useBranchedDatabasesAvailable: () => false,
}));
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useStagedDeploymentsAvailable: () => false,
}));

import { NewApplication } from './index';

beforeAll(() => {
	// Radix primitives rely on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	importState.importFailure = undefined;
});

function button(name: RegExp) {
	return screen.getByRole('button', { name }) as HTMLButtonElement;
}

async function switchTo(tab: RegExp) {
	await act(async () => {
		// Radix tabs activate on mousedown, not click.
		fireEvent.mouseDown(screen.getByRole('tab', { name: tab }), { button: 0 });
	});
}

describe('NewApplication', () => {
	it('keeps Import disabled on every visit while the repository is empty', async () => {
		render(<NewApplication />);
		await waitFor(() => expect(button(/Create from Template/).disabled).toBe(false));

		for (const visit of [1, 2]) {
			await switchTo(/Import/);
			await waitFor(() => expect(button(/Import Application/).disabled, `visit ${visit}`).toBe(true));
			await switchTo(/Templates/);
			await waitFor(() => expect(button(/Create from Template/).disabled, `visit ${visit}`).toBe(false));
		}
	});

	it('enables the CLI steps after leaving an empty import', async () => {
		render(<NewApplication />);
		await switchTo(/Import/);
		await waitFor(() => expect(button(/Import Application/).disabled).toBe(true));

		// The CLI tab has no fields to register, so nothing but the switch itself re-validates.
		await switchTo(/CLI/);

		await waitFor(() => expect(button(/I Have Completed These Steps/).disabled).toBe(false));
	});

	it('does not flag the untouched repository URL when arriving with an invalid name', async () => {
		render(<NewApplication />);
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'my app' } });
		});

		await switchTo(/Import/);

		await waitFor(() => expect(button(/Import Application/).disabled).toBe(true));
		expect(screen.queryByText('Please enter a URL or package reference.')).toBeNull();
	});

	it('stops the application name at the 75 characters the form accepts, and says so there', () => {
		render(<NewApplication />);
		const name = screen.getByLabelText('Name') as HTMLInputElement;
		expect(name.maxLength).toBe(75);

		fireEvent.change(name, { target: { value: 'a'.repeat(75) } });
		expect(screen.getByText('Maximum 75 characters reached.')).toBeTruthy();
	});

	it('explains a refused application name when Enter is pressed in it', async () => {
		render(<NewApplication />);
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'my app' } });
		});
		await act(async () => {
			fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Enter' });
		});

		expect(await screen.findByText('Can only contain letters, numbers, dashes and underscores.')).toBeTruthy();
	});

	it.each([
		['a space', 'my app', 'Can only contain letters, numbers, dashes and underscores.'],
		['a name already in use', 'taken-app', 'That application name is already in use!'],
	])('explains why an application name with %s is refused once the field is left', async (_, name, message) => {
		render(<NewApplication />);
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
		});
		expect(screen.queryByText(message)).toBeNull();

		await act(async () => {
			fireEvent.blur(screen.getByLabelText('Name'));
		});

		expect(await screen.findByText(message)).toBeTruthy();
		expect((screen.getByRole('button', { name: /Create from Template/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("keeps a failed import's reason beside the Import button", async () => {
		importState.importFailure = {
			title: 'Failed to import acme',
			message: 'This repository has no package.json in its root folder.',
		};
		render(<NewApplication />);

		await switchTo(/Import/);

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Failed to import acme');
		expect(alert.textContent).toContain('This repository has no package.json in its root folder.');
		expect(screen.queryByRole('link', { name: 'Manage SSH keys' })).toBeNull();
	});

	it('links a failed private-repository import to SSH keys', async () => {
		importState.importFailure = {
			title: 'Failed to import acme',
			message: 'Failed to deploy private repository ssh://github.com/acme/widgets.git: SSH access failed.',
		};
		render(<NewApplication />);

		await switchTo(/Import/);

		expect((await screen.findByRole('link', { name: 'Manage SSH keys' })).getAttribute('href'))
			.toBe('/org-1/instance/ins-1/config/ssh-keys');
	});

	it('links a failed import to the deployment record it left', async () => {
		importState.importFailure = {
			title: 'Failed to stage acme',
			message: 'Not every node staged it',
			deploymentId: 'd1',
		};
		render(<NewApplication />);

		await switchTo(/Import/);

		expect((await screen.findByRole('alert')).textContent).toContain('Failed to stage acme');
		expect(screen.getByRole('link', { name: "View this deployment's record" }).getAttribute('href'))
			.toBe('/org-1/instance/ins-1/config/deployments/d1');
	});
});
