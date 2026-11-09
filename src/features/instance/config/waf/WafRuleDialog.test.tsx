/**
 * @vitest-environment jsdom
 */
import { WafRuleDialog } from '@/features/instance/config/waf/WafRuleDialog';
import { WafOperationError, type WafRule, WafRuleChangedError } from '@/integrations/api/instance/waf/waf';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { add, edit } = vi.hoisted(() => ({
	add: { mutate: vi.fn(), isPending: false, error: null as Error | null },
	edit: { mutate: vi.fn(), isPending: false, error: null as Error | null },
}));

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'clu-1' }),
}));
vi.mock('@/integrations/api/instance/waf/waf', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/waf/waf')>()),
	useAddWafRule: () => add,
	useEditWafRule: () => edit,
}));

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	add.error = null;
	edit.error = null;
});

function type(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function submit(name: RegExp) {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }));
	});
}

const JA4_RULE: WafRule = {
	id: 'ja4-bots',
	enabled: true,
	priority: 5,
	phase: 'request',
	description: 'Challenge known bad TLS fingerprints',
	match: { ja4: ['t13d1516h2_8daaf6152771_e5627efa2ab1'] },
	action: 'challenge',
	provenance: { origin: 'human', approver: 'admin' },
};

describe('WafRuleDialog', () => {
	it('adds the rule the form describes', async () => {
		render(
			<WafRuleDialog
				target={{ kind: 'add', existingIds: new Set() }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		type('ID', 'block-admin');
		type('Description', 'Block admin paths');
		type('Path starts with', '/admin/');
		type('Response status', '404');
		await submit(/Add Rule/);

		expect(add.mutate).toHaveBeenCalledTimes(1);
		expect(add.mutate.mock.calls[0][0]).toEqual({
			instanceClient: {},
			entityId: 'clu-1',
			rule: {
				id: 'block-admin',
				phase: 'request',
				description: 'Block admin paths',
				enabled: true,
				action: 'block',
				blockStatus: 404,
				shadow: false,
				match: { path: { prefix: '/admin/' } },
			},
		});
	});

	it('names a taken id and a missing condition beside their inputs, and sends nothing', async () => {
		render(
			<WafRuleDialog
				target={{ kind: 'add', existingIds: new Set(['block-admin']) }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		type('ID', 'block-admin');
		await submit(/Add Rule/);

		expect(screen.getByText('A rule with this id already exists.')).toBeTruthy();
		expect(screen.getByText(/Add at least one condition/)).toBeTruthy();
		expect(add.mutate).not.toHaveBeenCalled();
	});

	it('adds header conditions, with no value for a presence check', async () => {
		render(
			<WafRuleDialog
				target={{ kind: 'add', existingIds: new Set() }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		type('ID', 'debug-header');
		fireEvent.click(screen.getByRole('button', { name: /Add header condition/ }));
		type('header 1 name', 'x-debug');
		fireEvent.change(screen.getByLabelText('header 1 comparison'), { target: { value: 'exists' } });
		expect(screen.queryByLabelText('header 1 value')).toBeNull();
		await submit(/Add Rule/);

		expect(add.mutate.mock.calls[0][0].rule.match).toEqual({ headers: [{ name: 'x-debug', op: 'exists' }] });
	});

	it("shows Harper's own validation message in the dialog", () => {
		add.error = new WafOperationError(
			'Invalid WAF rule: match.path.regex: invalid or unsupported regex "(a)\\\\1": invalid escape sequence: \\1',
		);
		render(
			<WafRuleDialog
				target={{ kind: 'add', existingIds: new Set() }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		expect(screen.getByText(/Invalid WAF rule: match\.path\.regex: invalid or unsupported regex/)).toBeTruthy();
	});

	it('edits a rule Harper skips without losing what the form has no inputs for', async () => {
		render(
			<WafRuleDialog
				target={{ kind: 'edit', rule: JA4_RULE }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		expect(screen.getByText(/Harper stores this rule but skips it: The challenge action is not enforced yet\./))
			.toBeTruthy();
		expect((screen.getByLabelText('When a request matches') as HTMLSelectElement).value).toBe('challenge');
		expect(screen.queryByLabelText('ID')).toBeNull();

		type('Priority', '6');
		await submit(/Save Rule/);

		expect(edit.mutate).toHaveBeenCalledTimes(1);
		const { loaded, patch } = edit.mutate.mock.calls[0][0];
		expect(loaded).toBe(JA4_RULE);
		expect(patch).toEqual({ priority: 6 });
	});

	it('tells the page to refresh when a save fails, since the rule it showed is likely stale', async () => {
		const onFailed = vi.fn();
		edit.mutate.mockImplementation((_args, options: { onError: () => void }) => options.onError());
		render(
			<WafRuleDialog
				target={{ kind: 'edit', rule: JA4_RULE }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={onFailed}
				onReload={vi.fn()}
			/>,
		);
		type('Priority', '7');
		await submit(/Save Rule/);
		expect(onFailed).toHaveBeenCalledTimes(1);
	});

	it('offers to load the current rule after a stale-rule refusal, since retrying the same copy cannot work', () => {
		const onReload = vi.fn();
		edit.error = new WafRuleChangedError(
			'WAF rule ja4-bots changed since this page loaded it. Review it and try again.',
		);
		render(
			<WafRuleDialog
				target={{ kind: 'edit', rule: JA4_RULE }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={onReload}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'Load the current rule' }));
		expect(onReload).toHaveBeenCalledWith('ja4-bots');
	});

	it('offers no reload for any other failure', () => {
		edit.error = new WafOperationError('Invalid WAF rule: match must specify at least one condition');
		render(
			<WafRuleDialog
				target={{ kind: 'edit', rule: JA4_RULE }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		expect(screen.queryByRole('button', { name: 'Load the current rule' })).toBeNull();
	});

	it('closes without writing when nothing changed', async () => {
		const onClose = vi.fn();
		render(
			<WafRuleDialog
				target={{ kind: 'edit', rule: JA4_RULE }}
				onClose={onClose}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		await submit(/Save Rule/);
		expect(edit.mutate).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('shows no action for a stored rule that has none, and asks for one before saving', async () => {
		const { action: _, ...noAction } = JA4_RULE;
		render(
			<WafRuleDialog
				target={{ kind: 'edit', rule: noAction }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		expect((screen.getByLabelText('When a request matches') as HTMLSelectElement).value).toBe('');
		await submit(/Save Rule/);
		expect(screen.getByText('Choose what the rule does when a request matches.')).toBeTruthy();
		expect(edit.mutate).not.toHaveBeenCalled();
	});

	it('offers watch-only only for actions that can enforce', () => {
		render(
			<WafRuleDialog
				target={{ kind: 'add', existingIds: new Set() }}
				onClose={vi.fn()}
				onSaved={vi.fn()}
				onFailed={vi.fn()}
				onReload={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText('Watch only')).toBeTruthy();
		fireEvent.change(screen.getByLabelText('When a request matches'), { target: { value: 'log' } });
		expect(screen.queryByLabelText('Watch only')).toBeNull();
	});
});
