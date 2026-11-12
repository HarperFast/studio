/** @vitest-environment jsdom */
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelDialog, ModelDialogTarget } from './ModelDialog';

const SECRET = 'sk-live-do-not-show';

const { mutation, toast } = vi.hoisted(() => ({
	mutation: { mutate: vi.fn(), isPending: false, error: null as unknown },
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('./useSaveModelChange', () => ({ useSaveModelChange: () => mutation }));
vi.mock('sonner', () => ({ toast }));

const block = {
	generative: {
		default: { backend: 'openai', apiKey: SECRET, model: 'gpt-x', requestTimeoutMs: 30_000 },
		spare: { backend: 'ollama', model: 'llama3.2' },
	},
};
const instanceParams = { instanceClient: {}, entityId: 'ins-1', entityType: 'instance' } as
	& InstanceClientIdConfig
	& InstanceTypeConfig;
const onClose = vi.fn();
const onSaved = vi.fn();

function open(
	target: ModelDialogTarget,
	kinds = ['embedding', 'generative', 'decision'] as const,
	loaded: Record<string, unknown> = block,
) {
	render(
		<ModelDialog
			target={target}
			block={loaded}
			kinds={kinds}
			instanceParams={instanceParams}
			fabricKeys={undefined}
			onClose={onClose}
			onSaved={onSaved}
		/>,
	);
}

function type(label: string | RegExp, value: string) {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function sentChange() {
	expect(mutation.mutate).toHaveBeenCalledTimes(1);
	return mutation.mutate.mock.calls[0][0].change;
}

beforeEach(() => {
	mutation.mutate.mockReset();
	mutation.isPending = false;
	mutation.error = null;
	onClose.mockReset();
	onSaved.mockReset();
	toast.info.mockReset();
});
afterEach(cleanup);

describe('adding a model', () => {
	it('sends the kind, name and only the fields that were filled in', () => {
		open({ mode: 'add' });
		type('Name', 'mine');
		type('Model', 'nomic-embed-text');
		fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
		expect(sentChange()).toEqual({
			kind: 'embedding',
			name: 'mine',
			entry: { backend: 'ollama', model: 'nomic-embed-text' },
			loaded: undefined,
		});
	});

	it("shows the chosen backend's fields, with the key typed into a password input", () => {
		open({ mode: 'add' });
		type('Kind', 'generative');
		type('Backend', 'anthropic');
		expect(screen.queryByLabelText('Host (optional)')).toBeNull();
		expect(screen.queryByLabelText('Organization (optional)')).toBeNull();
		expect((screen.getByLabelText('API key') as HTMLInputElement).type).toBe('password');
		type('Name', 'claude');
		type('Model', 'claude-x');
		type('API key', '${ANTHROPIC_API_KEY}');
		fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
		expect(sentChange()).toMatchObject({
			kind: 'generative',
			name: 'claude',
			entry: { backend: 'anthropic', model: 'claude-x', apiKey: '${ANTHROPIC_API_KEY}' },
		});
	});

	it('offers an embedding model only the backends that can embed', () => {
		open({ mode: 'add' });
		const backends = [...(screen.getByLabelText('Backend') as HTMLSelectElement).options].map((option) => option.value);
		expect(backends).toEqual(['ollama', 'openai', 'bedrock']);
	});

	it('gives a decision model a generative model to decide with, and no provider fields', () => {
		open({ mode: 'add' });
		type('Kind', 'decision');
		expect(screen.queryByLabelText('Backend')).toBeNull();
		expect(screen.queryByLabelText('Model')).toBeNull();
		const choices = [...(screen.getByLabelText('Generative model') as HTMLSelectElement).options].map((o) => o.value);
		expect(choices).toEqual(['default', 'spare']);
		type('Name', 'route');
		type('Generative model', 'spare');
		fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
		expect(sentChange()).toMatchObject({ kind: 'decision', entry: { backend: 'generative', generative: 'spare' } });
	});

	it('asks which generative model decides when none is named default', () => {
		open({ mode: 'add' }, undefined, { generative: { spare: block.generative.spare } });
		type('Kind', 'decision');
		const choices = [...(screen.getByLabelText('Generative model') as HTMLSelectElement).options];
		expect(choices.map((option) => option.textContent)).toEqual(['Choose a generative model', 'spare']);
		type('Name', 'route');
		fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
		expect(screen.getByText('Choose the generative model that makes the decision.')).toBeTruthy();
		expect(mutation.mutate).not.toHaveBeenCalled();
	});

	it('leaves the generative model unnamed when default is chosen, as Harper reads it', () => {
		open({ mode: 'add' });
		type('Kind', 'decision');
		type('Name', 'route');
		type('Generative model', 'spare');
		type('Generative model', 'default');
		fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
		expect(sentChange().entry).toEqual({ backend: 'generative' });
	});

	it('offers only the kinds this Harper version has', () => {
		open({ mode: 'add' }, ['embedding', 'generative'] as never);
		const kinds = [...(screen.getByLabelText('Kind') as HTMLSelectElement).options].map((option) => option.value);
		expect(kinds).toEqual(['embedding', 'generative']);
	});

	it('says what is wrong, and sends nothing, when the form is not ready', () => {
		open({ mode: 'add' });
		type('Kind', 'generative');
		type('Name', 'default');
		fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
		expect(screen.getByText("A generative model named 'default' already exists.")).toBeTruthy();
		expect(mutation.mutate).not.toHaveBeenCalled();
	});

	it("shows Harper's own error beside the form when it refuses the save", () => {
		mutation.error = {
			response: { data: { error: "config file validation error: 'models.generative.mine.model' must be a string" } },
		};
		open({ mode: 'add' });
		expect(screen.getByText(/'models.generative.mine.model' must be a string/)).toBeTruthy();
	});
});

describe('editing a model', () => {
	const target: ModelDialogTarget = {
		mode: 'edit',
		kind: 'generative',
		name: 'default',
		stored: block.generative.default,
		keyNote: 'Key saved',
	};

	it('never puts a sign-in saved inside the address in the page, and says it is there', () => {
		const stored = { ...block.generative.default, baseUrl: 'https://user:hunter2@llm.example.com/v1' };
		open({ ...target, stored });
		expect((screen.getByLabelText('Base URL (optional)') as HTMLInputElement).value).toBe('https://llm.example.com/v1');
		expect(document.body.innerHTML).not.toContain('hunter2');
		expect(screen.getByText(/includes a sign-in that isn't shown/)).toBeTruthy();
		type('Model', 'gpt-y');
		fireEvent.click(screen.getByRole('button', { name: 'Save Model' }));
		expect(sentChange().entry).toEqual({ ...stored, model: 'gpt-y' });
	});

	it('never puts the saved key in the page', () => {
		open(target);
		expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('');
		expect(document.body.innerHTML).not.toContain(SECRET);
		expect(screen.getByText('Key saved. Leave this empty to keep it.')).toBeTruthy();
	});

	it('fixes the kind and name, which are what apps refer to', () => {
		open(target);
		expect(screen.queryByLabelText('Kind')).toBeNull();
		expect(screen.queryByLabelText('Name')).toBeNull();
	});

	it('sends back the saved key and every setting it has no input for', () => {
		open(target);
		type('Model', 'gpt-y');
		fireEvent.click(screen.getByRole('button', { name: 'Save Model' }));
		expect(sentChange()).toEqual({
			kind: 'generative',
			name: 'default',
			entry: { ...block.generative.default, model: 'gpt-y' },
			loaded: block.generative.default,
		});
	});

	it('asks for a key again once the backend changes', () => {
		open(target);
		type('Backend', 'anthropic');
		fireEvent.click(screen.getByRole('button', { name: 'Save Model' }));
		expect(screen.getByText(/Enter an API key/)).toBeTruthy();
		expect(mutation.mutate).not.toHaveBeenCalled();
	});

	it('writes nothing when nothing was changed', () => {
		open(target);
		fireEvent.click(screen.getByRole('button', { name: 'Save Model' }));
		expect(mutation.mutate).not.toHaveBeenCalled();
		expect(toast.info).toHaveBeenCalledWith('No changes to save');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('reports the save to the page once it lands', () => {
		open(target);
		type('Model', 'gpt-y');
		fireEvent.click(screen.getByRole('button', { name: 'Save Model' }));
		mutation.mutate.mock.calls[0][1].onSuccess({ saved: 1, notRunning: 0 });
		expect(onSaved).toHaveBeenCalledWith({ saved: 1, notRunning: 0 }, { kind: 'generative', name: 'default' });
	});
});
