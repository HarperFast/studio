/** @vitest-environment jsdom */
import { ApiExplorer } from '@/features/instance/apis/explorer/ApiExplorer';
import { OpenApiSpec } from '@/features/instance/apis/explorer/types';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

function storedAuth() {
	return JSON.parse(sessionStorage.getItem('ApiExplorerSettings')!)['ins-test'];
}

/**
 * Force React's Scheduler to split a commit from the passive effects it schedules, and return the
 * undo. `shouldYieldToHost()` compares `performance.now()` against a 5ms frame budget, so an
 * always-advancing clock yields between every task — the ordering a loaded machine produces, and why
 * #1655 only reproduced in full-suite runs.
 */
function yieldBetweenReactTasks(): () => void {
	const realNow = performance.now.bind(performance);
	let drift = 0;
	performance.now = () => realNow() + (drift += 10);
	return () => {
		performance.now = realNow;
	};
}

// The Try-it-out tab (not exercised here) is the only thing that mounts Monaco; mock it so importing
// the tree never pulls the editor in, matching how the repo's other component tests handle Monaco.
vi.mock('@/lib/monaco/MonacoEditor', () => ({ Editor: () => null, MonacoEditor: () => null }));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));

const spec: OpenApiSpec = {
	info: { title: 'Test API', version: '1.0.0' },
	paths: {
		'/leaderboard/': { get: { description: 'list scores', responses: { '200': { description: 'ok' } } } },
		'/game/{id}': {
			get: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: {} },
			post: {
				parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
				requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
				// Marks this operation as requiring auth, so the deep-link to Authorize appears.
				security: [{ bearerAuth: [] }],
				responses: {},
			},
		},
	},
	components: {
		securitySchemes: { basicAuth: { type: 'http', scheme: 'basic' }, bearerAuth: { type: 'http', scheme: 'bearer' } },
	},
};

function renderExplorer(overrides: {
	onSessionMint?: () => Promise<string>;
	onCredentialMint?: ((c: { username: string; password: string }) => Promise<string>) | null;
} = {}) {
	return render(
		<ApiExplorer
			spec={spec}
			baseURL="http://localhost:9926"
			entityId="ins-test"
			onSessionMint={overrides.onSessionMint ?? (() => Promise.resolve('session-tok'))}
			onCredentialMint={overrides.onCredentialMint === undefined
				? (() => Promise.resolve('cred-tok'))
				: overrides.onCredentialMint}
		/>,
	);
}

