/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

import { NewApplication } from './index';

beforeAll(() => {
	// Radix primitives rely on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

describe('NewApplication', () => {
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
