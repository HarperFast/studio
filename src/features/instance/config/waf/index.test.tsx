/**
 * @vitest-environment jsdom
 */
import { ConfigWafIndex } from '@/features/instance/config/waf';
import { type WafRule, WafRuleChangedError, type WafRuleList } from '@/integrations/api/instance/waf/waf';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { state, toggleRule, dropRule, setMode, refetch, queryOptionsSeen } = vi.hoisted(() => ({
	state: {
		canManage: true,
		signedIn: true,
		version: '5.3.4' as string | undefined,
		list: undefined as WafRuleList | undefined,
		editError: null as Error | null,
		configuration: { waf: {} } as unknown,
		entityId: 'clu-1',
	},
	toggleRule: vi.fn((_args: unknown, options?: { onSuccess?: () => void; onSettled?: () => void }) => {
		options?.onSuccess?.();
		options?.onSettled?.();
	}),
	dropRule: vi.fn(),
	setMode: vi.fn(),
	refetch: vi.fn(async (): Promise<{ data: WafRuleList | undefined; isError?: boolean }> => ({ data: state.list })),
	queryOptionsSeen: [] as Array<{ queryKey: readonly unknown[]; enabled?: boolean }>,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-query')>()),
	useQuery: (options: { queryKey: readonly unknown[]; enabled?: boolean }) => {
		queryOptionsSeen.push(options);
		if (options.queryKey[0] === 'registration_info') {
			return { data: state.version === undefined ? undefined : { version: state.version }, isError: false };
		}
		if (options.queryKey[0] === 'get_configuration') {
			return { data: state.configuration };
		}
		return { data: state.list, isFetching: false, isError: false, refetch };
	},
}));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: state.entityId }),
}));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: state.signedIn ? { username: 'dev' } : null }) }));
vi.mock('@/integrations/api/instance/waf/waf', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/waf/waf')>()),
	useToggleWafRule: () => ({ mutate: toggleRule, isPending: false }),
	useDropWafRule: () => ({ mutate: dropRule, isPending: false }),
	useSetWafMode: () => ({ mutate: setMode, isPending: false }),
	useAddWafRule: () => ({ mutate: vi.fn(), isPending: false, error: null }),
	useEditWafRule: () => ({ mutate: vi.fn(), isPending: false, error: state.editError }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), loading: vi.fn(), info: vi.fn() } }));

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	// Radix RadioGroup measures with ResizeObserver, which jsdom lacks.
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

function starterRule(overrides: Partial<WafRule> = {}): WafRule {
	return {
		id: 'fabric-baseline-v1-trace-track-methods',
		enabled: true,
		priority: 130,
		phase: 'request',
		description: 'Observe HTTP TRACE and TRACK requests',
		match: { method: ['TRACE', 'TRACK'] },
		action: 'block',
		blockStatus: 403,
		shadow: true,
		scope: { clusters: ['clu-1'] },
		provenance: { origin: 'managed-feed', source: 'fabric-baseline-v1' },
		...overrides,
	};
}

function card(id: string) {
	return within(screen.getByRole('listitem', { name: `Firewall rule ${id}` }));
}

function listQueryEnabled() {
	return queryOptionsSeen.filter((options) => options.queryKey[1] === 'list_waf_rules').at(-1)?.enabled;
}

beforeEach(() => {
	state.canManage = true;
	state.signedIn = true;
	state.version = '5.3.4';
	state.list = { available: true, rules: [] };
	state.configuration = { waf: {} };
	state.entityId = 'clu-1';
	state.editError = null;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	queryOptionsSeen.length = 0;
});

