/**
 * @vitest-environment jsdom
 */
/*
 The delivery-tier flow on the shared secrets dialogs (enabled by `delivery`): picking
 process.env vs scoped, seeing the matching access example, and reporting the choice through
 onSet. Uses fireEvent (no @testing-library/user-event in this repo) and the Radix DOM polyfills.
*/
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SecretRow, SecretsManager } from './SecretsManager';

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderManager(overrides: Partial<Parameters<typeof SecretsManager>[0]> = {}) {
	const onSet = vi.fn().mockResolvedValue(undefined);
	const rows: SecretRow[] = overrides.rows ?? [];
	render(
		<SecretsManager
			rows={rows}
			onSelectName={vi.fn()}
			addDescription="add"
			editDescription="edit"
			onSet={onSet}
			delivery={true}
			{...overrides}
		/>,
	);
	return { onSet };
}

/** The rendered access example (the only <pre><code> on screen at a time). */
function exampleText(): string {
	return document.querySelector('pre code')?.textContent ?? '';
}

describe('SecretsManager delivery tier — Add', () => {
	async function openAddWithKeyValue() {
		fireEvent.click(screen.getByRole('button', { name: /add/i }));
		fireEvent.change(await screen.findByLabelText('Key'), { target: { value: 'NEW_KEY' } });
		fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'a value' } });
	}

	it('defaults to scoped and shows the secrets-accessor example', async () => {
		renderManager();
		await openAddWithKeyValue();

		// Scoped is the default: the example destructures the accessor, never touches process.env.
		expect(exampleText()).toContain("import { secrets } from 'harper';");
		expect(exampleText()).toContain('const { NEW_KEY } = secrets;');
		expect(exampleText()).not.toContain('process.env');
	});

	it('submits a scoped secret with its pending grants', async () => {
		const { onSet } = renderManager();
		await openAddWithKeyValue();

		// Add one grant (the PendingGrantsInput "Add" button, distinct from "Add Secret").
		fireEvent.change(screen.getByPlaceholderText('application name'), { target: { value: 'my-app' } });
		fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
		expect(screen.getByText('my-app')).toBeTruthy();

		const submit = screen.getByRole('button', { name: /add secret/i });
		await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
		fireEvent.click(submit);

		await waitFor(() => expect(onSet).toHaveBeenCalledTimes(1));
		expect(onSet).toHaveBeenCalledWith('NEW_KEY', 'a value', { processEnv: false, grants: ['my-app'] });
	});

	it('switching to environment variable swaps the example and submits processEnv', async () => {
		const { onSet } = renderManager();
		await openAddWithKeyValue();

		// [scoped, processEnv] in DOM order; select the second.
		fireEvent.click(screen.getAllByRole('radio')[1]);
		await waitFor(() => expect(exampleText()).toContain('process.env.NEW_KEY'));
		expect(exampleText()).not.toContain('secrets');

		const submit = screen.getByRole('button', { name: /add secret/i });
		await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
		fireEvent.click(submit);

		await waitFor(() => expect(onSet).toHaveBeenCalledTimes(1));
		expect(onSet).toHaveBeenCalledWith('NEW_KEY', 'a value', { processEnv: true, grants: undefined });
	});
});

describe('SecretsManager delivery tier — Edit', () => {
	it('preselects a processEnv row and re-saves it as processEnv', async () => {
		const { onSet } = renderManager({
			rows: [{ name: 'TOKEN', processEnv: true }],
			selectedName: 'TOKEN',
		});

		// The edit dialog opens for the selected row; a process.env secret shows that example.
		await waitFor(() => expect(exampleText()).toContain('process.env.TOKEN'));
		expect(exampleText()).not.toContain('import { secrets }');

		fireEvent.change(await screen.findByLabelText('New value'), { target: { value: 'rotated' } });
		const save = screen.getByRole('button', { name: /^save$/i });
		await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
		fireEvent.click(save);

		await waitFor(() => expect(onSet).toHaveBeenCalledTimes(1));
		expect(onSet).toHaveBeenCalledWith('TOKEN', 'rotated', { processEnv: true });
	});

	it('a scoped row shows the accessor example and the live grants editor', async () => {
		renderManager({
			rows: [{ name: 'DB_PASSWORD', processEnv: false }],
			selectedName: 'DB_PASSWORD',
			renderEditExtras: () => <div data-testid="live-grants">grants</div>,
		});
		await waitFor(() => expect(exampleText()).toContain('const { DB_PASSWORD } = secrets;'));
		// Tier matches what's stored (scoped, unchanged), so the live grant_secret editor is safe.
		expect(screen.getByTestId('live-grants')).toBeTruthy();
	});

	it('hides the live grants editor on an unsaved switch from processEnv to scoped', async () => {
		renderManager({
			rows: [{ name: 'TOKEN', processEnv: true }],
			selectedName: 'TOKEN',
			renderEditExtras: () => <div data-testid="live-grants">grants</div>,
		});
		await waitFor(() => expect(exampleText()).toContain('process.env.TOKEN'));
		// processEnv secret: no scoped grants slot at all.
		expect(screen.queryByTestId('live-grants')).toBeNull();

		// Flip to scoped without saving: the secret is still processEnv server-side, so a live
		// grant_secret would be rejected — show the "save first" hint instead of the editor.
		fireEvent.click(screen.getAllByRole('radio')[0]);
		await waitFor(() => expect(exampleText()).toContain('const { TOKEN } = secrets;'));
		expect(screen.queryByTestId('live-grants')).toBeNull();
		expect(screen.getByText(/save this as a scoped secret first/i)).toBeTruthy();
	});
});
