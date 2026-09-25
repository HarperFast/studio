/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	useRouteContext: () => ({ organization: { name: 'Acme' } }),
}));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({
	useEditorView: () => ({ rootEntries: [{ name: 'taken-app', path: 'taken-app', project: 'taken-app', entries: [] }] }),
}));
vi.mock('./useCreateFromTemplate', () => ({
	useCreateFromTemplate: () => ({ isCreatingFromTemplate: false, createFromTemplate: vi.fn() }),
}));
vi.mock('./useImportApplication', () => ({
	useImportApplication: () => ({ isImportingApplication: false, importApplication: vi.fn() }),
}));
vi.mock('./useCheckCLI', () => ({ useCheckCLI: () => ({ checkCLI: vi.fn() }) }));
// These read the instance's SSH keys and auth, which aren't what these tests exercise.
vi.mock('./ImportAuthorization', () => ({ ImportAuthorization: () => null }));
vi.mock('./useCLISteps', () => ({ useCLISteps: () => [] }));

import { NewApplication } from './index';

beforeAll(() => {
	// Radix primitives rely on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

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
});