describe('ConfigWafIndex', () => {
	it('drops an open draft when the page switches to another instance', () => {
		const { rerender } = render(<ConfigWafIndex />);
		fireEvent.click(screen.getByRole('button', { name: /Add Rule/ }));
		expect(screen.getByRole('dialog')).toBeTruthy();

		state.entityId = 'clu-2';
		rerender(<ConfigWafIndex />);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('never asks for the rules as a user who is not a super user', () => {
		state.canManage = false;
		render(<ConfigWafIndex />);
		expect(screen.getByText('Only super users can view or change the firewall.')).toBeTruthy();
		expect(listQueryEnabled()).toBe(false);
	});

	it('waits for sign-in to resolve instead of flashing the denial at a super user', () => {
		state.canManage = false;
		state.signedIn = false;
		render(<ConfigWafIndex />);
		expect(screen.queryByText(/Only super users/)).toBeNull();
		expect(listQueryEnabled()).toBe(false);
	});

	it('says which Harper version it needs instead of listing on an older cluster', () => {
		state.version = '5.1.4';
		render(<ConfigWafIndex />);
		expect(screen.getByText(/needs Harper 5\.2 or later\. This cluster runs 5\.1\.4/)).toBeTruthy();
		expect(listQueryEnabled()).toBe(false);
	});

	it("explains a Harper that doesn't have the firewall turned on", () => {
		state.list = { available: false };
		render(<ConfigWafIndex />);
		expect(screen.getByText(/doesn't have the firewall turned on/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Add Rule/ })).toBeNull();
	});

	it('marks a starter rule as Fabric’s and lists what it matches and does', () => {
		state.list = { available: true, rules: [starterRule()] };
		render(<ConfigWafIndex />);
		const rule = card('fabric-baseline-v1-trace-track-methods');
		expect(rule.getByText('Fabric starter rule')).toBeTruthy();
		expect(rule.getByText('Watch-only')).toBeTruthy();
		expect(rule.getByText('Method TRACE or TRACK')).toBeTruthy();
		expect(rule.getByText('Block with 403')).toBeTruthy();
		expect(rule.getByText('Added by Fabric when the cluster was created')).toBeTruthy();
	});

	it('switches a watch-only starter rule to blocking by changing only its watch-only flag', async () => {
		state.list = { available: true, rules: [starterRule()] };
		render(<ConfigWafIndex />);
		fireEvent.click(card('fabric-baseline-v1-trace-track-methods').getByRole('button', { name: 'Start blocking' }));
		await waitFor(() => expect(refetch).toHaveBeenCalled());
		expect(toggleRule).toHaveBeenCalledWith(
			{ instanceClient: {}, entityId: 'clu-1', loaded: starterRule(), patch: { shadow: false } },
			expect.objectContaining({ onSuccess: expect.any(Function), onSettled: expect.any(Function) }),
		);
	});

	it('offers to watch an enforced rule again', () => {
		state.list = { available: true, rules: [starterRule({ shadow: false })] };
		render(<ConfigWafIndex />);
		const rule = card('fabric-baseline-v1-trace-track-methods');
		expect(rule.getByText('Blocking')).toBeTruthy();
		expect(rule.getByRole('button', { name: 'Watch only' })).toBeTruthy();
	});

	it('treats a rule with no action as one Harper skips, not as a log rule', () => {
		state.list = { available: true, rules: [starterRule({ id: 'no-action', action: undefined, provenance: null })] };
		render(<ConfigWafIndex />);
		const rule = card('no-action');
		expect(rule.getByText('Not enforced')).toBeTruthy();
		expect(rule.getByText(/It has no action, so Harper skips it\./)).toBeTruthy();
		expect(rule.queryByText('Logs only')).toBeNull();
	});

	it('reloads a rule that changed meanwhile into the open editor', async () => {
		state.list = { available: true, rules: [starterRule()] };
		state.editError = new WafRuleChangedError('WAF rule x changed since this page loaded it. Review it and try again.');
		render(<ConfigWafIndex />);
		fireEvent.click(card('fabric-baseline-v1-trace-track-methods').getByRole('button', { name: 'Edit' }));
		const description = () => (screen.getByLabelText('Description') as HTMLInputElement).value;
		expect(description()).toBe('Observe HTTP TRACE and TRACK requests');

		state.list = { available: true, rules: [starterRule({ description: 'Changed elsewhere' })] };
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Load the current rule' }));
		});
		await waitFor(() => expect(description()).toBe('Changed elsewhere'));
	});

	it('leaves the editor as it is when the reload itself fails', async () => {
		state.list = { available: true, rules: [starterRule()] };
		state.editError = new WafRuleChangedError('WAF rule x changed since this page loaded it. Review it and try again.');
		render(<ConfigWafIndex />);
		fireEvent.click(card('fabric-baseline-v1-trace-track-methods').getByRole('button', { name: 'Edit' }));
		refetch.mockResolvedValueOnce({ data: { available: true, rules: [] }, isError: true });
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Load the current rule' }));
		});
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Load the current rule' })).toBeTruthy();
	});

	it("doesn't reopen an edit the reader closed while the reload was loading", async () => {
		state.list = { available: true, rules: [starterRule()] };
		state.editError = new WafRuleChangedError('WAF rule x changed since this page loaded it. Review it and try again.');
		render(<ConfigWafIndex />);
		fireEvent.click(card('fabric-baseline-v1-trace-track-methods').getByRole('button', { name: 'Edit' }));
		let finish: (value: { data: WafRuleList | undefined }) => void = () => undefined;
		refetch.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
		fireEvent.click(screen.getByRole('button', { name: 'Load the current rule' }));
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		fireEvent.click(screen.getByRole('button', { name: /Add Rule/ }));
		expect(screen.getByRole('heading', { name: 'Add firewall rule' })).toBeTruthy();

		await act(async () => {
			finish({ data: { available: true, rules: [starterRule({ description: 'Changed elsewhere' })] } });
		});
		expect(screen.getByRole('heading', { name: 'Add firewall rule' })).toBeTruthy();
	});

	it('starts the form over on a reload even when the rule came back unchanged', async () => {
		state.list = { available: true, rules: [starterRule()] };
		state.editError = new WafRuleChangedError('WAF rule x changed since this page loaded it. Review it and try again.');
		render(<ConfigWafIndex />);
		fireEvent.click(card('fabric-baseline-v1-trace-track-methods').getByRole('button', { name: 'Edit' }));
		fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'My draft' } });

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Load the current rule' }));
		});
		await waitFor(() =>
			expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe(
				'Observe HTTP TRACE and TRACK requests',
			)
		);
	});

	it('says nothing about a reload that comes back after the editor closed', async () => {
		state.list = { available: true, rules: [starterRule()] };
		state.editError = new WafRuleChangedError('WAF rule x no longer exists.');
		render(<ConfigWafIndex />);
		fireEvent.click(card('fabric-baseline-v1-trace-track-methods').getByRole('button', { name: 'Edit' }));
		let finish: (value: { data: WafRuleList | undefined }) => void = () => undefined;
		refetch.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
		fireEvent.click(screen.getByRole('button', { name: 'Load the current rule' }));
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await act(async () => {
			finish({ data: { available: true, rules: [] } });
		});
		expect(toast.info).not.toHaveBeenCalled();
	});

	it('closes the editor when the rule it was reloading is gone', async () => {
		state.list = { available: true, rules: [starterRule()] };
		state.editError = new WafRuleChangedError('WAF rule x no longer exists.');
		render(<ConfigWafIndex />);
		fireEvent.click(card('fabric-baseline-v1-trace-track-methods').getByRole('button', { name: 'Edit' }));

		state.list = { available: true, rules: [] };
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Load the current rule' }));
		});
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('says a rule Harper skips is not enforced, and offers no watch-only switch for it', () => {
		state.list = { available: true, rules: [starterRule({ id: 'bots', action: 'challenge', provenance: null })] };
		render(<ConfigWafIndex />);
		const rule = card('bots');
		expect(rule.getByText('Not enforced')).toBeTruthy();
		expect(rule.getByText(/The challenge action is not enforced yet\./)).toBeTruthy();
		expect(rule.queryByRole('button', { name: /Start blocking|Watch only/ })).toBeNull();
	});

	it('has no watch-only switch for a log rule, which never enforces', () => {
		state.list = { available: true, rules: [starterRule({ id: 'log-it', action: 'log', provenance: null })] };
		render(<ConfigWafIndex />);
		const rule = card('log-it');
		expect(rule.getByText('Logs only')).toBeTruthy();
		expect(rule.queryByRole('button', { name: /Start blocking|Watch only/ })).toBeNull();
	});

	it('lists rules in the order the engine resolves them', () => {
		state.list = {
			available: true,
			rules: [
				starterRule({ id: 'b', priority: 20 }),
				starterRule({ id: 'c', priority: undefined }),
				starterRule({ id: 'a', priority: 20 }),
			],
		};
		render(<ConfigWafIndex />);
		expect(screen.getAllByRole('listitem', { name: /^Firewall rule / }).map((item) => item.getAttribute('aria-label')))
			.toEqual([
				'Firewall rule c',
				'Firewall rule a',
				'Firewall rule b',
			]);
	});

	it("sets only the mode it was given, and states the node's config fallback", () => {
		state.configuration = { waf: { mode: 'monitor', scoreThreshold: 25 } };
		render(<ConfigWafIndex />);
		expect(screen.getByText(/this node's config runs the firewall in Monitor mode with a score threshold of 25/))
			.toBeTruthy();
		const setModeButton = screen.getByRole('button', { name: 'Set mode' }) as HTMLButtonElement;
		expect(setModeButton.disabled).toBe(true);

		fireEvent.click(screen.getByRole('radio', { name: /^Off/ }));
		fireEvent.click(screen.getByRole('button', { name: 'Turn the firewall off' }));
		expect(setMode).not.toHaveBeenCalled();
		expect(screen.getByRole('alertdialog', { name: 'Turn the firewall off?' })).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Turn it off' }));
		expect(setMode).toHaveBeenCalledWith(
			{ instanceClient: {}, entityId: 'clu-1', mode: 'off' },
			expect.anything(),
		);
	});

	it('drops the config fallback sentence once a mode is set, which it would then contradict', () => {
		setMode.mockImplementationOnce((_args: unknown, options: { onSuccess: () => void }) => options.onSuccess());
		render(<ConfigWafIndex />);
		expect(screen.getByText(/If no mode has been set/)).toBeTruthy();

		fireEvent.click(screen.getByRole('radio', { name: /^Monitor/ }));
		fireEvent.click(screen.getByRole('button', { name: 'Set mode' }));
		expect(screen.getByText(/Firewall mode set to monitor from this page/)).toBeTruthy();
		expect(screen.queryByText(/If no mode has been set/)).toBeNull();
	});

	it('sets the threshold alone, and refuses one Harper would reject', () => {
		render(<ConfigWafIndex />);
		const input = screen.getByLabelText('Score threshold');
		const button = () => screen.getByRole('button', { name: 'Set threshold' }) as HTMLButtonElement;

		fireEvent.change(input, { target: { value: '0' } });
		expect(button().disabled).toBe(true);
		expect(screen.getByText('Use a number greater than 0.')).toBeTruthy();

		fireEvent.change(input, { target: { value: '12.5' } });
		fireEvent.click(button());
		expect(setMode).toHaveBeenCalledWith(
			{ instanceClient: {}, entityId: 'clu-1', scoreThreshold: 12.5 },
			expect.anything(),
		);
	});
});