describe('ApiExplorer', () => {
	// Radix reads these pointer APIs jsdom doesn't implement (see AGENTS.md).
	beforeAll(() => {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.scrollIntoView = () => {};
	});
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
	afterEach(cleanup);

	it('renders the resource → path → method hierarchy and the first operation by default', () => {
		renderExplorer();
		expect(screen.getByText('leaderboard')).toBeTruthy();
		expect(screen.getByText('game')).toBeTruthy();
		// The initially-selected GET /leaderboard/ shows its documentation (Responses only appears there).
		expect(screen.getByText('Responses')).toBeTruthy();
	});

	it('takes over the detail pane with Server + Authorization docs when Authorize is clicked', () => {
		renderExplorer();
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		expect(screen.getByRole('heading', { name: 'Server' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Authorization' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Documentation' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Try it out' })).toBeTruthy();
		// Documentation is the default tab; the method selector lives under Try it out.
		expect(screen.queryByRole('button', { name: 'Cookie' })).toBeNull();
		// The operation docs are replaced, not merely appended.
		expect(screen.queryByText('Responses')).toBeNull();
	});

	it('shows the method selector and session log-in under Try it out, defaulting to Log in (locked)', () => {
		renderExplorer();
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		// Method selector (Log in is the default) plus the primary session log-in action.
		expect(screen.getByRole('button', { name: 'Basic' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Bearer token' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Cookie' })).toBeTruthy();
		expect(screen.getByRole('button', { name: /authorize with your current session/i })).toBeTruthy();
		expect(screen.getByText('Not signed in — authenticated requests will be rejected.')).toBeTruthy();
	});

	it('session log-in mints a token, unlocks, and stores the token (never a password)', async () => {
		const onSessionMint = vi.fn().mockResolvedValue('session-tok');
		renderExplorer({ onSessionMint });
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.click(screen.getByRole('button', { name: /authorize with your current session/i }));

		expect(await screen.findByText(/Credential set —/)).toBeTruthy();
		expect(onSessionMint).toHaveBeenCalledTimes(1);

		const stored = sessionStorage.getItem('ApiExplorerSettings')!;
		expect(JSON.parse(stored)['ins-test']).toEqual(expect.objectContaining({
			method: 'login',
			auth: { type: 'bearer', token: 'session-tok' },
			authServer: 'http://localhost:9926',
		}));
		expect(stored).not.toContain('password');
	});

	it('logs in with typed credentials via the credential fallback', async () => {
		const onCredentialMint = vi.fn().mockResolvedValue('cred-token');
		renderExplorer({ onCredentialMint });
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'bob' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
		fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));

		expect(await screen.findByText(/Credential set —/)).toBeTruthy();
		expect(onCredentialMint).toHaveBeenCalledWith({ username: 'bob', password: 'pw' });
		expect(storedAuth().auth).toEqual({ type: 'bearer', token: 'cred-token' });
	});

	it('discards a late session mint when the user switched methods while it was pending', async () => {
		let resolveMint!: (token: string) => void;
		const onSessionMint = vi.fn(() =>
			new Promise<string>(res => {
				resolveMint = res;
			})
		);
		renderExplorer({ onSessionMint });
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.click(screen.getByRole('button', { name: /authorize with your current session/i }));
		// Switch to Basic and apply a credential while the session mint is still pending.
		fireEvent.click(screen.getByRole('button', { name: 'Basic' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
		fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
		// The stale mint resolves last — it must not overwrite the Basic credential.
		await act(async () => {
			resolveMint('late-session-token');
			await Promise.resolve();
		});
		expect(storedAuth()).toEqual(expect.objectContaining({
			method: 'basic',
			auth: { type: 'basic', username: 'alice', password: '' },
			authServer: 'http://localhost:9926',
		}));
	});

	it('does not present a manually pasted Bearer token as a session login when Log in is selected', () => {
		renderExplorer();
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.click(screen.getByRole('button', { name: 'Bearer token' }));
		fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'pasted' } });
		fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
		expect(screen.getByText(/Credential set —/)).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
		expect(screen.queryByText(/Credential set —/)).toBeNull();
		expect(storedAuth()).toEqual(expect.objectContaining({ method: 'login', auth: { type: 'cookie' } }));
	});

	it('surfaces a log-in error without unlocking', async () => {
		const onSessionMint = vi.fn().mockRejectedValue(new Error('proxy unauthorized'));
		renderExplorer({ onSessionMint });
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.click(screen.getByRole('button', { name: /authorize with your current session/i }));

		expect(await screen.findByText('proxy unauthorized')).toBeTruthy();
		expect(screen.queryByText(/Credential set —/)).toBeNull();
	});

	it('hides the password fallback when no direct instance URL is available', () => {
		renderExplorer({ onCredentialMint: null });
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		expect(screen.getByRole('button', { name: /authorize with your current session/i })).toBeTruthy();
		expect(screen.queryByText('Or use different credentials')).toBeNull();
	});

	it('an auth-required operation deep-links to the Try-it-out log-in view', () => {
		renderExplorer();
		// Exactly one POST in the spec, and it declares security.
		fireEvent.click(screen.getByRole('button', { name: 'post' }));
		fireEvent.click(screen.getByRole('button', { name: /auth required — authorize/i }));
		// Landed on the Authorize panel's Try it out tab with the log-in action ready.
		expect(screen.getByRole('button', { name: /authorize with your current session/i })).toBeTruthy();
	});

	it('Clear empties the Basic form and drops the stored credential', () => {
		renderExplorer();
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.click(screen.getByRole('button', { name: 'Basic' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'carol' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
		fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
		expect(screen.getByText(/Credential set —/)).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
		expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('');
		expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
		expect(storedAuth().auth).toEqual({ type: 'basic', username: '', password: '' });
	});

	it('clears the login password after re-authenticating while already authorized', async () => {
		const onCredentialMint = vi.fn().mockResolvedValue('tok-1');
		renderExplorer({ onCredentialMint });
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'dave' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw1' } });

		// A clear deferred to an effect is still outstanding here, and lands on the next keystroke instead.
		const restoreClock = yieldBetweenReactTasks();
		try {
			fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
			expect(await screen.findByText(/Credential set —/)).toBeTruthy();
			expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('');
			expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
		} finally {
			restoreClock();
		}

		// Re-authenticate (already authorized) with different credentials — the password must still clear.
		onCredentialMint.mockResolvedValue('tok-2');
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'erin' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw2' } });
		fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));
		await waitFor(() => expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe(''));
		expect(storedAuth().auth).toEqual({ type: 'bearer', token: 'tok-2' });
	});

	it('leaves credentials retyped while a superseded mint was settling alone', async () => {
		let resolveMint!: (token: string) => void;
		const onCredentialMint = vi.fn(() =>
			new Promise<string>(res => {
				resolveMint = res;
			})
		);
		renderExplorer({ onCredentialMint });
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
		fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));

		// The method buttons stay live while a mint is pending, so re-picking one supersedes it.
		fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'bob' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 's3cret' } });
		await act(async () => {
			resolveMint('stale-token');
			await Promise.resolve();
		});

		expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('bob');
		expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('s3cret');
		expect((screen.getByRole('button', { name: 'Authorize' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('withholds a minted token when the active server is not the instance it was minted for', async () => {
		// Pre-select a foreign declared server, then mint: the token is stamped for the trusted instance
		// URL (baseURL), so it must not be sent to the selected server.
		sessionStorage.setItem(
			'ApiExplorerSettings',
			JSON.stringify({ 'ins-test': { server: 'https://foreign.example' } }),
		);
		const specWithServers: OpenApiSpec = { ...spec, servers: [{ url: 'https://foreign.example' }] };
		render(
			<ApiExplorer
				spec={specWithServers}
				baseURL="http://localhost:9926"
				entityId="ins-test"
				onSessionMint={() => Promise.resolve('minted-for-instance')}
				onCredentialMint={null}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.click(screen.getByRole('button', { name: /authorize with your current session/i }));

		await waitFor(() => expect(storedAuth().auth).toEqual({ type: 'bearer', token: 'minted-for-instance' }));
		// Stamped to the instance, not the foreign selection — so the credential is withheld.
		expect(storedAuth().authServer).toBe('http://localhost:9926');
		expect(screen.queryByText(/Credential set —/)).toBeNull();
	});

	it('clears the stored credential when another tab signs the entity out (cross-tab)', async () => {
		renderExplorer();
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.click(screen.getByRole('button', { name: /authorize with your current session/i }));
		expect(await screen.findByText(/Credential set —/)).toBeTruthy();

		// Another tab signs ins-test out: it advances the durable generation, then this tab gets the event.
		act(() => {
			const bumped = JSON.stringify({ 'ins-test': 99 });
			localStorage.setItem('Studio:ExplorerAuthEpoch', bumped);
			window.dispatchEvent(new StorageEvent('storage', { key: 'Studio:ExplorerAuthEpoch', newValue: bumped }));
		});
		// The credential no longer matches the current generation, so it is not sent.
		expect(screen.queryByText(/Credential set —/)).toBeNull();
	});

	it('empties the typed credentials when another tab signs the entity out', () => {
		renderExplorer();
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });

		act(() => {
			const bumped = JSON.stringify({ 'ins-test': 99 });
			localStorage.setItem('Studio:ExplorerAuthEpoch', bumped);
			window.dispatchEvent(new StorageEvent('storage', { key: 'Studio:ExplorerAuthEpoch', newValue: bumped }));
		});

		// Unlike the post-mint clear, this one must beat whatever the user was mid-way through typing.
		expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('');
		expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
	});

	it('leaves the typed credentials alone when a different entity is signed out', () => {
		renderExplorer();
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });

		// The store's signal names no entity, so every explorer hears every sign-out. This one is not
		// ins-test's, and must not blank a form the user is still typing into.
		act(() => {
			const bumped = JSON.stringify({ 'ins-other': 7 });
			localStorage.setItem('Studio:ExplorerAuthEpoch', bumped);
			window.dispatchEvent(new StorageEvent('storage', { key: 'Studio:ExplorerAuthEpoch', newValue: bumped }));
		});

		expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('alice');
		expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('hunter2');
	});

	it('leaves the typed credentials alone for an unrelated sign-out when this entity was signed out before', () => {
		// The epoch this entity mounts on is not zero, so the baseline has to be read rather than assumed:
		// otherwise the first unrelated sign-out reads as a change and blanks the form.
		localStorage.setItem('Studio:ExplorerAuthEpoch', JSON.stringify({ 'ins-test': 4 }));
		renderExplorer();
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });

		act(() => {
			const bumped = JSON.stringify({ 'ins-test': 4, 'ins-other': 7 });
			localStorage.setItem('Studio:ExplorerAuthEpoch', bumped);
			window.dispatchEvent(new StorageEvent('storage', { key: 'Studio:ExplorerAuthEpoch', newValue: bumped }));
		});

		expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('alice');
		expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('hunter2');
	});

	it('leaves the retyped credentials alone when a mint cancelled by a sign-out settles', async () => {
		let resolveMint!: (token: string) => void;
		const onCredentialMint = vi.fn(() =>
			new Promise<string>(res => {
				resolveMint = res;
			})
		);
		renderExplorer({ onCredentialMint });
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
		fireEvent.click(screen.getByRole('button', { name: 'Authorize' }));

		act(() => {
			const bumped = JSON.stringify({ 'ins-test': 99 });
			localStorage.setItem('Studio:ExplorerAuthEpoch', bumped);
			window.dispatchEvent(new StorageEvent('storage', { key: 'Studio:ExplorerAuthEpoch', newValue: bumped }));
		});
		expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');

		// The user retypes, and only then does the mint the sign-out cancelled settle. Its continuation
		// must not empty the fresh form under them.
		fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'bob' } });
		fireEvent.change(screen.getByLabelText('Password'), { target: { value: 's3cret' } });
		await act(async () => {
			resolveMint('stale-token');
			await Promise.resolve();
		});

		expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('bob');
		expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('s3cret');
	});

	it('discards a session mint that resolves after the entity was signed out', async () => {
		let resolveMint!: (token: string) => void;
		const onSessionMint = vi.fn(() =>
			new Promise<string>(res => {
				resolveMint = res;
			})
		);
		renderExplorer({ onSessionMint });
		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.click(screen.getByRole('button', { name: /authorize with your current session/i }));

		// Full logout while the mint is pending bumps the entity's auth epoch.
		const { authStore } = await import('@/features/auth/store/authStore');
		act(() => authStore.setUserForIdAndKey('ins-test', 'ins-test-fqdn', null));
		await act(async () => {
			resolveMint('late-token');
			await Promise.resolve();
		});
		// The stale token must not be written back after sign-out.
		expect(JSON.parse(sessionStorage.getItem('ApiExplorerSettings') ?? '{}')['ins-test']).toBeUndefined();
	});

	it('renders a resize separator wired to the persisted sidebar width', () => {
		const { container } = renderExplorer();
		const separator = screen.getByRole('separator', { name: 'Resize sidebar' });
		expect(separator.getAttribute('aria-valuenow')).toBe('320');
		expect(separator.getAttribute('aria-valuemin')).toBe('240');
		expect(separator.getAttribute('aria-valuemax')).toBe('512'); // half of jsdom's 1024 innerWidth
		const aside = container.querySelector('aside');
		expect(aside?.style.getPropertyValue('--api-sidebar-width')).toBe('320px');
	});

	it('binds a path-parameter input into the built request URL', () => {
		renderExplorer();
		// The single POST is unambiguous; its Monaco body editor is mocked out above, so this
		// exercises the path-input → built-request wiring.
		fireEvent.click(screen.getByRole('button', { name: 'post' }));
		// Radix tabs use automatic (focus-based) activation.
		fireEvent.focus(screen.getByRole('tab', { name: 'Try it out' }));
		fireEvent.change(screen.getByPlaceholderText('id'), { target: { value: '42' } });
		expect(screen.getByText('http://localhost:9926/game/42')).toBeTruthy();
	});
});
