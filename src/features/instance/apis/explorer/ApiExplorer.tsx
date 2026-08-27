import { Badge } from '@/components/ui/badge';
import { authStore } from '@/features/auth/store/authStore';
import { EndpointList } from '@/features/instance/apis/explorer/EndpointList';
import { OperationDetail } from '@/features/instance/apis/explorer/OperationDetail';
import { ApiAuth, AuthMethod, isAuthorized } from '@/features/instance/apis/explorer/request';
import {
	ExplorerEntitySettings,
	readEntitySettings,
	writeEntitySettings,
} from '@/features/instance/apis/explorer/settings';
import { LoginController, MintOutcome, SettingsPanel } from '@/features/instance/apis/explorer/SettingsPanel';
import {
	buildEndpointTree,
	buildServerOptions,
	flattenOperations,
	operationMatchesFilter,
} from '@/features/instance/apis/explorer/spec';
import { OpenApiSpec } from '@/features/instance/apis/explorer/types';
import {
	maxSidebarWidth,
	MIN_SIDEBAR_WIDTH,
	useResizableSidebar,
} from '@/features/instance/apis/explorer/useResizableSidebar';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { cn } from '@/lib/cn';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

// Stable reference for "no explicit credential" so downstream memoized children don't re-render when a
// credential is withheld (server mismatch).
const COOKIE_AUTH: ApiAuth = { type: 'cookie' };

/**
 * The custom Harper API explorer: a searchable operation list beside a detail pane, with an
 * "Authorize" view for server + auth. The token-minting callbacks come from the parent (`APIDocs`) so
 * the auth-client coupling stays there and this tree stays presentational.
 */
export function ApiExplorer(
	{ spec, baseURL, entityId, onSessionMint, onCredentialMint }: {
		spec: OpenApiSpec | undefined;
		baseURL: string | null;
		entityId: string;
		onSessionMint: () => Promise<string>;
		// Null when no direct instance URL is provable, which withholds the password fallback.
		onCredentialMint: ((credentials: { username: string; password: string }) => Promise<string>) | null;
	},
) {
	const allOperations = useMemo(() => flattenOperations(spec), [spec]);
	const serverOptions = useMemo(() => buildServerOptions(spec, baseURL), [spec, baseURL]);
	const [filter, setFilter] = useState('');
	const [view, setView] = useState<'operation' | 'settings'>('operation');
	const [authorizeTab, setAuthorizeTab] = useState<'docs' | 'try'>('docs');
	const [selectedId, setSelectedId] = useState<string | undefined>(() => allOperations[0]?.id);

	// Opening Authorize from the sidebar lands on Documentation; a deep-link from an auth-required
	// operation lands on the actionable "Try it out" log-in view.
	const openAuthorize = (targetTab: 'docs' | 'try') => {
		setAuthorizeTab(targetTab);
		setView('settings');
	};

	// Server + auth selections persist per entity in sessionStorage (this browser tab only), so
	// credentials never cross entities and are cleared when the tab closes. Ephemeral navigation state
	// (filter, selected endpoint, which pane is open) is deliberately not persisted.
	const [entitySettings, setEntitySettings] = useState(() => readEntitySettings(entityId));
	const updateEntitySettings = (patch: Partial<ExplorerEntitySettings>) => {
		writeEntitySettings(entityId, patch);
		setEntitySettings(prev => ({ ...prev, ...patch }));
	};

	const method: AuthMethod = entitySettings.method ?? 'login';
	const auth: ApiAuth = entitySettings.auth ?? { type: 'cookie' };
	// The server "Try it out" targets; a credential is stamped with it on apply and only sent back to it.
	const activeServer = serverOptions.find(s => s.url === entitySettings.server)?.url
		?? serverOptions[0]?.url
		?? baseURL;

	// Mint race guard: each mint captures an attempt id; only the latest, on a still-mounted panel,
	// may apply its token. Clearing authorization or unmounting bumps the id so an in-flight mint that
	// resolves afterwards can't silently re-authorize.
	const attemptRef = useRef(0);
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			attemptRef.current++;
		};
	}, []);
	const [loginStatus, setLoginStatus] = useState<'idle' | 'pending' | 'error'>('idle');
	const [loginError, setLoginError] = useState<string | null>(null);
	const [authRevocation, setAuthRevocation] = useState(0);
	// Revocation is the one clear that beats live typing, so it has to be this entity's: the store's
	// signal names no entity, and every explorer hears every sign-out. Comparing against the last epoch
	// we acted on keeps an unrelated sign-out a no-op, and makes the two callers below idempotent.
	// Baselined by the effect below rather than here — a `useRef` initializer is evaluated on every
	// render, and reading the epoch parses localStorage, which a sidebar drag would do per mousemove.
	const observedEpochRef = useRef(0);
	const noteRevocation = () => {
		const epoch = authStore.getExplorerAuthEpoch(entityId);
		if (epoch === observedEpochRef.current) {
			return;
		}
		observedEpochRef.current = epoch;
		setAuthRevocation(n => n + 1);
	};

	// A sign-out in another tab changes the shared generation. Re-read from storage (the bootstrap
	// reconciler strips revoked credentials there) rather than assuming this entity was the one signed
	// out, and cancel any in-flight mint. The render-time generation check below is the real guard, so
	// this is only about reflecting it promptly.
	useEffect(() => {
		observedEpochRef.current = authStore.getExplorerAuthEpoch(entityId);
		return authStore.onExplorerAuthInvalidated(entityId, () => {
			attemptRef.current++;
			setEntitySettings(readEntitySettings(entityId));
			setLoginStatus('idle');
			setLoginError(null);
			noteRevocation();
		});
	}, [entityId]);

	const runMint = async (mint: () => Promise<string>): Promise<MintOutcome> => {
		const attempt = ++attemptRef.current;
		// Stamp the mint with the entity's sign-out epoch; a sign-out (this tab or another) advances it
		// so a mint resolving after logout can't write the old user's token back.
		const epoch = authStore.getExplorerAuthEpoch(entityId);
		setLoginStatus('pending');
		setLoginError(null);
		try {
			const token = await mint();
			// Superseded by a newer attempt or unmounted — that owner manages the status; leave it alone.
			if (!mountedRef.current || attempt !== attemptRef.current) {
				return 'discarded';
			}
			// Signed out (this tab or another) while the mint was in flight — drop the token and clear the
			// pending state rather than writing the old user's token back.
			if (authStore.getExplorerAuthEpoch(entityId) !== epoch) {
				setLoginStatus('idle');
				noteRevocation();
				return 'discarded';
			}
			if (typeof token !== 'string' || token === '') {
				setLoginError('The instance did not return a usable token.');
				setLoginStatus('error');
				return 'failed';
			}
			// A minted token belongs to the instance the mint client talks to — Studio's computed URL for
			// this entity — NOT to whatever server the spec's picker currently names. Stamping the trusted
			// server means selecting a foreign declared server withholds the token instead of sending it there.
			updateEntitySettings({
				method: 'login',
				auth: { type: 'bearer', token },
				authServer: baseURL ?? undefined,
				authGeneration: authStore.getExplorerAuthEpoch(entityId),
			});
			setLoginStatus('idle');
			return 'applied';
		} catch (error) {
			if (!mountedRef.current || attempt !== attemptRef.current) {
				return 'discarded';
			}
			setLoginError(error instanceof Error ? error.message : 'Log in failed.');
			setLoginStatus('error');
			return 'failed';
		}
	};

	const login: LoginController = {
		status: loginStatus,
		error: loginError,
		revocation: authRevocation,
		runSession: () => runMint(onSessionMint),
		runCredentials: onCredentialMint ? credentials => runMint(() => onCredentialMint(credentials)) : null,
	};

	// Any explicit auth change invalidates a mint that's still in flight, so a slow session mint can't
	// resolve later and overwrite the credential the user just chose.
	const selectMethod = (next: AuthMethod) => {
		attemptRef.current++;
		if (next === 'cookie') {
			updateEntitySettings({ method: 'cookie', auth: { type: 'cookie' }, authServer: undefined });
		} else if (next === 'basic') {
			updateEntitySettings({
				method: 'basic',
				auth: auth.type === 'basic' ? auth : { type: 'basic', username: '', password: '' },
			});
		} else if (next === 'bearer') {
			updateEntitySettings({
				method: 'bearer',
				auth: auth.type === 'bearer' ? auth : { type: 'bearer', token: '' },
			});
		} else if (method === 'login' && auth.type === 'bearer') {
			// Re-selecting Login while already logged in keeps the minted token (and its authServer stamp).
			updateEntitySettings({ method: 'login' });
		} else {
			// Otherwise Login starts logged-out — a bearer from the Bearer tab is not a login credential.
			updateEntitySettings({ method: 'login', auth: { type: 'cookie' }, authServer: undefined });
		}
		setLoginStatus('idle');
		setLoginError(null);
	};

	const applyBasic = (username: string, password: string) => {
		attemptRef.current++;
		updateEntitySettings({
			method: 'basic',
			auth: { type: 'basic', username, password },
			authServer: activeServer ?? undefined,
			authGeneration: authStore.getExplorerAuthEpoch(entityId),
		});
	};
	const applyBearer = (token: string) => {
		attemptRef.current++;
		updateEntitySettings({
			method: 'bearer',
			auth: { type: 'bearer', token },
			authServer: activeServer ?? undefined,
			authGeneration: authStore.getExplorerAuthEpoch(entityId),
		});
	};
	const clearAuth = () => {
		attemptRef.current++;
		setLoginStatus('idle');
		setLoginError(null);
		// Keep the user on their chosen method; just drop the credential it carries.
		const cleared: ApiAuth = method === 'basic'
			? { type: 'basic', username: '', password: '' }
			: method === 'bearer'
			? { type: 'bearer', token: '' }
			: { type: 'cookie' };
		updateEntitySettings({ auth: cleared, authServer: undefined });
	};

	const setSelectedServer = (url: string) => updateEntitySettings({ server: url });

	const [copyServer] = useCopyToClipboard(activeServer ?? '');

	// The credential is stamped with the server it was authorized against (see applyBasic/applyBearer and
	// the mint) and is sent only when the active server still matches — so switching or recomputing the
	// active server can't send a token/credential to a different one. Plain string compare (no URL
	// parsing) so a relative or unusual base URL can't strip a valid credential.
	const credentialMatchesServer = entitySettings.authServer != null && entitySettings.authServer === activeServer;
	// A credential stamped under an older sign-out generation was revoked while this tab wasn't watching
	// (it was reloaded or closed) — sessionStorage outlives a reload, so this comparison is the guard.
	const credentialIsCurrent = entitySettings.authGeneration === authStore.getExplorerAuthEpoch(entityId);
	const effectiveAuth: ApiAuth = isAuthorized(auth) && credentialMatchesServer && credentialIsCurrent
		? auth
		: COOKIE_AUTH;
	const authorized = isAuthorized(effectiveAuth);

	// Width drives a CSS variable applied only at lg+; below that the sidebar stacks full-width.
	const { width: sidebarWidth, isResizing, startResizing, handleKeyDown } = useResizableSidebar();
	const sidebarWidthVar = { '--api-sidebar-width': `${sidebarWidth}px` } as CSSProperties;

	const filteredOperations = useMemo(
		() => allOperations.filter(op => operationMatchesFilter(op, filter)),
		[allOperations, filter],
	);
	const filteredTree = useMemo(() => buildEndpointTree(filteredOperations), [filteredOperations]);

	const selectedOp = allOperations.find(op => op.id === selectedId) ?? allOperations[0];

	function selectOperation(id: string) {
		setSelectedId(id);
		setView('operation');
	}

	return (
		// On lg this is a fixed-height app-shell (its parent sets the height): the header takes its
		// natural space and the two-pane row fills the rest, so the sidebar reaches the viewport bottom
		// exactly and the panes scroll internally instead of the page — no page-plus-tree double scroll.
		<div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">
			<header className="flex min-w-0 flex-col lg:shrink-0">
				<div className="flex items-center gap-2">
					<h1 className="font-radioGrotesk truncate text-2xl">{spec?.info?.title ?? 'API Explorer'}</h1>
					{spec?.info?.version && <Badge variant="secondary">v{spec.info.version}</Badge>}
				</div>
				{spec?.info?.description && <p className="text-muted-foreground mt-1 text-sm">{spec.info.description}</p>}
			</header>

			{allOperations.length === 0
				? (
					<div className="border-border text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
						This spec doesn&apos;t define any endpoints yet.
					</div>
				)
				: (
					<div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
						<aside
							style={sidebarWidthVar}
							// overflow-y-clip (not -hidden) so a broken min-h-0 chain can't paint the tree over the
							// detail pane, while the resize handle still extends horizontally into the gap.
							className="relative w-full shrink-0 overflow-y-clip lg:h-full lg:min-h-0 lg:w-[var(--api-sidebar-width)]"
						>
							<EndpointList
								tree={filteredTree}
								totalCount={allOperations.length}
								filteredCount={filteredOperations.length}
								isFiltering={filter.trim() !== ''}
								selectedId={view === 'operation' ? selectedOp?.id : undefined}
								onSelect={selectOperation}
								filter={filter}
								onFilterChange={setFilter}
								method={method}
								authorized={authorized}
								settingsActive={view === 'settings'}
								onOpenSettings={() => openAuthorize('docs')}
							/>
							{
								/* Drag (or focus + Arrow keys) to resize the sidebar — lg+ only; below that it stacks
								   full-width. The grab zone straddles the aside's right edge into the inter-pane gap so
								   it doesn't fight the tree's scrollbar; only the thin centered line shows (on
								   hover / drag / focus). */
							}
							<div
								role="separator"
								tabIndex={0}
								aria-orientation="vertical"
								aria-label="Resize sidebar"
								aria-valuenow={sidebarWidth}
								aria-valuemin={MIN_SIDEBAR_WIDTH}
								aria-valuemax={maxSidebarWidth(window.innerWidth)}
								onMouseDown={startResizing}
								onKeyDown={handleKeyDown}
								className="group absolute top-0 right-0 bottom-0 z-40 hidden w-4 translate-x-1/2 cursor-col-resize outline-none lg:block"
							>
								<div
									className={cn(
										'absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 transition-colors',
										'group-hover:bg-violet-400/60 dark:group-hover:bg-violet-500/60 group-focus-visible:bg-violet-500/80',
										isResizing && 'bg-violet-400/60 dark:bg-violet-500/60',
									)}
								/>
							</div>
						</aside>

						<main className="min-w-0 flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pb-6">
							{view === 'settings'
								? (
									<SettingsPanel
										spec={spec}
										method={method}
										auth={auth}
										authorized={authorized}
										tab={authorizeTab}
										onTabChange={setAuthorizeTab}
										onSelectMethod={selectMethod}
										onApplyBasic={applyBasic}
										onApplyBearer={applyBearer}
										onClearAuth={clearAuth}
										login={login}
										serverOptions={serverOptions}
										activeServer={activeServer ?? undefined}
										onServerChange={setSelectedServer}
										onCopyServer={copyServer}
									/>
								)
								: selectedOp
								? (
									<OperationDetail
										// Re-mount per operation so all try-it-out inputs reset cleanly on selection change.
										key={selectedOp.id}
										op={selectedOp}
										spec={spec}
										baseURL={activeServer ?? null}
										auth={effectiveAuth}
										authorized={authorized}
										onOpenAuthorize={() => openAuthorize('try')}
									/>
								)
								: <p className="text-muted-foreground text-sm">Select an endpoint to see its documentation.</p>}
						</main>
					</div>
				)}
		</div>
	);
}
